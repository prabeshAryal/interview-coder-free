import { GoogleGenAI } from "@google/genai"
import { BrowserWindow } from "electron"
import Store from "electron-store"
import {
  DEFAULT_MODEL,
  getFallbackChain,
  isRateLimitError,
  isNetworkError,
  getErrorMessage,
  RETRY_CONFIG,
  GeminiModel
} from "./config"
import { getConversationContext, addToConversationHistory } from "./ProcessingHelper"

const store = new Store()

export interface IVoiceHelperDeps {
  getMainWindow: () => BrowserWindow | null
  getProblemInfo: () => any
  getLanguage: () => Promise<string>
  setView: (view: "queue" | "solutions" | "debug") => void
}

export class VoiceHelper {
  private deps: IVoiceHelperDeps
  private isRecording: boolean = false
  private genAI: GoogleGenAI | null = null

  // Voice events
  private VOICE_EVENTS = {
    RECORDING_STARTED: "voice-recording-started",
    RECORDING_STOPPED: "voice-recording-stopped",
    TRANSCRIPTION_COMPLETE: "voice-transcription-complete",
    VOICE_RESPONSE: "voice-response",
    VOICE_ERROR: "voice-error"
  } as const

  constructor(deps: IVoiceHelperDeps) {
    this.deps = deps
    this.initializeGenAI()
  }

  private initializeGenAI() {
    const apiKey = store.get("GEMINI_API_KEY") as string
    if (apiKey) {
      this.genAI = new GoogleGenAI({ apiKey })
    }
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  async startRecording(): Promise<{ success: boolean; error?: string }> {
    if (this.isRecording) {
      return { success: false, error: "Already recording" }
    }

    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) {
      return { success: false, error: "No main window available" }
    }

    try {
      this.isRecording = true
      // Notify renderer to start recording via Web Audio API
      mainWindow.webContents.send(this.VOICE_EVENTS.RECORDING_STARTED)
      console.log("Voice recording started")
      return { success: true }
    } catch (error: any) {
      console.error("Failed to start recording:", error)
      this.isRecording = false
      return { success: false, error: error.message }
    }
  }

