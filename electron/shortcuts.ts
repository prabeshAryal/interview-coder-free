import { globalShortcut, app } from "electron"
import { IShortcutsHelperDeps } from "./main"
import { clearConversationHistory } from "./ProcessingHelper"

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  public registerShortcuts(): void {
    const modifier = process.platform === "darwin" ? "Command" : "Control"
    const register = (accelerator: string, callback: () => void | Promise<void>) => {
      const registered = globalShortcut.register(accelerator, callback)
      if (!registered) {
        console.warn(
          `Global shortcut unavailable: ${accelerator}. It may already be used by another application.`
        )
      }
    }

    register(`${modifier}+H`, async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        console.log("=== Taking screenshot (Cmd+H) ===")
        try {
          const screenshotPath = await this.deps.takeScreenshot()
          console.log("Screenshot saved at:", screenshotPath)
          const preview = await this.deps.getImagePreview(screenshotPath)
          console.log("Preview generated, sending screenshot-taken event to renderer")
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
          console.log("screenshot-taken event sent successfully")
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    register(`${modifier}+Enter`, async () => {
      await this.deps.processingHelper?.processScreenshots()
    })

    register(`${modifier}+R`, () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.deps.processingHelper?.cancelOngoingRequests()

      // Clear both screenshot queues
      this.deps.clearQueues()
      
      // Clear conversation history
      clearConversationHistory()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.deps.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }
    })

    // New shortcuts for moving the window
    register(`${modifier}+Left`, () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    })

    register(`${modifier}+Right`, () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    })

    register(`${modifier}+Down`, () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.deps.moveWindowDown()
    })

    register(`${modifier}+Up`, () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.deps.moveWindowUp()
    })

    register(`${modifier}+B`, () => {
      this.deps.toggleMainWindow()
    })

    register(`${modifier}+[`, () => {
      this.deps.getMainWindow()?.webContents.send("navigate-view", "back")
    })
    register(`${modifier}+]`, () => {
      this.deps.getMainWindow()?.webContents.send("navigate-view", "forward")
    })

    // Voice recording toggle shortcut (Cmd/Ctrl + Shift + V)
    register(`${modifier}+Shift+V`, () => {
      console.log("Command/Ctrl + Shift + V pressed. Toggling voice recording.")
      this.deps.toggleVoiceRecording()
    })

    register(`${modifier}+Q`, () => app.quit())

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
