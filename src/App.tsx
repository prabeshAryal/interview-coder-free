import SubscribedApp from "./_pages/SubscribedApp"
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient
} from "@tanstack/react-query"
import { useEffect, useState, useCallback } from "react"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
})

// Root component that provides the QueryClient
function App() {
  const [toastState, setToastState] = useState<{
    open: boolean
    title: string
    description: string
    variant: "neutral" | "success" | "error"
  }>({
    open: false,
    title: "",
    description: "",
    variant: "neutral"
  })
  const [credits, setCredits] = useState<number>(999) // Set a high default value
  const [currentLanguage, setCurrentLanguage] = useState<string>("python")
  const [isInitialized, setIsInitialized] = useState(false)

  // Helper function to safely update credits
  const updateCredits = useCallback((newCredits: number) => {
    setCredits(newCredits)
    window.__CREDITS__ = newCredits
  }, [])

  // Helper function to safely update language
  const updateLanguage = useCallback((newLanguage: string) => {
    setCurrentLanguage(newLanguage)
    window.__LANGUAGE__ = newLanguage
  }, [])

  // Helper function to mark initialization complete
  const markInitialized = useCallback(() => {
    setIsInitialized(true)
    window.__IS_INITIALIZED__ = true
  }, [])

  // Show toast method
  const showToast = useCallback(
    (
      title: string,
      description: string,
      variant: "neutral" | "success" | "error"
    ) => {
      setToastState({
        open: true,
        title,
        description,
        variant
      })
    },
    []
  )

  // Initialize app with default values
  useEffect(() => {
    // Set default values
    updateCredits(999) // High number of credits
    updateLanguage("python")
    markInitialized()
  }, [updateCredits, updateLanguage, markInitialized])

  // Close toast after delay
  useEffect(() => {
    if (toastState.open) {
      const timer = setTimeout(() => {
        setToastState((prev) => ({ ...prev, open: false }))
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [toastState.open])

  // Global click-through hit testing for transparent overlay
  // Only the pill and active popup/settings panel capture mouse clicks.
  // All other transparent regions pass mouse clicks through to windows underneath.
  useEffect(() => {
    let isCurrentlyIgnoring: boolean | null = null

    const setIgnore = (ignore: boolean) => {
      if (isCurrentlyIgnoring === ignore) return
      isCurrentlyIgnoring = ignore
      window.electronAPI?.setIgnoreMouseEvents(ignore, { forward: true })
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const isInteractive = !!target?.closest(
        ".interactive-area, button, input, textarea, select, [role='button'], a, .cursor-interactive, .glass-panel, .code-block, [role='dialog'], [data-state='open']"
      )
      setIgnore(!isInteractive)
    }

    const handleMouseLeave = () => {
      setIgnore(true)
    }

    // Start with ignore=true on transparent regions
    setIgnore(true)

    window.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseleave", handleMouseLeave)
      window.electronAPI?.setIgnoreMouseEvents(false)
    }
  }, [])

  // Render the main app directly without authentication check
  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={{ showToast }}>
        <ToastProvider>
          <div className="min-h-screen bg-transparent">
            <SubscribedApp
              credits={credits}
              currentLanguage={currentLanguage}
              setLanguage={updateLanguage}
            />
            <Toast
              open={toastState.open}
              onOpenChange={(open) =>
                setToastState((prev) => ({ ...prev, open }))
              }
              variant={toastState.variant}
            >
              <div className="grid gap-1">
                {toastState.title && <ToastTitle>{toastState.title}</ToastTitle>}
                {toastState.description && (
                  <ToastDescription>{toastState.description}</ToastDescription>
                )}
              </div>
            </Toast>
            <ToastViewport />
          </div>
        </ToastProvider>
      </ToastContext.Provider>
    </QueryClientProvider>
  )
}

export default App
