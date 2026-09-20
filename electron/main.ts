import { app, BrowserWindow, screen, shell, ipcMain } from "electron"
import path from "path"
import { initializeIpcHandlers } from "./ipcHandlers"
import { ProcessingHelper } from "./ProcessingHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { VoiceHelper } from "./VoiceHelper"
import { initAutoUpdater } from "./autoUpdater"

// Constants
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  isWindowVisible: false,
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  step: 0,
  currentX: 0,
  currentY: 0,
  initialX: 40,
  initialY: 50,

  captureInProgress: false,

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as ProcessingHelper | null,
  voiceHelper: null as VoiceHelper | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,

  // Processing events
  PROCESSING_EVENTS: {
    UNAUTHORIZED: "processing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    OUT_OF_CREDITS: "out-of-credits",
    API_KEY_INVALID: "processing-api-key-invalid",
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const
}

// Add interfaces for helper classes
export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null
  getMainWindow: () => BrowserWindow | null
  getView: () => "queue" | "solutions" | "debug"
  setView: (view: "queue" | "solutions" | "debug") => void
  getProblemInfo: () => any
  setProblemInfo: (info: any) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  clearQueues: () => void
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  setHasDebugged: (hasDebugged: boolean) => void
  getHasDebugged: () => boolean
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  toggleVoiceRecording: () => void
}

export interface IIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  setWindowDimensions: (width: number, height: number, view?: "queue" | "solutions") => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  voiceHelper: VoiceHelper | null
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
  takeScreenshot: () => Promise<string>
  getView: () => "queue" | "solutions" | "debug"
  toggleMainWindow: () => void
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  setHasDebugged: (value: boolean) => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  setWindowFocusable: (focusable: boolean) => void
  resetWindowPosition: () => void
}

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

function getView(): "queue" | "solutions" | "debug" {
  return state.view
}

function setView(view: "queue" | "solutions" | "debug"): void {
  state.view = view
  state.screenshotHelper?.setView(view)
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper
}

function getProblemInfo(): any {
  return state.problemInfo
}

function setProblemInfo(problemInfo: any): void {
  state.problemInfo = problemInfo
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || []
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || []
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues()
  state.problemInfo = null
  setView("queue")
}

async function takeScreenshot(): Promise<string> {
  if (!state.mainWindow) throw new Error("No main window available")
  
  if (state.captureInProgress) throw new Error("A screenshot is already in progress")
  if (!state.screenshotHelper) throw new Error("Screenshot helper not initialized")
  state.captureInProgress = true
  // Preserve the user's visibility choice while the native capture is running.
  try {
    const screenshotPath = await state.screenshotHelper.takeScreenshot(
      () => state.mainWindow?.hide(),
      () => {}
    )
    state.view = "queue"
    return screenshotPath
  } finally {
    state.captureInProgress = false
    if (state.isWindowVisible) showMainWindow()
  }
}

async function getImagePreview(filepath: string): Promise<string> {
  return state.screenshotHelper?.getImagePreview(filepath) || ""
}

async function deleteScreenshot(
  path: string
): Promise<{ success: boolean; error?: string }> {
  return (
    state.screenshotHelper?.deleteScreenshot(path) || {
      success: false,
      error: "Screenshot helper not initialized"
    }
  )
}

function setHasDebugged(value: boolean): void {
  state.hasDebugged = value
}

function getHasDebugged(): boolean {
  return state.hasDebugged
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view)
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    getProblemInfo,
    setProblemInfo,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    getImagePreview,
    deleteScreenshot,
    setHasDebugged,
    getHasDebugged,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS
  } as IProcessingHelperDeps)
  
  // Initialize voice helper
  state.voiceHelper = new VoiceHelper({
    getMainWindow,
    getProblemInfo,
    setView,
    getLanguage: async () => {
      const mainWindow = getMainWindow()
      if (!mainWindow) return "python"
      try {
        const language = await mainWindow.webContents.executeJavaScript(
          "window.__LANGUAGE__"
        )
        return language || "python"
      } catch {
        return "python"
      }
    }
  })
  
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    takeScreenshot,
    getImagePreview,
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) => x - state.step),
    moveWindowRight: () =>
      moveWindowHorizontal((x) => x + state.step),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step),
    toggleVoiceRecording: () => state.voiceHelper?.toggleRecording()
  } as IShortcutsHelperDeps)
}

