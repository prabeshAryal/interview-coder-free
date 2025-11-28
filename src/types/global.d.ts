// Global type definitions for window extensions

interface ElectronAPI {
  // Window management
  updateContentDimensions: (dimensions: { width: number; height: number }) => Promise<void>
  setWindowDimensions: (width: number, height: number) => Promise<void>
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
  setWindowFocusable: (focusable: boolean) => Promise<{ success: boolean; error?: string }>
  
  // Screenshot operations
  getScreenshots: () => Promise<{
    success: boolean
    previews?: Array<{ path: string; preview: string }> | null
    error?: string
  }>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
  triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>
  
  // Navigation/Reset
  triggerReset: () => Promise<{ success: boolean; error?: string }>
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>
  
  // API Key management
  setApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  getApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>
  
  // Model management
  setModel: (model: string) => Promise<{ success: boolean; error?: string }>
  getModel: () => Promise<{ success: boolean; model?: string; error?: string }>
  
  // Voice recording
  startVoiceRecording: () => Promise<{ success: boolean; error?: string }>
  stopVoiceRecording: () => Promise<{ success: boolean; error?: string }>
  toggleVoiceRecording: () => Promise<{ success: boolean; isRecording?: boolean; error?: string }>
  processVoiceAudio: (audioBase64: string) => Promise<{ success: boolean; data?: any; error?: string }>
  getVoiceRecordingStatus: () => Promise<{ success: boolean; isRecording: boolean }>
  
  // App control
  quitApp: () => void
  openExternal: (url: string) => void
  getPlatform: () => string
  
  // Update events
  startUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  
  // Credits
  decrementCredits: () => Promise<void>
  onCreditsUpdated: (callback: (credits: number) => void) => () => void
  onOutOfCredits: (callback: () => void) => () => void
  
  // Screenshot events
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  
  // View/state events
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  
  // Debug events
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  
  // Voice events
  onVoiceRecordingStarted: (callback: () => void) => () => void
  onVoiceRecordingStopped: (callback: () => void) => () => void
  onVoiceTranscriptionComplete: (callback: (data: { transcription: string }) => void) => () => void
  onVoiceResponse: (callback: (data: { transcription: string; response: string }) => void) => () => void
  onVoiceError: (callback: (error: string) => void) => () => void
  
  // Model events
  onModelUsed: (callback: (model: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    platform: string
    __IS_INITIALIZED__?: boolean
    __CREDITS__?: number
    __LANGUAGE__?: string
  }
}

export {}
