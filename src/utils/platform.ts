// Get the platform safely
const getPlatform = () => {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.getPlatform()
    }
    return 'win32'
  } catch {
    return 'win32'
  }
}

// Platform-specific command key symbol
export const COMMAND_KEY = getPlatform() === 'darwin' ? '⌘' : 'Ctrl'

// Helper to check if we're on Windows
export const isWindows = getPlatform() === 'win32'

// Helper to check if we're on macOS
export const isMacOS = getPlatform() === 'darwin'