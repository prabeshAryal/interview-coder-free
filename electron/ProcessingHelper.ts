import fs from "node:fs"
import path from "node:path"
import { BrowserWindow } from "electron"
import { string } from "prop-types"
interface ScreenshotPayload {
  path: string
  data: string
  mimeType: string
}

interface ProblemExtractionPayload {
  problem_statement?: string
  code_snippet?: string
}

interface SolutionPayload {
  short_answer: string | null
  code: string
  thoughts: string[]
  time_complexity: string
  space_complexity: string
}

let genAI: GoogleGenerativeAI | null = null

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private jsonModel: GenerativeModel
  private textModel: GenerativeModel

  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps

    const helper = deps.getScreenshotHelper()
    if (!helper) {
      throw new Error("Screenshot helper is not initialized")
    }
    this.screenshotHelper = helper

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing from environment variables.")
      // We will throw or handle this gracefully during generation, 
      // but for now we can't initialize the client properly without it.
    }

    if (!genAI && apiKey) {
      genAI = new GoogleGenerativeAI(apiKey)
    }

    if (genAI) {
      this.textModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 32,
          maxOutputTokens: 2048
        }
      })

      this.jsonModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 32,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      })
    } else {
      // Create dummy models that will fail when called if API key is missing
      // This prevents the constructor from crashing if the key is missing at startup
      this.textModel = {} as any
      this.jsonModel = {} as any
    }
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      if (mainWindow.isDestroyed()) return
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      ).catch(() => false)

      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getLanguage(): Promise<string> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return "python"

    try {
      await this.waitForInitialization(mainWindow)
      const language = await mainWindow.webContents.executeJavaScript(
        "window.__LANGUAGE__"
      ).catch(() => "python")

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
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (!process.env.GEMINI_API_KEY) {
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        "Gemini API key not found. Please set GEMINI_API_KEY in your .env file."
      )
      return
    }

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
          screenshotQueue.map(async (filePath) => ({
            path: filePath,
            data: fs.readFileSync(filePath).toString("base64"),
            mimeType: this.getMimeType(filePath)
          }))
        )

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            result.error
          )
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
          error.message || "Server error. Please try again."
        )
        console.error("Processing error:", error)

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
          ].map(async (filePath) => ({
            path: filePath,
            data: fs.readFileSync(filePath).toString("base64"),
            mimeType: this.getMimeType(filePath)
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
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          error.message
        )
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: ScreenshotPayload[],
    signal: AbortSignal
  ) {
    try {
      const imageParts: Part[] = screenshots.map((screenshot) => ({
        inlineData: {
          data: screenshot.data,
          mimeType: screenshot.mimeType
        }
      }))
      const mainWindow = this.deps.getMainWindow()

      const extractPrompt = `You are given up to ${screenshots.length} screenshot(s) containing a coding interview question. Extract the complete problem statement, including every requirement, example, or detail, as well as any code snippet that appears in the screenshots. Respond strictly in ${GEMINI_RESPONSE_LANGUAGE} and follow this JSON schema:
{
  "problem_statement": "Full description in ${GEMINI_RESPONSE_LANGUAGE}",
  "code_snippet": "Any starter or reference code (may be empty)"
}`

      const extractionRaw = await this.callGemini(
        this.jsonModel,
        "Extract",
        [extractPrompt, ...imageParts],
        signal
      )

      const extracted =
        this.parseJson<ProblemExtractionPayload>(extractionRaw) ||
        ({ problem_statement: extractionRaw } as ProblemExtractionPayload)

      const problemStatement = [
        extracted.problem_statement?.trim(),
        extracted.code_snippet?.trim()
      ]
        .filter(Boolean)
        .join("\n\n")
      const normalizedProblemStatement = (
        problemStatement ||
        extracted.problem_statement ||
        extractionRaw ||
        ""
      ).trim()

      this.deps.setProblemInfo({
        problem_statement: normalizedProblemStatement
      })

      // Send first success event
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          { problem_statement: normalizedProblemStatement }
        )

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal)
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue()
          return { success: true, data: solutionsResult.data }
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          )
        }
      }
      return { success: false, error: "Window destroyed" }
    } catch (error: any) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Processing was canceled by the user."
        }
      }

      console.error("Processing error details:", {
        message: error.message,
        code: error.code
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

      const solutionPrompt = `You are an expert coding assistant helping with interview preparation. Analyze the problem statement below and respond in ${GEMINI_RESPONSE_LANGUAGE}. Output JSON that matches this schema exactly:
{
  "short_answer": "nullable string with the concise final answer in ${GEMINI_RESPONSE_LANGUAGE}",
  "code": "Complete ${language} solution. Comments must be in ${GEMINI_RESPONSE_LANGUAGE}.",
  "thoughts": ["Array of step-by-step explanations in ${GEMINI_RESPONSE_LANGUAGE}"],
  "time_complexity": "Time complexity in ${GEMINI_RESPONSE_LANGUAGE}",
  "space_complexity": "Space complexity in ${GEMINI_RESPONSE_LANGUAGE}"
}

If a field is unknown, use null for short_answer and "N/A" for complexity entries.

Problem statement:
${problemInfo.problem_statement}`

      const rawContent = await this.callGemini(
        this.jsonModel,
        "GenerateSolution",
        [solutionPrompt],
        signal
      )

      let structuredData: SolutionPayload = {
        short_answer: null,
        code: "",
        thoughts: ["Failed to parse Gemini response."],
        time_complexity: "N/A",
        space_complexity: "N/A"
      }

      const parsed = this.parseJson<SolutionPayload>(rawContent)
      if (parsed && parsed.code && parsed.thoughts) {
        structuredData = {
          short_answer: parsed.short_answer ?? null,
          code: parsed.code || "",
          thoughts: Array.isArray(parsed.thoughts)
            ? parsed.thoughts
            : [String(parsed.thoughts)],
          time_complexity: parsed.time_complexity || "N/A",
          space_complexity: parsed.space_complexity || "N/A"
        }
      } else {
        structuredData = {
          short_answer: null,
          code: "// Failed to parse Gemini response.",
          thoughts: [
            `Gemini response could not be parsed as JSON (requested language: ${GEMINI_RESPONSE_LANGUAGE}).`,
            rawContent
          ],
          time_complexity: "N/A",
          space_complexity: "N/A"
        }
      }

      const currentProblem = this.deps.getProblemInfo()
      if (currentProblem) {
        this.deps.setProblemInfo({
          ...currentProblem,
          solution: structuredData.code
        })
      }

      return { success: true, data: structuredData }
    } catch (error: any) {
      if (error.name === "AbortError") {
        this.cancelOngoingRequests()
        this.deps.clearQueues()
        this.deps.setView("queue")
        const mainWindow = this.deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("reset-view")
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Request canceled."
          )
        }
        return {
          success: false,
          error: "Request canceled."
        }
      }

      console.error("Generate error details:", {
        message: error.message,
        code: error.code
      })

      return { success: false, error: error.message }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: ScreenshotPayload[],
    signal: AbortSignal
  ) {
    try {
      const imageParts: Part[] = screenshots.map((screenshot) => ({
        inlineData: {
          data: screenshot.data,
          mimeType: screenshot.mimeType
        }
      }))
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      const debugPrompt = `You are assisting with debugging during a coding interview. The candidate has provided additional screenshots of their work.

Problem (in ${GEMINI_RESPONSE_LANGUAGE}):
${problemInfo.problem_statement}

Current AI solution in ${language}:
${problemInfo.solution || "// No solution available yet."}

Using the new screenshots, provide updated guidance in ${GEMINI_RESPONSE_LANGUAGE}. Suggest fixes, highlight mistakes, and offer an improved approach.`

      const responseText = await this.callGemini(
        this.textModel,
        "Debug",
        [debugPrompt, ...imageParts],
        signal
      )

      return { success: true, data: responseText }
    } catch (error: any) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Processing was canceled by the user."
        }
      }

      console.error("Debug error details:", {
        message: error.message,
        code: error.code
      })

      return { success: false, error: error.message }
    }
  }

  private async callGemini(
    model: GenerativeModel,
    context: string,
    parts: (string | Part)[],
    signal?: AbortSignal
  ): Promise<string> {
    if (signal?.aborted) {
      const abortError = new Error("Request aborted")
      abortError.name = "AbortError"
      throw abortError
    }

    // Convert string parts to Part objects if necessary
    const formattedParts: Part[] = parts.map(p => {
      if (typeof p === 'string') return { text: p };
      return p;
    });

    const safePartsPreview = formattedParts
      .map((part) => ("text" in part && typeof part.text === "string" ? part.text : "[Image/Data]"))
      .join("\n---\n")
    console.log(`[Gemini Request - ${context}]`, safePartsPreview.substring(0, 500) + "...")

    try {
      // Note: The Google AI SDK doesn't support AbortSignal directly in generateContent in all versions,
      // but we can check the signal before and after.
      // If the SDK version supports it in RequestOptions, we pass it.
      // @ts-ignore - signal might not be in type definition depending on version but often works or is ignored
      const result = await model.generateContent({ contents: [{ role: "user", parts: formattedParts }] });

      if (signal?.aborted) {
        throw new Error("Request aborted");
      }

      const responseText = result.response.text();
      console.log(`[Gemini Response - ${context}]`, responseText.substring(0, 500) + "...")
      return responseText
    } catch (error) {
      console.error(`[Gemini Error - ${context}]`, error)
      throw error
    }
  }

  private parseJson<T>(raw: string): T | null {
    if (!raw) return null

    let candidate = raw.trim()
    if (!candidate) return null

    // Remove markdown code fences if present
    if (candidate.startsWith("```")) {
      const match = candidate.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
      if (match) {
        candidate = match[1];
      } else {
        // Fallback simple slice if regex fails
        const fence = candidate.startsWith("```json") ? "```json" : "```"
        candidate = candidate
          .slice(fence.length, candidate.length - 3)
          .trim()
      }
    }

    try {
      return JSON.parse(candidate) as T
    } catch (error) {
      console.warn("Failed to parse JSON response from Gemini:", error)
      return null
    }
  }

  private getMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase()
    switch (extension) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg"
      case ".webp":
        return "image/webp"
      case ".bmp":
        return "image/bmp"
      case ".png":
      default:
        return "image/png"
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
