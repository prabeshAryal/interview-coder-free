import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import QueueCommands from "../components/Queue/QueueCommands"

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
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}

const Queue: React.FC<QueueProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage
}) => {
  const { showToast } = useToast()

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
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
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        let contentWidth = contentRef.current.scrollWidth

        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }

        // Base minimums for the floating UI (button)
        // Even if content is empty, we need space for the button
        contentWidth = Math.max(contentWidth, 60)
        contentHeight = Math.max(contentHeight, 60)

        // If panel is open, ensure we have enough space for it
        if (isPanelOpen) {
          // Panel is w-80 (320px) + padding. Let's reserve enough space.
          // The panel is absolute positioned, so we need to explicitly add its dimensions.
          contentWidth = Math.max(contentWidth, 350)
          contentHeight = Math.max(contentHeight, 600)
        }

        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

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
      window.electronAPI.onOutOfCredits(() => {
        showToast(
          "Out of Credits",
          "You are out of credits. Please refill at https://www.interviewcoder.co/settings.",
          "error"
        )
      })
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight, isPanelOpen])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  return (
    <div
      ref={contentRef}
      className={`bg-transparent w-full min-w-[120px] p-4 flex flex-col items-center gap-4 transition-all duration-300 ease-in-out`}
    >
      <ScreenshotQueue
        isLoading={false}
        screenshots={screenshots}
        onDeleteScreenshot={handleDeleteScreenshot}
      />

      <QueueCommands
        onTooltipVisibilityChange={handleTooltipVisibilityChange}
        onPanelToggle={setIsPanelOpen}
        screenshotCount={screenshots.length}
        credits={credits}
        currentLanguage={currentLanguage}
        setLanguage={setLanguage}
      />
    </div>
  )
}

export default Queue
