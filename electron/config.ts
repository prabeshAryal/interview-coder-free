// Shared AI configuration constants
// This file centralizes all Gemini API configuration to ensure consistency across the app

/**
 * Available Gemini models in priority order for fallback
 * Order: Latest/most capable → most stable
 */
export const GEMINI_MODELS = {
  GEMINI_3_PRO_PREVIEW: "gemini-3-pro-preview",
  GEMINI_2_5_PRO: "gemini-2.5-pro",
  GEMINI_2_5_FLASH: "gemini-2.5-flash",
  GEMINI_2_0_FLASH: "gemini-2.0-flash"
} as const

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS]

/**
 * Default model to use when no preference is set
 */
export const DEFAULT_MODEL: GeminiModel = GEMINI_MODELS.GEMINI_2_5_FLASH

/**
 * Fallback chain - ordered from highest priority to lowest
 * When a model fails (rate limit, error), we try the next one
 */
export const MODEL_FALLBACK_ORDER: GeminiModel[] = [
  GEMINI_MODELS.GEMINI_3_PRO_PREVIEW,
  GEMINI_MODELS.GEMINI_2_5_PRO,
  GEMINI_MODELS.GEMINI_2_5_FLASH,
  GEMINI_MODELS.GEMINI_2_0_FLASH
]

/**
 * Get the fallback chain starting from a specific model
 * This ensures we try models in order, skipping any that come before the current one
 */
export function getFallbackChain(startModel: GeminiModel): GeminiModel[] {
  const startIndex = MODEL_FALLBACK_ORDER.indexOf(startModel)
  if (startIndex === -1) {
    // Unknown model, start from beginning
    return MODEL_FALLBACK_ORDER
  }
  // Return models from current position onwards
  return MODEL_FALLBACK_ORDER.slice(startIndex)
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
    errorStr.includes("RESOURCE_EXHAUSTED")
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
  [GEMINI_MODELS.GEMINI_3_PRO_PREVIEW]: "Gemini 3 Pro Preview",
  [GEMINI_MODELS.GEMINI_2_5_PRO]: "Gemini 2.5 Pro",
  [GEMINI_MODELS.GEMINI_2_5_FLASH]: "Gemini 2.5 Flash",
  [GEMINI_MODELS.GEMINI_2_0_FLASH]: "Gemini 2.0 Flash"
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
