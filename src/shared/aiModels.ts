export const GEMINI_MODELS = {
  GEMINI_3_8_FLASH: "gemini-3.8-flash",
  GEMINI_3_7_FLASH: "gemini-3.7-flash",
  GEMINI_3_6_FLASH: "gemini-3.6-flash",
  GEMINI_3_5_FLASH: "gemini-3.5-flash",
  GEMINI_3_5_FLASH_LITE: "gemini-3.5-flash-lite",
  GEMINI_3_1_FLASH_LITE: "gemini-3.1-flash-lite",
  GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
  GEMINI_2_5_FLASH: "gemini-2.5-flash",
  GEMINI_2_5_FLASH_LITE: "gemini-2.5-flash-lite"
} as const

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS]

export const DEFAULT_MODEL: GeminiModel = GEMINI_MODELS.GEMINI_3_7_FLASH

export const MODEL_DISPLAY_NAMES: Record<GeminiModel, string> = {
  [GEMINI_MODELS.GEMINI_3_8_FLASH]: "Gemini 3.8 Flash",
  [GEMINI_MODELS.GEMINI_3_7_FLASH]: "Gemini 3.7 Flash",
  [GEMINI_MODELS.GEMINI_3_6_FLASH]: "Gemini 3.6 Flash",
  [GEMINI_MODELS.GEMINI_3_5_FLASH]: "Gemini 3.5 Flash",
  [GEMINI_MODELS.GEMINI_3_5_FLASH_LITE]: "Gemini 3.5 Flash-Lite",
  [GEMINI_MODELS.GEMINI_3_1_FLASH_LITE]: "Gemini 3.1 Flash-Lite",
  [GEMINI_MODELS.GEMINI_3_FLASH_PREVIEW]: "Gemini 3 Flash",
  [GEMINI_MODELS.GEMINI_2_5_FLASH]: "Gemini 2.5 Flash",
  [GEMINI_MODELS.GEMINI_2_5_FLASH_LITE]: "Gemini 2.5 Flash-Lite"
}

export const GEMINI_MODEL_OPTIONS = Object.entries(MODEL_DISPLAY_NAMES).map(([id, label]) => ({
  id: id as GeminiModel,
  label
}))

export function isGeminiModel(value: unknown): value is GeminiModel {
  return Object.values(GEMINI_MODELS).includes(value as GeminiModel)
}
