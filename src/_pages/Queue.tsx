import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { useToast } from "../contexts/toast"
import { Screenshot } from "../types/screenshots"
import { normalizeScreenshotsResponse } from "../utils/screenshots"

async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const response = await window.electronAPI.getScreenshots()
    return normalizeScreenshotsResponse(response)
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

interface QueueProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  currentLanguage: string
  setLanguage: (language: string) => void
}

const Queue: React.FC<QueueProps> = ({
  setView,
  currentLanguage,
  setLanguage
}) => {
  const { showToast } = useToast()

  const contentRef = useRef<HTMLDivElement>(null)

  const {
    data: screenshots = [],
    isLoading,
    refetch
  } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch() // Refetch screenshots instead of managing state directly
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  useEffect(() => {
    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),

      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue") // Revert to queue if processing fails
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      }),

    ]

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [refetch, setView, showToast])


  return (
    <div
      ref={contentRef}
      className={`bg-transparent w-full min-w-0 p-4 flex flex-col items-center gap-4 transition-all duration-300 ease-in-out`}
    >
      <ScreenshotQueue
        isLoading={isLoading}
        screenshots={screenshots}
        onDeleteScreenshot={handleDeleteScreenshot}
      />
    </div>
  )
}

export default Queue