// Window management functions
async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.focus()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  state.screenWidth = workArea.width
  state.screenHeight = workArea.height
  state.step = 60
  
  const initialWidth = Math.min(520, workArea.width)
  const initialHeight = Math.min(160, workArea.height)
  const horizontalInset = 40
  const verticalInset = 24
  const leftAnchor = Math.max(workArea.x + horizontalInset, workArea.x)
  const maxAnchorX = workArea.x + workArea.width - initialWidth - horizontalInset
  const safeAnchorX = workArea.x + Math.round((workArea.width - initialWidth) / 2)
  const bottomAnchor = workArea.y + workArea.height - initialHeight - verticalInset
  const safeBottomY = workArea.y + Math.min(verticalInset, Math.max(0, workArea.height - initialHeight))

  state.initialX = safeAnchorX
  state.initialY = safeBottomY
  state.currentX = state.initialX
  state.currentY = state.initialY
  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    width: initialWidth,
    height: initialHeight,
    x: state.currentX,
    y: state.currentY,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js"),
      scrollBounce: true
    },
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    type: "panel",
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: false,
    movable: true
  }

  state.mainWindow = new BrowserWindow(windowSettings)

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading")
  })
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription)
      // Always try to load the built files on failure
      console.log("Attempting to load built files...")
      setTimeout(() => {
        state.mainWindow?.loadFile(path.join(__dirname, "../dist/index.html")).catch((error) => {
          console.error("Failed to load built files on retry:", error)
        })
      }, 1000)
    }
  )

  // Load the app - always load from built files
  console.log("Loading application from built files...")
  state.mainWindow?.loadFile(path.join(__dirname, "../dist/index.html")).catch((error) => {
    console.error("Failed to load built files:", error)
  })

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1)
  if (isDev) {
    // state.mainWindow.webContents.openDevTools()
  }
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow opening URLs in external browser
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Enhanced screen capture resistance - MAXIMUM PROTECTION
  state.mainWindow.setContentProtection(true)

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  })
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Prevent window from being captured in screenshots
    state.mainWindow.setHiddenInMissionControl(true)
    state.mainWindow.setWindowButtonVisibility(false)
    state.mainWindow.setBackgroundColor("#00000000")

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true)

    // Disable window shadow - helps avoid detection
    state.mainWindow.setHasShadow(false)
    
    // Additional protection: Set window level to floating
    state.mainWindow.setAlwaysOnTop(true, 'floating', 1)
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(false)
  state.mainWindow.webContents.setFrameRate(60)
  
  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove)
  state.mainWindow.on("resize", handleWindowResize)
  state.mainWindow.on("closed", handleWindowClosed)

  // Initialize window state
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.windowSize = { width: bounds.width, height: bounds.height }
  state.currentX = bounds.x
  state.currentY = bounds.y
  state.isWindowVisible = false
}

function handleWindowMove(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.currentX = bounds.x
  state.currentY = bounds.y
}

function handleWindowResize(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowSize = { width: bounds.width, height: bounds.height }
}

function handleWindowClosed(): void {
  state.mainWindow = null
  state.isWindowVisible = false
  state.windowPosition = null
  state.windowSize = null
}

// Window focusability control
function setWindowFocusable(focusable: boolean): void {
  const win = state.mainWindow
  if (win && !win.isDestroyed()) {
    // Visible controls must remain clickable even when settings are closed.
    win.setIgnoreMouseEvents(false)
    if (focusable && state.isWindowVisible && !state.captureInProgress) win.focus()
  }
}

// Window visibility functions
function hideMainWindow(): void {
  const win = state.mainWindow
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds()
    state.windowPosition = { x: bounds.x, y: bounds.y }
    state.windowSize = { width: bounds.width, height: bounds.height }
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(true, "screen-saver", 1)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    })
    win.hide()
    state.isWindowVisible = false
  }
}

function showMainWindow(): void {
  const win = state.mainWindow
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false)
    win.setAlwaysOnTop(true, "screen-saver", 1)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    })
    win.setContentProtection(true)
    state.isWindowVisible = true
    if (!state.captureInProgress) win.show()
  }
}

function toggleMainWindow(): void {
  state.isWindowVisible ? hideMainWindow() : showMainWindow()
}

// Keep the window reachable on its current display.
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  win.setPosition(Math.round(Math.max(area.x, Math.min(updateFn(bounds.x), area.x + area.width - bounds.width))), bounds.y)
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  win.setPosition(bounds.x, Math.round(Math.max(area.y, Math.min(updateFn(bounds.y), area.y + area.height - bounds.height))))
}

function resetWindowPosition(): void {
  if (!state.mainWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const { width, height } = state.mainWindow.getBounds()
  const horizontalInset = 40
  const verticalInset = 24
  const leftAnchor = Math.max(workArea.x + horizontalInset, workArea.x)
  const maxAnchorX = workArea.x + workArea.width - width - horizontalInset
  const safeX = Math.min(leftAnchor, Math.max(workArea.x, maxAnchorX))
  const bottomAnchor = workArea.y + workArea.height - height - verticalInset
  const safeY = Math.max(workArea.y, bottomAnchor)

  state.initialX = safeX
  state.initialY = safeY
  state.currentX = safeX
  state.currentY = safeY
  state.mainWindow.setPosition(safeX, safeY)

}

// Clamp content to the current display; overflowing content scrolls in the renderer.
function setWindowDimensions(width: number, height: number, view?: "queue" | "solutions"): void {
  const win = state.mainWindow
  if (!win || win.isDestroyed() || !Number.isFinite(width) || !Number.isFinite(height)) return
  const bounds = win.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const solution = (view ?? state.view) !== "queue"
  const finalWidth = Math.min(solution ? 900 : 520, area.width)
  const finalHeight = Math.min(Math.max(Math.ceil(height), solution ? 500 : 160), area.height)
  const x = Math.max(area.x, Math.min(bounds.x + Math.round((bounds.width - finalWidth) / 2), area.x + area.width - finalWidth))
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - finalHeight))
  if (bounds.width === finalWidth && bounds.height === finalHeight && bounds.x === x && bounds.y === y) return
  win.setBounds({ x, y, width: finalWidth, height: finalHeight })
}

// Initialize application
async function initializeApp() {
  try {
    initializeHelpers()
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      voiceHelper: state.voiceHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      setHasDebugged,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) => x - state.step),
      moveWindowRight: () =>
        moveWindowHorizontal((x) => x + state.step),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      setWindowFocusable,
      resetWindowPosition
    })
    await createWindow()
    state.shortcutsHelper?.registerShortcuts()

    // Initialize auto-updater regardless of environment
    initAutoUpdater()
    console.log(
      "Auto-updater initialized in",
      isDev ? "development" : "production",
      "mode"
    )
  } catch (error) {
    console.error("Failed to initialize application:", error)
    app.quit()
  }
}

// Start the application
app.whenReady().then(initializeApp)
