// Shared AI configuration constants
// This file centralizes all Gemini API configuration to ensure consistency across the app

/**
 * Available Gemini models in priority order for fallback
 * Order: Latest/most capable → most stable
 */
export const GEMINI_MODELS = {
  GEMINI_4_HYDROGEN: "gemini-4-hydrogen",
  GEMINI_3_5_FLASH_LITE: "gemini-3.5-flash-lite",
} as const

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS]

/**
 * Default model to use when no preference is set
 */
export const DEFAULT_MODEL: GeminiModel = GEMINI_MODELS.GEMINI_3_5_FLASH_LITE

/**
 * Fallback chain - ordered from fastest/highest priority to lowest
 * When a model fails (503 busy, 429 rate limit, network), we try the next one
 */
export const MODEL_FALLBACK_ORDER: GeminiModel[] = [
  GEMINI_MODELS.GEMINI_3_5_FLASH_LITE,
  GEMINI_MODELS.GEMINI_4_HYDROGEN,
]

/**
 * Get the fallback chain starting from a specific model
 * Tries the selected model first, then remaining models in priority order
 */
export function getFallbackChain(startModel: GeminiModel): GeminiModel[] {
  if (!MODEL_FALLBACK_ORDER.includes(startModel)) {
    return MODEL_FALLBACK_ORDER
  }
  return [startModel, ...MODEL_FALLBACK_ORDER.filter((m) => m !== startModel)]
}

/**
 * Retry configuration for API calls
 */
export const RETRY_CONFIG = {
  /** Base delay between retries in milliseconds */
  BASE_DELAY_MS: 2000,
  /** Maximum delay between retries in milliseconds */
  MAX_DELAY_MS: 30000,
  /** Maximum number of retry attempts per model */
  MAX_RETRIES_PER_MODEL: 1,
  /** Timeout for API calls in milliseconds */
  API_TIMEOUT_MS: 60000
} as const

/**
 * Check if an error is a rate limit error (HTTP 429)
 */
export function isRateLimitError(error: any): boolean {
  if (!error) return false
  const errorStr = String(error.message || error)
  return (
    errorStr.includes("429") ||
    errorStr.includes("rate limit") ||
    errorStr.includes("quota") ||
    errorStr.includes("RESOURCE_EXHAUSTED") ||
    errorStr.includes("503") ||
    errorStr.includes("UNAVAILABLE") ||
    errorStr.includes("high demand") ||
    errorStr.includes("temporarily unavailable") ||
    errorStr.includes("overloaded")
  )
}

/**
 * Check if an error is a network/SSL error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  const errorStr = String(error.message || error)
  return (
    errorStr.includes("SSL") ||
    errorStr.includes("ECONNRESET") ||
    errorStr.includes("ETIMEDOUT") ||
    errorStr.includes("ENOTFOUND") ||
    errorStr.includes("handshake failed") ||
    errorStr.includes("net_error")
  )
}

/**
 * Check if a model identifier is unavailable or no longer supported
 */
export function isUnavailableModelError(error: any): boolean {
  if (!error) return false
  const errorStr = String(error.message || error)
  return (
    errorStr.includes("404") ||
    errorStr.includes("NOT_FOUND") ||
    errorStr.includes("is no longer available") ||
    errorStr.includes("model is not found")
  )
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: any): string {
  if (isRateLimitError(error)) {
    return "Rate limit reached. Trying with a different model..."
  }
  if (isNetworkError(error)) {
    return "Network error. Please check your connection."
  }
  return error?.message || "An unexpected error occurred."
}

/**
 * Model display names for UI
 */
export const MODEL_DISPLAY_NAMES: Record<GeminiModel, string> = {
  [GEMINI_MODELS.GEMINI_4_HYDROGEN]: "Gemini 4 Hydrogen",
  [GEMINI_MODELS.GEMINI_3_5_FLASH_LITE]: "Gemini 3.5 Flash-Lite"
}

/**
 * Voice recording configuration
 */
export const VOICE_CONFIG = {
  /** Audio MIME type for recording */
  MIME_TYPE: "audio/webm;codecs=opus",
  /** Maximum recording duration in milliseconds */
  MAX_DURATION_MS: 60000
} as const

/**
 * Response language (can be customized)
 */
export const RESPONSE_LANGUAGE = process.env.OPENAI_RESPONSE_LANGUAGE || "English"