  async stopRecording(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRecording) {
      return { success: false, error: "Not currently recording" }
    }

    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) {
      return { success: false, error: "No main window available" }
    }

    try {
      this.isRecording = false
      // Notify renderer to stop recording
      mainWindow.webContents.send(this.VOICE_EVENTS.RECORDING_STOPPED)
      console.log("Voice recording stopped")
      return { success: true }
    } catch (error: any) {
      console.error("Failed to stop recording:", error)
      return { success: false, error: error.message }
    }
  }

  async processAudioData(audioBase64: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) {
      return { success: false, error: "No main window available" }
    }

    try {
      // Reset the view to queue first (clears previous state)
      this.deps.setView("queue")
      mainWindow.webContents.send("reset-view")
      
      // Re-initialize GenAI if needed
      if (!this.genAI) {
        const apiKey = store.get("GEMINI_API_KEY") as string
        if (!apiKey) {
          return { success: false, error: "Please set your API Key in Settings." }
        }
        this.genAI = new GoogleGenAI({ apiKey })
      }

      const problemInfo = this.deps.getProblemInfo()
      const language = await this.deps.getLanguage()

      // Build context from current problem if available
      let contextPrompt = ""
      if (problemInfo && problemInfo.problem_statement) {
        contextPrompt = `\n\nCurrent coding problem context:\n${problemInfo.problem_statement}`
      }

      // Add conversation history context
      const conversationContext = getConversationContext()
      if (conversationContext) {
        contextPrompt += `\n\nPrevious conversation (for continuity):\n${conversationContext}`
      }

      // Get the selected model from store, default to configured default
      const userModel = (store.get("GEMINI_MODEL") as string as GeminiModel) || DEFAULT_MODEL
      const models = getFallbackChain(userModel)
      
      console.log("Using model for voice:", userModel, "with fallback chain:", models)

      // First transcribe the audio using Gemini with fallback
      let transcription = ""
      let successfulModel = userModel
      
      for (const modelName of models) {
        try {
          console.log(`[Voice Transcription] Attempting with model: ${modelName}`)
          
          const transcriptionResponse = await this.genAI.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  { text: "Please transcribe this audio exactly as spoken. Only return the transcription, nothing else." },
                  {
                    inlineData: {
                      data: audioBase64,
                      mimeType: "audio/webm"
                    }
                  }
                ]
              }
            ]
          })

          transcription = transcriptionResponse.text?.trim() || ""
          successfulModel = modelName
          console.log(`[Voice Transcription] Success with ${modelName}`)
          break
        } catch (error: any) {
          console.warn(`[Voice Transcription] Model ${modelName} failed:`, error.message)
          
          if (isRateLimitError(error)) {
            console.log(`[Voice Transcription] Rate limit hit, trying next model...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
            continue
          }
          
          if (isNetworkError(error)) {
            console.log(`[Voice Transcription] Network error, retrying...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
            continue
          }
          
          // For other errors, try next model
          continue
        }
      }

      console.log("Transcription:", transcription)

      if (!transcription) {
        return { success: false, error: "Could not transcribe audio. Please try again." }
      }

      // Add voice question to conversation history
      addToConversationHistory("user", `Voice question: ${transcription}`)

      // Send transcription to renderer
      mainWindow.webContents.send(this.VOICE_EVENTS.TRANSCRIPTION_COMPLETE, {
        transcription
      })

      // Send initial-start event to trigger view change to Solutions
      mainWindow.webContents.send("initial-start")

      // Send problem-extracted event with the voice question
      mainWindow.webContents.send("problem-extracted", {
        problem_statement: `**Voice Question:** ${transcription}`
      })

      const systemPrompt = `You are a helpful coding interview assistant. The user is asking a question via voice about coding problems or algorithms.
Provide clear, concise answers. If they're asking about code, provide examples in ${language}.
Be conversational but focused on helping them understand and solve coding problems.${contextPrompt}

You MUST respond in JSON format with the following structure:
{
  "short_answer": "A brief, direct answer to the question (1-2 sentences). Set to null if not applicable.",
  "code": "Code solution if applicable, otherwise empty string. Use ${language} language.",
  "thoughts": ["Array of strings explaining your reasoning step by step"],
  "time_complexity": "Time complexity if code is provided, otherwise 'N/A'",
  "space_complexity": "Space complexity if code is provided, otherwise 'N/A'"
}

IMPORTANT: Return ONLY valid JSON, no markdown code fences or other text.`

      // Now get AI response to the transcribed question with fallback
      let rawResponse = ""
      
      for (const modelName of models) {
        try {
          console.log(`[Voice Response] Attempting with model: ${modelName}`)
          
          const responseResult = await this.genAI.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  { text: systemPrompt },
                  { text: `\n\nUser's voice question: ${transcription}` }
                ]
              }
            ]
          })

          rawResponse = responseResult.text || ""
          successfulModel = modelName
          console.log(`[Voice Response] Success with ${modelName}`)
          
          // Emit model used event
          mainWindow.webContents.send("model-used", modelName)
          break
        } catch (error: any) {
          console.warn(`[Voice Response] Model ${modelName} failed:`, error.message)
          
          if (isRateLimitError(error)) {
            console.log(`[Voice Response] Rate limit hit, trying next model...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
            continue
          }
          
          if (isNetworkError(error)) {
            console.log(`[Voice Response] Network error, retrying...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY_MS))
            continue
          }
          
          continue
        }
      }

      console.log("Raw voice AI response:", rawResponse)

      // Parse the JSON response
      let formattedData = {
        short_answer: null as string | null,
        code: "",
        thoughts: ["I couldn't generate a proper response. Please try again."],
        time_complexity: "N/A",
        space_complexity: "N/A"
      }

      try {
        let jsonToParse = rawResponse.trim()
        
        // Remove markdown code fences if present
        if (jsonToParse.startsWith("```json") && jsonToParse.endsWith("```")) {
          jsonToParse = jsonToParse.substring(7, jsonToParse.length - 3).trim()
        } else if (jsonToParse.startsWith("```") && jsonToParse.endsWith("```")) {
          jsonToParse = jsonToParse.substring(3, jsonToParse.length - 3).trim()
        }

        const parsed = JSON.parse(jsonToParse)
        console.log("Parsed voice response:", parsed)
        
        if (parsed && typeof parsed === 'object') {
          // Ensure thoughts array is never empty - use short_answer as thought if thoughts is empty
          let thoughts = Array.isArray(parsed.thoughts) && parsed.thoughts.length > 0 
            ? parsed.thoughts 
            : (parsed.short_answer ? [parsed.short_answer] : ["Response received."])
          
          // For voice responses without code, use a placeholder that indicates it's a voice response
          const code = parsed.code && parsed.code.trim() !== "" 
            ? parsed.code 
            : `// Voice Response\n// Question: ${transcription}\n// See explanation above for the answer.`
          
          formattedData = {
            short_answer: parsed.short_answer || null,
            code: code,
            thoughts: thoughts,
            time_complexity: parsed.time_complexity || "N/A",
            space_complexity: parsed.space_complexity || "N/A"
          }
        }
      } catch (parseError) {
        console.warn("Failed to parse voice AI response as JSON:", parseError)
        // If JSON parsing fails, treat the whole response as a thought
        formattedData = {
          short_answer: null,
          code: `// Voice Response\n// Question: ${transcription}\n// ${rawResponse}`,
          thoughts: [rawResponse || "I couldn't generate a response. Please try again."],
          time_complexity: "N/A",
          space_complexity: "N/A"
        }
      }

      console.log("Sending solution-success with data:", formattedData)
      
      // Add voice response to conversation history
      const responseSummary = formattedData.short_answer 
        ? formattedData.short_answer 
        : formattedData.thoughts.join(" ").substring(0, 300)
      addToConversationHistory("assistant", `Voice response: ${responseSummary}`)
      
      // Set the view to solutions
      this.deps.setView("solutions")
      
      // Send solution-success event with properly formatted data
      mainWindow.webContents.send("solution-success", formattedData)

      return {
        success: true,
        data: formattedData
      }
    } catch (error: any) {
      console.error("Failed to process audio:", error)
      mainWindow.webContents.send(this.VOICE_EVENTS.VOICE_ERROR, error.message)
      return { success: false, error: error.message }
    }
  }

  toggleRecording(): void {
    if (this.isRecording) {
      this.stopRecording()
    } else {
      this.startRecording()
    }
  }
}
