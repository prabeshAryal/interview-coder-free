import fs from "node:fs"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import { app, BrowserWindow } from "electron"
import { GoogleGenAI, Part } from "@google/genai"
import Store from "electron-store"
import {
  DEFAULT_MODEL,
  getFallbackChain,
  isRateLimitError,
  isNetworkError,
  getErrorMessage,
  RETRY_CONFIG,
  RESPONSE_LANGUAGE,
  GeminiModel
} from "./config"

const store = new Store()

let genAI: GoogleGenAI | null = null

// Track the last successfully used model to emit to renderer
let lastUsedModel: string = DEFAULT_MODEL

// Conversation history for context preservation
interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

// Shared conversation history - persists until Ctrl+R reset
let conversationHistory: ConversationMessage[] = []
const MAX_HISTORY_MESSAGES = 10 // Keep last 10 exchanges for context

// Export function to clear history (called on reset)
export function clearConversationHistory() {
  conversationHistory = []
  console.log("Conversation history cleared")
}

// Export function to add to history
export function addToConversationHistory(role: "user" | "assistant", content: string) {
  conversationHistory.push({
    role,
    content,
    timestamp: Date.now()
  })
  // Trim if too long
  if (conversationHistory.length > MAX_HISTORY_MESSAGES * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES * 2)
  }
}

