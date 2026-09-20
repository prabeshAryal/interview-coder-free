import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import Queue from "./Queue"
import Solutions from "./Solutions"
import { AppToolbar, ToolbarPanel } from "../components/shared/AppToolbar"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"

interface SubscribedAppProps {
  currentLanguage: string
  setLanguage: (language: string) => void
}

const SubscribedApp: React.FC<SubscribedAppProps> = ({ currentLanguage, setLanguage }) => {
  const queryClient = useQueryClient()
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const [hasResponse, setHasResponse] = useState(false)
  const [panel, setPanel] = useState<ToolbarPanel>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const changeView = useCallback((next: "queue" | "solutions" | "debug") => {
    setPanel(null)
    setView(next)
  }, [])

  useEffect(() => {
    const cleanups = [
      window.electronAPI.onScreenshotTaken(() => {
        changeView("queue")
        queryClient.invalidateQueries({ queryKey: ["screenshots"] })
      }),
      window.electronAPI.onSolutionStart(() => {
        setHasResponse(true)
        changeView("solutions")
      }),
      window.electronAPI.onResetView(() => {
        setHasResponse(false)
        changeView("queue")
        for (const key of ["screenshots", "solution", "problem_statement", "new_solution"]) {
          queryClient.removeQueries({ queryKey: [key] })
        }
      }),
      window.electronAPI.onUnauthorized(() => changeView("queue")),
      window.electronAPI.onSolutionError((error) => showToast("Error", error, "error"))
    ]
    return () => cleanups.forEach(cleanup => cleanup())
  }, [changeView, queryClient, showToast])

  useEffect(() => {
    return window.electronAPI.onNavigateView((direction) => {
      if (panel) {
        setPanel(null)
        return
      }
      if (direction === "back") changeView("queue")
      else if (hasResponse) changeView("solutions")
    })
  }, [panel, hasResponse, changeView])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        window.electronAPI.updateContentDimensions({
          width: content.clientWidth,
          height: Math.max(content.scrollHeight + 72, panel ? 520 : 160),
          view: view === "queue" ? "queue" : "solutions"
        })
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    measure()
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [view, panel])

  return (
    <div className="app-workspace">
      <AppToolbar currentLanguage={currentLanguage} setLanguage={setLanguage} panel={panel} setPanel={setPanel} />
      <main className="workspace-scroll" aria-label={view === "queue" ? "Screenshots" : "Response"}>
        <div ref={contentRef}>
          {view === "queue" && (
            <>
              <Queue setView={changeView} currentLanguage={currentLanguage} setLanguage={setLanguage} />
              <p className="px-4 pb-4 text-center text-xs text-white/60">
                {hasResponse ? `Return to your response with ${COMMAND_KEY} + ]` : `Capture with ${COMMAND_KEY} + H · Process with ${COMMAND_KEY} + Enter`}
              </p>
            </>
          )}
          {/* Keep response state and event subscriptions alive when navigating back. */}
          <div hidden={view === "queue"}>
            <Solutions setView={changeView} currentLanguage={currentLanguage} setLanguage={setLanguage} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default SubscribedApp
