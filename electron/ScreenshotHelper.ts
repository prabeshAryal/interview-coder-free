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

  private async captureScreenshotMac(): Promise<Buffer> {
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`)
    await execFileAsync("screencapture", ["-x", tmpPath])
    const buffer = await fs.promises.readFile(tmpPath)
    await fs.promises.unlink(tmpPath)
    return buffer
  }

  private async captureScreenshotWindows(): Promise<Buffer> {
    // Using PowerShell's native screenshot capability
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`)
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
      $bitmap.Save('${tmpPath.replace(/\\/g, "\\\\")}')
      $graphics.Dispose()
      $bitmap.Dispose()
    `
    await execFileAsync("powershell", ["-command", script])
    const buffer = await fs.promises.readFile(tmpPath)
    await fs.promises.unlink(tmpPath)
    return buffer
  }

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string> {
    console.log("Taking screenshot in view:", this.view)
    hideMainWindow()
    await new Promise((resolve) => setTimeout(resolve, 100))

    let screenshotPath = ""
    try {
      // Get screenshot buffer using native methods
      const screenshotBuffer =
        process.platform === "darwin"
          ? await this.captureScreenshotMac()
          : await this.captureScreenshotWindows()

      // Always save to main queue - new screenshots should always be treated as new problems
      // This ensures that pressing Cmd+H followed by Cmd+Enter always processes a new question
      screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
      await fs.promises.writeFile(screenshotPath, screenshotBuffer)
      console.log("Adding screenshot to main queue:", screenshotPath)
      
      // Clear previous screenshots and add new one (fresh start for new problem)
      this.screenshotQueue.forEach((oldPath) => {
        fs.unlink(oldPath, (err) => {
          if (err) console.error(`Error deleting old screenshot at ${oldPath}:`, err)
        })
      })
      this.screenshotQueue = [screenshotPath]
      
      // Also clear extra queue since we're starting fresh
      this.extraScreenshotQueue.forEach((oldPath) => {
        fs.unlink(oldPath, (err) => {
          if (err) console.error(`Error deleting extra screenshot at ${oldPath}:`, err)
        })
      })
      this.extraScreenshotQueue = []
      
      // Reset view to queue so next processing treats this as a new problem
      if (this.view !== "queue") {
        console.log("Resetting view to queue for new screenshot")
        this.view = "queue"
      }
    } catch (error) {
      console.error("Screenshot error:", error)
      throw error
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 50))
      showMainWindow()
    }

    return screenshotPath
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
