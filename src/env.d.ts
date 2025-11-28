/// <reference types="vite/client" />



interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly NODE_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface ElectronAPI {
  openSubscriptionPortal: (authData: {
    id: string
    email: string
  }) => Promise<{ success: boolean; error?: string }>
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  clearStore: () => Promise<{ success: boolean; error?: string }>
  getScreenshots: () => Promise<{
    success: boolean
    previews?: Array<{ path: string; preview: string }> | null
    error?: string
  }>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  openExternal: (url: string) => void
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
  triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>
  triggerReset: () => Promise<{ success: boolean; error?: string }>
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>
  onSubscriptionUpdated: (callback: () => void) => () => void
  onSubscriptionPortalClosed: (callback: () => void) => () => void
  // Add update-related methods
  startUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  // Add API key and window management methods
  setApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  getApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>
  getModel: () => Promise<{ success: boolean; model?: string; error?: string }>
  setModel: (model: string) => Promise<{ success: boolean; error?: string }>
  setWindowFocusable: (focusable: boolean) => Promise<{ success: boolean; error?: string }>
  quitApp: () => void
  getPlatform: () => string
  onOutOfCredits: (callback: () => void) => () => void
  
  // Voice assistant methods
  startVoiceRecording: () => Promise<{ success: boolean; error?: string }>
  stopVoiceRecording: () => Promise<{ success: boolean; error?: string }>
  toggleVoiceRecording: () => Promise<{ success: boolean; isRecording?: boolean; error?: string }>
  processVoiceAudio: (audioBase64: string) => Promise<{ success: boolean; data?: any; error?: string }>
  getVoiceRecordingStatus: () => Promise<{ success: boolean; isRecording: boolean }>
  onVoiceRecordingStarted: (callback: () => void) => () => void
  onVoiceRecordingStopped: (callback: () => void) => () => void
  onVoiceTranscriptionComplete: (callback: (data: { transcription: string }) => void) => () => void
  onVoiceResponse: (callback: (data: { transcription: string; response: string }) => void) => () => void
  onVoiceError: (callback: (error: string) => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
  electron: {
    ipcRenderer: {
      on(channel: string, func: (...args: any[]) => void): void
      removeListener(channel: string, func: (...args: any[]) => void): void
    }
  }
  __CREDITS__: number
  __LANGUAGE__: string
  __IS_INITIALIZED__: boolean
}
