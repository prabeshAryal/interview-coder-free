import fs from "node:fs"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import { app, BrowserWindow } from "electron"
import { GoogleGenAI, Part } from "@google/genai"
import Store from "electron-store"
import {
  GEMINI_MODELS,
  DEFAULT_MODEL,
  getFallbackChain,
  isRateLimitError,
  isUnavailableModelError,
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

function detectMimeType(base64Data: string): string {
  if (base64Data.startsWith("iVBORw0KGgo")) return "image/png"
  if (base64Data.startsWith("/9j/")) return "image/jpeg"
  if (base64Data.startsWith("UklGR")) return "image/webp"
  return "image/png"
}

function extractJsonFromResponse(raw: string): any {
  if (!raw) return null
  const text = raw.trim()

  // 1. Direct JSON parse
  try {
    return JSON.parse(text)
  } catch {}

  // 2. Fenced ```json ... ``` or ``` ... ```
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1].trim())
    } catch {}
  }

  // 3. Outermost curly braces { ... }
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1))
    } catch {}
  }

  return null
}

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
  private isProcessingScreenshots = false

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
    const storedModel = store.get("GEMINI_MODEL") as string
    const validModels = Object.values(GEMINI_MODELS) as string[]
    const userModel = (validModels.includes(storedModel) ? storedModel : DEFAULT_MODEL) as GeminiModel
    if (storedModel && !validModels.includes(storedModel)) {
      store.set("GEMINI_MODEL", DEFAULT_MODEL)
    }
    
    // Get the fallback chain starting from user's preferred model
    const models = getFallbackChain(userModel)
    
    let lastError: any
    for (const modelName of models) {
      if (signal?.aborted) {
        throw new Error("CanceledError")
      }

      try {
        const requestStartedAt = Date.now()
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
        const responseText = response.text || ""

        console.log(`[Gemini Response - ${context}] Success with ${modelName} in ${Date.now() - requestStartedAt}ms`)
        
        // Track successful model for UI display
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

        if (isUnavailableModelError(error)) {
          console.log(`[Gemini Fallback - ${context}] Model ${modelName} is unavailable, trying next model...`)
          continue
        }

        // Check if it's a rate limit error - try next model silently
        if (isRateLimitError(error)) {
          console.log(`[Gemini Fallback - ${context}] Rate limit hit on ${modelName}, trying next model...`)
          continue
        }

        // Check if it's a network error - retry with delay
        if (isNetworkError(error)) {
          console.log(`[Gemini Fallback - ${context}] Network error on ${modelName}, trying next model...`)
          continue
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
    if (this.isProcessingScreenshots) {
      console.log("Ignoring duplicate screenshot processing trigger while a request is in progress")
      return
    }

    // Credits check is bypassed - we always have enough credits

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      this.isProcessingScreenshots = true
      this.deps.setView("solutions")
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      if (screenshotQueue.length === 0) {
        this.isProcessingScreenshots = false
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const validScreenshotPaths = screenshotQueue.filter((path) => fs.existsSync(path))
        if (validScreenshotPaths.length === 0) {
          this.isProcessingScreenshots = false
          mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
          this.deps.setView("queue")
          return
        }

        const screenshots = await Promise.all(
          validScreenshotPaths.map(async (path) => ({
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
            const errorMessage = result.error || "Unknown error"
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
        this.isProcessingScreenshots = false
      }
    } else {
      // view == 'solutions'
      if (this.isProcessingScreenshots) {
        console.log("Ignoring duplicate debug processing trigger while a request is in progress")
        return
      }
      this.isProcessingScreenshots = true
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      if (extraScreenshotQueue.length === 0) {
        this.isProcessingScreenshots = false
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
        this.isProcessingScreenshots = false
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

      // Get conversation context for continuity
      const conversationContext = getConversationContext()
      const contextSection = conversationContext
        ? `\n\nPrevious conversation context (for reference):\n${conversationContext}\n\n---\n`
        : ""

      const systemPrompt = `You are an expert coding interview assistant and competitive programming master.
Analyze the provided screenshot(s) containing a coding problem, question, or code.
Respond ENTIRELY in ${RESPONSE_LANGUAGE}. Be concise, highly accurate, and focus on optimal solutions.
${contextSection ? "Use the previous conversation context to provide continuity if the current question relates to earlier discussions." : ""}

Instructions:
1. Extract the complete problem statement and any provided starter code / snippets from the images into "problem_statement".
2. If possible, provide a very brief, direct answer to the problem first in "short_answer" (e.g., final output value, return value, or direct answer). Set to null if not applicable.
3. Provide the clean, optimal, production-ready code solution in ${language} in "code". Comments within code MUST be in ${RESPONSE_LANGUAGE}.
4. Provide step-by-step reasoning in "thoughts" (array of strings in ${RESPONSE_LANGUAGE}).
5. Provide time complexity analysis in "time_complexity" (e.g. "O(n)").
6. Provide space complexity analysis in "space_complexity" (e.g. "O(1)").

Output MUST be a valid JSON object matching this schema:
{
  "problem_statement": string,
  "short_answer": string | null,
  "code": string,
  "thoughts": string[],
  "time_complexity": string,
  "space_complexity": string
}

If the problem statement is incomplete or unclear, extract whatever is visible into "problem_statement", set "short_answer" to null, explain the issue clearly in the "thoughts" field (in ${RESPONSE_LANGUAGE}), and set "code" to an empty string or a relevant placeholder comment.`

      const promptParts: Part[] = [
        {
          text: `${contextSection}Extract the coding problem statement and any code snippets from the attached screenshot(s), solve it in ${language}, and return the full JSON response.`
        },
        ...imageDataList.map((image) => ({
          inlineData: {
            data: image,
            mimeType: detectMimeType(image)
          }
        }))
      ]

      console.log(`[ProcessingHelper] Initiating single-pass solve with ${imageDataList.length} screenshots in ${language}`)

      const rawContent = await this.callAIWithFallback(
        "Solve",
        systemPrompt,
        promptParts,
        true,
        signal
      )

      let structuredData = {
        problem_statement: "Problem statement extracted from screenshots.",
        short_answer: null as string | null,
        code: "",
        thoughts: ["Failed to parse AI response."],
        time_complexity: "N/A",
        space_complexity: "N/A"
      }

      try {
        const parsed = extractJsonFromResponse(rawContent)
        if (parsed && typeof parsed === "object") {
          const problemStatement =
            typeof parsed.problem_statement === "string" && parsed.problem_statement.trim()
              ? parsed.problem_statement
              : "Problem statement extracted from screenshots."
          const shortAnswer = parsed.short_answer || null
          const code =
            typeof parsed.code === "string" && parsed.code.trim()
              ? parsed.code
              : (shortAnswer ? `// Short Answer: ${shortAnswer}` : "// Solution generated successfully.")
          const thoughts =
            Array.isArray(parsed.thoughts) && parsed.thoughts.length > 0
              ? parsed.thoughts.map(String)
              : [String(parsed.thoughts || `Analysis completed in ${RESPONSE_LANGUAGE}.`)]
          const timeComplexity = parsed.time_complexity || "N/A"
          const spaceComplexity = parsed.space_complexity || "N/A"

          structuredData = {
            problem_statement: problemStatement,
            short_answer: shortAnswer,
            code: code,
            thoughts: thoughts,
            time_complexity: timeComplexity,
            space_complexity: spaceComplexity
          }
        } else {
          // If JSON extraction failed, use rawContent as code
          structuredData = {
            problem_statement: "Problem statement extracted from screenshots.",
            short_answer: null,
            code: rawContent || "// No code generated",
            thoughts: [`AI response received in text format.`, rawContent],
            time_complexity: "N/A",
            space_complexity: "N/A"
          }
        }
      } catch (parseError) {
        console.warn(`Failed to parse AI response as JSON (language: ${RESPONSE_LANGUAGE}). Raw content:`, rawContent)
        structuredData = {
          problem_statement: "Could not cleanly parse problem statement from AI response.",
          short_answer: null,
          code: rawContent || "// Raw AI Response",
          thoughts: [`The AI response could not be parsed as valid JSON.`, "Raw AI Response:", rawContent],
          time_complexity: "N/A",
          space_complexity: "N/A"
        }
      }

      // Store problem info and solution in AppState
      this.deps.setProblemInfo({
        problem_statement: structuredData.problem_statement,
        solution: structuredData.code
      })

      // Add to conversation history
      conversationHistory.push({
        role: "user",
        content: `Problem: ${structuredData.problem_statement}`,
        timestamp: Date.now()
      })

      const responseSummary = structuredData.short_answer
        ? `Answer: ${structuredData.short_answer}`
        : `Solution provided with ${structuredData.thoughts.length} thoughts`

      conversationHistory.push({
        role: "assistant",
        content: responseSummary + (structuredData.code ? `\nCode: ${structuredData.code.substring(0, 300)}...` : ""),
        timestamp: Date.now()
      })

      if (conversationHistory.length > MAX_HISTORY_MESSAGES * 2) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES * 2)
      }

      // Clear extra screenshot queue
      this.screenshotHelper.clearExtraScreenshotQueue()

      // Send PROBLEM_EXTRACTED event so UI has problem statement in query cache
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          { problem_statement: structuredData.problem_statement }
        )
      }

      return { success: true, data: structuredData }
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
        response: error.response
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
            mimeType: detectMimeType(image)
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
