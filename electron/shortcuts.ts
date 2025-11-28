import { globalShortcut, app } from "electron"
import { IShortcutsHelperDeps } from "./main"
import { clearConversationHistory } from "./ProcessingHelper"

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  public registerShortcuts(): void {
    globalShortcut.register("CommandOrControl+H", async () => {
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

    globalShortcut.register("CommandOrControl+Enter", async () => {
      await this.deps.processingHelper?.processScreenshots()
    })

    globalShortcut.register("CommandOrControl+R", () => {
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
    globalShortcut.register("CommandOrControl+Left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    })

    globalShortcut.register("CommandOrControl+Right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    })

    globalShortcut.register("CommandOrControl+Down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.deps.moveWindowDown()
    })

    globalShortcut.register("CommandOrControl+Up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.deps.moveWindowUp()
    })

    globalShortcut.register("CommandOrControl+B", () => {
      this.deps.toggleMainWindow()
    })

    // Voice recording toggle shortcut (Cmd/Ctrl + Shift + V)
    globalShortcut.register("CommandOrControl+Shift+V", () => {
      console.log("Command/Ctrl + Shift + V pressed. Toggling voice recording.")
      this.deps.toggleVoiceRecording()
    })

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
