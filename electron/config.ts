// Shared AI configuration constants
// This file centralizes all Gemini API configuration to ensure consistency across the app

export {
  DEFAULT_MODEL,
  GEMINI_MODELS,
  isGeminiModel,
  MODEL_DISPLAY_NAMES
} from "../src/shared/aiModels"
export type { GeminiModel } from "../src/shared/aiModels"

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
    return "Rate limit reached for Gemini 3.7 Flash. Please try again later."
  }
  if (isNetworkError(error)) {
    return "Network error. Please check your connection."
  }
  return error?.message || "An unexpected error occurred."
}

/**
 * Model display names for UI
 */
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
export const RESPONSE_LANGUAGE = "English"
