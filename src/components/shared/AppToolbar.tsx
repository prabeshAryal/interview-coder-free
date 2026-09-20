import { useEffect, useRef } from "react"
import { GripVertical, HelpCircle, Mic, Settings, Square, X } from "lucide-react"
import { SettingsPanel } from "./SettingsPanel"
import { useVoiceRecording } from "../../hooks/useVoiceRecording"
import { useToast } from "../../contexts/toast"
import { COMMAND_KEY } from "../../utils/platform"

export type ToolbarPanel = "settings" | "help" | null

const shortcuts = [
  ["B", "Show / hide window"],
  ["[", "Back to screenshots"],
  ["]", "Return to response"],
  ["H", "Capture screenshot"],
  ["Enter", "Process screenshots"],
  ["Shift + V", "Start / stop recording"],
  ["Arrow keys", "Move window"],
  ["R", "Reset conversation"],
  ["Q", "Quit app"]
]

export function AppToolbar({ currentLanguage, setLanguage, panel, setPanel }: {
  currentLanguage: string
  setLanguage: (language: string) => void
  panel: ToolbarPanel
  setPanel: (panel: ToolbarPanel) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()
  const { isRecording, toggleRecording } = useVoiceRecording({
    onAudioReady: async (audio) => {
      try {
        const result = await window.electronAPI.processVoiceAudio(audio)
        if (!result.success) showToast("Voice input", result.error || "Could not process recording.", "error")
      } catch {
        showToast("Voice input", "Could not process recording. Please try again.", "error")
      }
    },
    onError: (error) => showToast("Voice input", error, "error")
  })

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault()
        setPanel(panel === "help" ? null : "help")
      } else if (event.key === "Escape" && panel) {
        event.preventDefault()
        setPanel(null)
        ;(panel === "help" ? helpRef : settingsRef).current?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [panel, setPanel])

  return (
    <div ref={rootRef} className="app-toolbar">
      <div className="app-pill" role="toolbar" aria-label="App controls">
        <div className="window-drag-handle" title={`Drag to move · ${COMMAND_KEY} + Arrow keys`}>
          <GripVertical size={16} aria-hidden="true" />
        </div>
        <span className={`h-2 w-2 shrink-0 rounded-full ${isRecording ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} aria-label={isRecording ? "Recording" : "Ready"} />
        <button className="pill-control" onClick={toggleRecording} aria-label={isRecording ? "Stop recording" : "Start recording"} title={`${COMMAND_KEY} + Shift + V`}>
          {isRecording ? <Square size={16} /> : <Mic size={16} />}
        </button>
        <span className="pill-shortcut" title="Show / hide window">{COMMAND_KEY}+B</span>
        <button ref={helpRef} className="pill-control" onClick={() => setPanel(panel === "help" ? null : "help")} aria-label="Keyboard shortcuts" aria-expanded={panel === "help"} aria-controls="toolbar-help" title="Keyboard shortcuts (F1)">
          <HelpCircle size={16} />
        </button>
        <button ref={settingsRef} className="pill-control" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Settings" aria-expanded={panel === "settings"} aria-controls="toolbar-settings" title="Settings">
          <Settings size={16} />
        </button>
      </div>
      {panel && (
        <section id={`toolbar-${panel}`} className="toolbar-panel" aria-label={panel === "help" ? "Keyboard shortcuts" : "Settings"}>
          <button className="pill-control float-right relative z-10" aria-label="Close panel" onClick={() => { setPanel(null); (panel === "help" ? helpRef : settingsRef).current?.focus() }}><X size={15} /></button>
          {panel === "settings" ? <SettingsPanel currentLanguage={currentLanguage} setLanguage={setLanguage} /> : (
            <>
              <h2 className="text-sm font-medium mb-4">Keyboard shortcuts</h2>
              <dl className="space-y-3">
                {shortcuts.map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-white/70">{label}</dt>
                    <dd><kbd className="shortcut-key">{COMMAND_KEY} + {key}</kbd></dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-white/50 mt-4 border-t border-white/10 pt-3">Back keeps your response and conversation. Drag the grip to reposition the window. F1 opens help; Esc closes this panel while the app is focused.</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}