// Export function to get history summary for prompts
export function getConversationContext(): string {
  if (conversationHistory.length === 0) return ""
  
  const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES)
  return recentHistory.map(msg => {
    const role = msg.role === "user" ? "User" : "Assistant"
    // Truncate long messages for context
    const content = msg.content.length > 500 ? msg.content.substring(0, 500) + "..." : msg.content
    return `${role}: ${content}`
  }).join("\n\n")
}

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()!

    if (!genAI) {
      const apiKey = store.get("GEMINI_API_KEY") as string
      if (!apiKey) {
        // We will handle the missing key error when we try to make a request, 
        // or we can throw here if we want to fail early. 
        // But throwing here might crash the app initialization if this is called early.
        // However, ProcessingHelper is initialized in main.ts.
        // Let's just log it here and throw in callAIWithFallback.
        console.log("GEMINI_API_KEY not found in store.")
      } else {
        genAI = new GoogleGenAI({ apiKey })
      }
    }
  }

  // Helper function to wrap Gemini calls with fallback and logging
  private async callAIWithFallback(
    context: string,
    systemInstruction: string,
    promptParts: Part[],
    jsonMode: boolean = false,
    signal?: AbortSignal
  ): Promise<string> {
    if (!genAI) {
      // Try to initialize again in case key was set after startup
      const apiKey = store.get("GEMINI_API_KEY") as string
      if (apiKey) {
        genAI = new GoogleGenAI({ apiKey })
      } else {
        throw new Error("Please set your API Key in Settings.")
      }
    }

    // Get user's preferred model from store, default to configured default
    const userModel = (store.get("GEMINI_MODEL") as string as GeminiModel) || DEFAULT_MODEL
    
    // Get the fallback chain starting from user's preferred model
    const models = getFallbackChain(userModel)
    
    let lastError: any
    let successfulModel: string | null = null

    for (const modelName of models) {
      if (signal?.aborted) {
        throw new Error("CanceledError")
      }

      try {
        console.log(`[Gemini Request - ${context}] Attempting with model: ${modelName}`)

        const response = await genAI.models.generateContent({
          model: modelName,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: jsonMode ? "application/json" : "text/plain"
          },
          contents: [
            {
              role: "user",
              parts: promptParts
            }
          ]
        })

        const responseText = response.text
        console.log(`[Gemini Response - ${context}] Success with ${modelName}`)
        
        // Track successful model for UI display
        successfulModel = modelName
        lastUsedModel = modelName
        
        // Emit model used event to renderer
        const mainWindow = this.deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("model-used", modelName)
        }
        
        return responseText || ""
      } catch (error: any) {
        const errorMessage = error.message || String(error)
        console.warn(`[Gemini Error - ${context}] Model ${modelName} failed:`, errorMessage)
        lastError = error

        // Check if it's a rate limit error - try next model silently
        if (isRateLimitError(error)) {
          console.log(`[Gemini Fallback - ${context}] Rate limit hit on ${modelName}, trying next model...`)
          
          // Small delay before trying next model
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
          continue
        }

        // Check if it's a network error - retry with delay
        if (isNetworkError(error)) {
          console.log(`[Gemini Retry - ${context}] Network error on ${modelName}, retrying...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
          
          // Retry the same model once for network errors
          try {
            const retryResponse = await genAI.models.generateContent({
              model: modelName,
              config: {
                systemInstruction: systemInstruction,
                responseMimeType: jsonMode ? "application/json" : "text/plain"
              },
              contents: [
                {
                  role: "user",
                  parts: promptParts
                }
              ]
            })
            
            const retryText = retryResponse.text
            console.log(`[Gemini Retry Success - ${context}] Success with ${modelName} after retry`)
            
            successfulModel = modelName
            lastUsedModel = modelName
            
            const mainWindow = this.deps.getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("model-used", modelName)
            }
            
            return retryText || ""
          } catch (retryError: any) {
            console.warn(`[Gemini Retry Failed - ${context}] Model ${modelName} failed on retry:`, retryError.message)
            lastError = retryError
            continue
          }
        }

        // For other errors, continue to next model
        continue
      }
    }

    // All models failed - throw a user-friendly error
    const userMessage = getErrorMessage(lastError)
    console.error(`[Gemini Error - ${context}] All models failed. Last error:`, lastError?.message)
    throw new Error(userMessage)
  }

  /**
   * Get the last model that was successfully used
   */
  public getLastUsedModel(): string {
    return lastUsedModel
  }


  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    // Always return a high number of credits
    return 999
  }

  private async getLanguage(): Promise<string> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return "python"

    try {
      await this.waitForInitialization(mainWindow)
      const language = await mainWindow.webContents.executeJavaScript(
        "window.__LANGUAGE__"
      )

      if (
        typeof language !== "string" ||
        language === undefined ||
        language === null
      ) {
        console.warn("Language not properly initialized")
        return "python"
      }

      return language
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // Credits check is bypassed - we always have enough credits

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          screenshotQueue.map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString("base64")
          }))
        )

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (result.error?.includes("API Key out of credits")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.OUT_OF_CREDITS
            )
          } else if (result.error?.includes("Gemini API key not found")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              "Gemini API key not found. Please set the API Key in Settings."
            )
          } else {
            // Check if we recently sent this error to avoid jitter
            const errorMessage = result.error || "Unknown error"
            // Only send if it's different or enough time has passed (simple debounce)
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              errorMessage
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (error.name === "CanceledError") {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      if (extraScreenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue
          ].map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString("base64")
          }))
        )
        console.log(
          "Combined screenshots for processing:",
          screenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (error.name === "CanceledError") {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const imageDataList = screenshots.map((screenshot) => screenshot.data)
      const mainWindow = this.deps.getMainWindow()
      const language = await this.getLanguage()

      const promptParts: Part[] = [
        { text: `Extract the coding problem statement AND the relevant code snippet from these images. The problem might be stated as a question (e.g., "What will this code output?"). Ensure you include the actual code itself, not just the question. Programming Language: ${language}. Respond in ${RESPONSE_LANGUAGE}. Return the combined problem statement and code.` },
        ...imageDataList.map(image => ({
          inlineData: {
            data: image,
            mimeType: "image/jpeg"
          }
        }))
      ];

      const problemInfo = await this.callAIWithFallback(
        "Extract",
        "You are an expert coding assistant.",
        promptParts,
        false,
        signal
      );

      // Store problem info in AppState
      this.deps.setProblemInfo({ problem_statement: problemInfo })

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          { problem_statement: problemInfo }
        )

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal)
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue()
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          )
          return { success: true, data: solutionsResult.data }
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          )
        }
      }

      return { success: false, error: "Main window not available" }
    } catch (error: any) {
      if (error.name === "CanceledError") {
        return {
          success: false,
          error: "Processing was canceled by the user."
        }
      }

      console.error("Processing error details:", {
        message: error.message,
        code: error.code,
        response: error.response,
      })

      return { success: false, error: error.message }
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      // Get conversation context for continuity
      const conversationContext = getConversationContext()
      const contextSection = conversationContext 
        ? `\n\nPrevious conversation context (for reference):\n${conversationContext}\n\n---\n`
        : ""

      const systemPrompt = `You are an expert coding assistant. Analyze the provided problem and code snippet.
Respond ENTIRELY in ${RESPONSE_LANGUAGE}. Be concise and focus on the essential information.
${contextSection ? "Use the previous conversation context to provide continuity if the current question relates to earlier discussions." : ""}

Instructions:
1.  If possible, provide a very brief, direct answer to the problem first (e.g., the final output value or a direct yes/no).
2.  Then, provide the detailed explanation, code, and complexity analysis.
3.  Generate a response in JSON format containing the following fields:
    - "short_answer": (Nullable string) A very brief, direct answer to the problem, if applicable (e.g., the program's output). Use null if not applicable. MUST be in ${RESPONSE_LANGUAGE}.
    - "code": (String) The corrected or proposed code solution in ${language}. Comments within the code MUST be in ${RESPONSE_LANGUAGE}.
    - "thoughts": (Array of strings) Explanation of your thought process, step-by-step. MUST be in ${RESPONSE_LANGUAGE}.
    - "time_complexity": (String) Time complexity analysis (e.g., "O(n)"). MUST be in ${RESPONSE_LANGUAGE}.
    - "space_complexity": (String) Space complexity analysis (e.g., "O(1)"). MUST be in ${RESPONSE_LANGUAGE}.

If the problem statement is incomplete or unclear, set "short_answer" to null, explain the issue clearly in the "thoughts" field (in ${RESPONSE_LANGUAGE}), and set "code" to an empty string or a relevant placeholder comment (in ${RESPONSE_LANGUAGE}).`;

      const userPrompt = `${contextSection}Problem and Code:\n\`\`\`\n${problemInfo.problem_statement}\n\`\`\`\n\nGenerate the JSON response as described in the system prompt.`;

      // Add user message to history
      conversationHistory.push({
        role: "user",
        content: `Problem: ${problemInfo.problem_statement}`,
        timestamp: Date.now()
      })

      const rawContent = await this.callAIWithFallback(
        "Generate",
        systemPrompt,
        [{ text: userPrompt }],
        true,
        signal
      );
      let structuredData = {
        short_answer: null as string | null,
        code: "",
        thoughts: ["Failed to parse AI response."],
        time_complexity: "N/A",
        space_complexity: "N/A"
      };

      try {
        let jsonToParse = rawContent.trim();
        // Check if the response is wrapped in markdown code fences and extract JSON
        if (jsonToParse.startsWith("```json") && jsonToParse.endsWith("```")) {
          jsonToParse = jsonToParse.substring(7, jsonToParse.length - 3).trim();
        } else if (jsonToParse.startsWith("```") && jsonToParse.endsWith("```")) {
          // Handle generic ``` ``` fences as well
          jsonToParse = jsonToParse.substring(3, jsonToParse.length - 3).trim();
        }

        // Attempt to parse the (potentially extracted) JSON
        const parsed = JSON.parse(jsonToParse);
        // Basic validation to ensure it has the expected structure (including optional short_answer)
        if (parsed && typeof parsed === 'object' && 'code' in parsed && 'thoughts' in parsed && 'time_complexity' in parsed && 'space_complexity' in parsed) {
          structuredData = {
            short_answer: parsed.short_answer || null,
            code: parsed.code || "",
            thoughts: Array.isArray(parsed.thoughts) ? parsed.thoughts : [String(parsed.thoughts || `No thoughts provided in ${RESPONSE_LANGUAGE}.`)],
            time_complexity: parsed.time_complexity || "N/A",
            space_complexity: parsed.space_complexity || "N/A"
          };
        } else {
          // If parsing succeeds but structure is wrong, put raw content in thoughts
          structuredData.thoughts = [`Received unexpected structure from AI (in ${RESPONSE_LANGUAGE}):`, rawContent];
          structuredData.code = `// AI Response (unexpected format):\n${rawContent}`;
          structuredData.short_answer = null;
        }
      } catch (parseError) {
        // If JSON parsing fails, return the raw string as 'code' and add a thought
        console.warn(`Failed to parse OpenAI response as JSON (language: ${RESPONSE_LANGUAGE}). Raw content:`, rawContent);
        // Improved error handling for non-JSON responses
        structuredData = {
          short_answer: null,
          code: `// Error: Could not process the response from the AI.`,
          thoughts: [`The AI response could not be understood (expected JSON format). Response language set to ${RESPONSE_LANGUAGE}.`, "Raw AI Response:", rawContent],
          time_complexity: "N/A",
          space_complexity: "N/A"
        };
      }

      // Add assistant response to history for context continuity
      const responseSummary = structuredData.short_answer 
        ? `Answer: ${structuredData.short_answer}` 
        : `Solution provided with ${structuredData.thoughts.length} thoughts`
      conversationHistory.push({
        role: "assistant",
        content: responseSummary + (structuredData.code ? `\nCode: ${structuredData.code.substring(0, 300)}...` : ""),
        timestamp: Date.now()
      })
      
      // Trim history if too long
      if (conversationHistory.length > MAX_HISTORY_MESSAGES * 2) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES * 2)
      }

      return { success: true, data: structuredData }
    } catch (error: any) {
      if (error.name === "CanceledError") {
        this.cancelOngoingRequests()
        this.deps.clearQueues()
        this.deps.setView("queue")
        const mainWindow = this.deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("reset-view")
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Request timed out. The server took too long to respond. Please try again."
          )
        }
        return {
          success: false,
          error: "Request timed out. Please try again."
        }
      }

      console.error("Generate error details:", {
        message: error.message,
        code: error.code,
        response: error.response,
      })

      return { success: false, error: error.message }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const imageDataList = screenshots.map((screenshot) => screenshot.data)
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      const systemPrompt = `You are an expert debugger. Analyze and fix this code in ${language} language. Respond in ${RESPONSE_LANGUAGE}.`;

      const promptParts: Part[] = [
        { text: `Problem: ${problemInfo.problem_statement}\n\nCurrent solution: ${problemInfo.solution}\n\nDebug this code.` },
        ...imageDataList.map(image => ({
          inlineData: {
            data: image,
            mimeType: "image/jpeg"
          }
        }))
      ];

      const responseText = await this.callAIWithFallback(
        "Debug",
        systemPrompt,
        promptParts,
        false,
        signal
      );

      return { success: true, data: responseText }
    } catch (error: any) {
      if (error.name === "CanceledError") {
        return {
          success: false,
          error: "Processing was canceled by the user."
        }
      }

      console.error("Debug error details:", {
        message: error.message,
        code: error.code,
        response: error.response,
      })

      return { success: false, error: error.message }
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    // Reset hasDebugged flag
    this.deps.setHasDebugged(false)

    // Clear any pending state
    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      // Send a clear message that processing was cancelled
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }

  public cancelProcessing(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }
  }
}
