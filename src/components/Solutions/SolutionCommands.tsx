import React, { useState, useEffect, useRef, useCallback } from "react"
import { Settings, Mic } from "lucide-react"
import { Screenshot } from "../../types/screenshots"
import { SettingsPanel } from "../shared/SettingsPanel"
import ScreenshotQueue from "../Queue/ScreenshotQueue"

export interface SolutionCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  isProcessing: boolean
  screenshots?: Screenshot[]
  extraScreenshots?: Screenshot[]
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  onDeleteScreenshot?: (index: number) => void
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  onTooltipVisibilityChange,
  isProcessing,
  screenshots = [],
  extraScreenshots = [],
  credits,
  currentLanguage,
  setLanguage,
  onDeleteScreenshot
}) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState({ bottom: 0, left: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Control window focusability based on panel state
  useEffect(() => {
    window.electronAPI.setWindowFocusable(isPanelOpen)
  }, [isPanelOpen])

  // Update panel position when pill is clicked - position ABOVE the pill
  useEffect(() => {
    if (isPanelOpen && pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect()
      setPanelPosition({
        bottom: window.innerHeight - rect.top + 8, // Position above pill
        left: rect.left
      })
    }
  }, [isPanelOpen])

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

  // Notify parent about panel visibility
  useEffect(() => {
    onTooltipVisibilityChange(isPanelOpen, isPanelOpen ? 280 : 0)
  }, [isPanelOpen, onTooltipVisibilityChange])

  // Voice recording functions
  const startRecording = useCallback(async () => {
    if (isRecording || mediaRecorderRef.current) return
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const arrayBuffer = await audioBlob.arrayBuffer()
        const base64Audio = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        
        // Send audio data to main process for processing
        try {
          await window.electronAPI.processVoiceAudio(base64Audio)
        } catch (error) {
          console.error('Error processing voice audio:', error)
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        // Clear refs so next recording can start
        mediaRecorderRef.current = null
        audioChunksRef.current = []
      }
      
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      console.log('Voice recording started (Solutions view)')
    } catch (error) {
      console.error('Error starting recording:', error)
      mediaRecorderRef.current = null
    }
  }, [isRecording])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('Voice recording stopped (Solutions view)')
    }
  }, [isRecording])

  // Listen for voice recording keyboard shortcut
  useEffect(() => {
    const handleRecordingStarted = () => {
      console.log('Voice recording shortcut triggered (Solutions view), isRecording:', isRecording, 'mediaRecorder:', !!mediaRecorderRef.current)
      if (!isRecording && !mediaRecorderRef.current) {
        startRecording()
      }
    }

    const handleRecordingStopped = () => {
      console.log('Voice recording stop triggered (Solutions view)')
      stopRecording()
    }

    const unsubscribeStart = window.electronAPI.onVoiceRecordingStarted(handleRecordingStarted)
    const unsubscribeStop = window.electronAPI.onVoiceRecordingStopped(handleRecordingStopped)

    return () => {
      unsubscribeStart()
      unsubscribeStop()
    }
  }, [isRecording, startRecording, stopRecording])

  return (
    <>
      {/* Main row with pill and screenshots */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Pill */}
        <div
          ref={pillRef}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-[#0a0a0a]/90 backdrop-blur-md border border-white/10 rounded-full shadow-lg cursor-pointer hover:bg-[#0a0a0a] hover:border-white/20 transition-all duration-200"
        >
          {/* Recording Indicator or Online Indicator */}
          {isRecording ? (
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </div>
          ) : (
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
          )}

          {/* Separator */}
          <div className="w-px h-4 bg-white/10" />

          {/* Recording Icon when active, otherwise Settings Icon */}
          {isRecording ? (
            <Mic className="w-4 h-4 text-red-400 animate-pulse" />
          ) : (
            <Settings className={`w-4 h-4 text-white/60 transition-transform duration-300 ${isPanelOpen ? 'rotate-90 text-white' : ''}`} />
          )}
        </div>

        {/* Screenshots next to pill */}
        {extraScreenshots.length > 0 && (
          <div className={`transition-opacity duration-200 ${isProcessing ? "opacity-50" : "opacity-100"}`}>
            <ScreenshotQueue
              isLoading={isProcessing}
              screenshots={extraScreenshots}
              onDeleteScreenshot={onDeleteScreenshot || (() => {})}
              itemSize="sm"
            />
          </div>
        )}
      </div>

      {/* Settings Panel - FIXED positioning ABOVE the pill */}
      {isPanelOpen && (
        <div
          ref={panelRef}
          className="fixed w-72 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[9999]"
          style={{
            bottom: panelPosition.bottom,
            left: panelPosition.left
          }}
        >
          <div className="p-3">
            <SettingsPanel
              currentLanguage={currentLanguage}
              setLanguage={setLanguage}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default SolutionCommands
