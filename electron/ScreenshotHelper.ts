// ScreenshotHelper.ts

import path from "node:path"
import fs from "node:fs"
import { app } from "electron"
import { v4 as uuidv4 } from "uuid"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 2
  private captureInProgress = false

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  private view: "queue" | "solutions" | "debug" = "queue"

  constructor(view: "queue" | "solutions" | "debug" = "queue") {
    this.view = view

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir)
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir)
    }
  }

  public getView(): "queue" | "solutions" | "debug" {
    return this.view
  }

  public setView(view: "queue" | "solutions" | "debug"): void {
    console.log("Setting view in ScreenshotHelper:", view)
    console.log(
      "Current queues - Main:",
      this.screenshotQueue,
      "Extra:",
      this.extraScreenshotQueue
    )
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    console.log("Getting extra screenshot queue:", this.extraScreenshotQueue)
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  private captureQueue: Array<{
    prepareWindowForCapture: () => () => void
    resolve: (path: string) => void
    reject: (error: any) => void
  }> = []

  private getScreenCapExePath(): string {
    const candidates = [
      path.join(__dirname, "screencap.exe"),
      path.join(__dirname, "../electron/screencap.exe"),
      path.join(app.getAppPath(), "electron/screencap.exe"),
      path.join(app.getPath("userData"), "screencap.exe")
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
    // If not found, try to compile screencap.cs if available
    const csCandidates = [
      path.join(__dirname, "screencap.cs"),
      path.join(__dirname, "../electron/screencap.cs"),
      path.join(app.getAppPath(), "electron/screencap.cs")
    ]
    const targetExe = path.join(app.getPath("userData"), "screencap.exe")
    const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
    for (const cs of csCandidates) {
      if (fs.existsSync(cs) && fs.existsSync(cscPath)) {
        try {
          const { execFileSync } = require("child_process")
          execFileSync(cscPath, ["/target:winexe", "/optimize+", `/out:${targetExe}`, cs], { windowsHide: true })
          if (fs.existsSync(targetExe)) {
            return targetExe
          }
        } catch (e) {
          console.error("Failed to compile screencap.cs:", e)
        }
      }
    }
    return ""
  }

  private async captureScreenshotMac(): Promise<Buffer> {
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`)
    await execFileAsync("screencapture", ["-x", tmpPath])
    const buffer = await fs.promises.readFile(tmpPath)
    await fs.promises.unlink(tmpPath)
    return buffer
  }

  private async captureScreenshotWindows(): Promise<Buffer> {
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`)
    const exePath = this.getScreenCapExePath()
    
    // Fast, stealthy, native GUI binary capture (no console, no conhost, no taskbar popups)
    if (exePath) {
      try {
        await execFileAsync(exePath, [tmpPath], { windowsHide: true })
        if (fs.existsSync(tmpPath)) {
          const buffer = await fs.promises.readFile(tmpPath)
          await fs.promises.unlink(tmpPath)
          return buffer
        }
      } catch (err) {
        console.warn("Native screencap.exe failed, falling back to PowerShell:", err)
      }
    }

    // Fallback using PowerShell with windowsHide
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save('${tmpPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
    `
    try {
      await execFileAsync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; ${script}`],
        { windowsHide: true }
      )
      return await fs.promises.readFile(tmpPath)
    } finally {
      await fs.promises.rm(tmpPath, { force: true })
    }
  }

  public async takeScreenshot(
    prepareWindowForCapture: () => () => void
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.captureQueue.push({ prepareWindowForCapture, resolve, reject })
      this.processCaptureQueue()
    })
  }

  private async processCaptureQueue(): Promise<void> {
    if (this.captureInProgress || this.captureQueue.length === 0) return
    this.captureInProgress = true
    const item = this.captureQueue.shift()!

    let restoreWindow = () => {}
    let screenshotPath = ""
    try {
      console.log("Taking screenshot in view:", this.view)
      restoreWindow = item.prepareWindowForCapture()
      // Brief 20ms pause for window opacity 0 to register
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Get screenshot buffer using native methods
      const screenshotBuffer =
        process.platform === "darwin"
          ? await this.captureScreenshotMac()
          : await this.captureScreenshotWindows()

      screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
      await fs.promises.writeFile(screenshotPath, screenshotBuffer)
      
      if (this.view === "queue") {
        // In queue view: stack screenshots up to MAX_SCREENSHOTS
        if (this.screenshotQueue.length >= this.MAX_SCREENSHOTS) {
          const oldestPath = this.screenshotQueue.shift()
          if (oldestPath) {
            fs.unlink(oldestPath, (err) => {
              if (err) console.error(`Error deleting oldest screenshot at ${oldestPath}:`, err)
            })
          }
        }
        this.screenshotQueue.push(screenshotPath)
        console.log(`Added screenshot to queue (${this.screenshotQueue.length}/${this.MAX_SCREENSHOTS}):`, screenshotPath)
      } else {
        // In solutions/debug view: this is a NEW question, clear old screenshots
        this.screenshotQueue.forEach((oldPath) => {
          fs.unlink(oldPath, (err) => {
            if (err) console.error(`Error deleting old screenshot at ${oldPath}:`, err)
          })
        })
        this.screenshotQueue = [screenshotPath]
        console.log(`New question - replaced queue with fresh screenshot (1/${this.MAX_SCREENSHOTS}):`, screenshotPath)
        this.view = "queue"
      }
      item.resolve(screenshotPath)
    } catch (error) {
      console.error("Screenshot error:", error)
      item.reject(error)
    } finally {
      try {
        restoreWindow()
      } finally {
        this.captureInProgress = false
        // Process next queued screenshot if user triggered rapidly
        if (this.captureQueue.length > 0) {
          setTimeout(() => this.processCaptureQueue(), 30)
        }
      }
    }
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.promises.unlink(path)
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: (error as any).message }
    }
  }

  public clearExtraScreenshotQueue(): void {
    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }
}
