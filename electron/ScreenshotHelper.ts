// ScreenshotHelper.ts

import path from "node:path"
import fs from "node:fs"
import { app, desktopCapturer, screen } from "electron"
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
    resolve: (path: string) => void
    reject: (error: any) => void
  }> = []

  private async captureScreenshotMac(): Promise<Buffer> {
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`)
    await execFileAsync("screencapture", ["-x", tmpPath])
    const buffer = await fs.promises.readFile(tmpPath)
    await fs.promises.unlink(tmpPath)
    return buffer
  }

  private async captureScreenshotWindows(): Promise<Buffer> {
    const display = screen.getPrimaryDisplay()
    // Capture in-process: no GUI helper startup or console fallback on Windows.
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
      }
    })
    const source = sources.find((candidate) => candidate.display_id === String(display.id))
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("Primary display capture unavailable")
    }
    return source.thumbnail.toPNG()
  }

  public async takeScreenshot(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.captureQueue.push({ resolve, reject })
      void this.processCaptureQueue()
    })
  }

  private async processCaptureQueue(): Promise<void> {
    if (this.captureInProgress || this.captureQueue.length === 0) return
    this.captureInProgress = true
    const item = this.captureQueue.shift()!

    let screenshotPath = ""
    try {
      console.log("Taking screenshot in view:", this.view)
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
      this.captureInProgress = false
      // Drain FIFO without opacity, visibility, focus, or artificial delay changes.
      void this.processCaptureQueue()
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
