import React, { useState, useEffect, useRef } from "react"
import { Settings, Check, X, Loader2 } from "lucide-react"
import { useToast } from "../../contexts/toast"
import { SettingsPanel } from "../shared/SettingsPanel"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  onPanelToggle?: (isOpen: boolean) => void
  screenshotCount?: number
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onPanelToggle,
  currentLanguage,
  setLanguage
}) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)

  // Control window focusability based on panel state
  useEffect(() => {
    window.electronAPI.setWindowFocusable(isPanelOpen)
  }, [isPanelOpen])

  useEffect(() => {
    if (onPanelToggle) {
      onPanelToggle(isPanelOpen)
    }
  }, [isPanelOpen, onPanelToggle])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        pillRef.current &&
        !pillRef.current.contains(event.target as Node)
      ) {
        setIsPanelOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <>
      {/* The Pill */}
      <div
        ref={pillRef}
        className="fixed bottom-4 left-4 z-[9999] flex items-center gap-3 px-3 py-2 bg-[#0a0a0a]/90 backdrop-blur-md border border-white/10 rounded-full shadow-2xl transition-all duration-300 hover:bg-[#0a0a0a] group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Online Indicator */}
        <div className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-white/10" />

        {/* Settings Gear */}
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className={`p-1.5 rounded-full transition-all duration-300 ${isPanelOpen ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'} cursor-interactive`}
        >
          <Settings className={`w-4 h-4 transition-transform duration-500 ${isHovered ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Expanded Settings Panel */}
      <div
        ref={panelRef}
        className={`fixed bottom-16 left-4 w-72 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 origin-bottom-left z-[9998] ${isPanelOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none"
          }`}
      >
        <div className="p-1">
          <SettingsPanel
            currentLanguage={currentLanguage}
            setLanguage={setLanguage}
          />
        </div>
      </div>
    </>
  )
}

export default QueueCommands
