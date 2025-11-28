import { useState, useRef, useCallback, useEffect } from "react"

/** Voice recording configuration */
const VOICE_CONFIG = {
  MIME_TYPE: "audio/webm;codecs=opus",
  MAX_DURATION_MS: 60000
} as const

interface UseVoiceRecordingOptions {
  onRecordingStart?: () => void
  onRecordingStop?: () => void
  onAudioReady?: (base64Audio: string) => void
  onError?: (error: string) => void
}

interface UseVoiceRecordingReturn {
  isRecording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  toggleRecording: () => Promise<void>
}

/**
 * Shared hook for voice recording functionality
 * Centralizes audio recording logic to avoid duplication between Queue and Solutions views
 */
export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingReturn {
  const { onRecordingStart, onRecordingStop, onAudioReady, onError } = options
  
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup function to stop all tracks
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    audioChunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (isRecording || mediaRecorderRef.current) {
      console.log("Already recording, ignoring start request")
      return
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create MediaRecorder with consistent MIME type
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: VOICE_CONFIG.MIME_TYPE
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Create blob from recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: VOICE_CONFIG.MIME_TYPE })
        
        // Convert to base64
        const arrayBuffer = await audioBlob.arrayBuffer()
        const base64Audio = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        // Notify caller
        onAudioReady?.(base64Audio)

        // Cleanup
        cleanupStream()
      }

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event)
        onError?.("Recording error occurred")
        cleanupStream()
        setIsRecording(false)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      
      // Notify main process
      await window.electronAPI.startVoiceRecording()
      onRecordingStart?.()
      
      console.log("Voice recording started")
    } catch (error: any) {
      console.error("Error starting recording:", error)
      onError?.(error.message || "Could not access microphone")
      cleanupStream()
      setIsRecording(false)
    }
  }, [isRecording, onRecordingStart, onAudioReady, onError, cleanupStream])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) {
      console.log("Not recording, ignoring stop request")
      return
    }

    try {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      
      setIsRecording(false)
      
      // Notify main process
      await window.electronAPI.stopVoiceRecording()
      onRecordingStop?.()
      
      console.log("Voice recording stopped")
    } catch (error: any) {
      console.error("Error stopping recording:", error)
      onError?.(error.message || "Error stopping recording")
      cleanupStream()
      setIsRecording(false)
    }
  }, [isRecording, onRecordingStop, onError, cleanupStream])

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Listen for voice recording events from keyboard shortcuts
  useEffect(() => {
    const unsubscribeStart = window.electronAPI.onVoiceRecordingStarted(() => {
      console.log("Voice recording started event received (from shortcut)")
      if (!isRecording && !mediaRecorderRef.current) {
        startRecording()
      }
    })

    const unsubscribeStop = window.electronAPI.onVoiceRecordingStopped(() => {
      console.log("Voice recording stopped event received (from shortcut)")
      if (isRecording && mediaRecorderRef.current) {
        stopRecording()
      }
    })

    return () => {
      unsubscribeStart()
      unsubscribeStop()
    }
  }, [isRecording, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStream()
    }
  }, [cleanupStream])

  return {
    isRecording,
    startRecording,
    stopRecording,
    toggleRecording
  }
}

export default useVoiceRecording
