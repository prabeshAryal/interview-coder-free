import React from "react"
import ScreenshotItem from "./ScreenshotItem"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotQueueProps {
  isLoading: boolean
  screenshots: Screenshot[]
  onDeleteScreenshot: (index: number) => void
  itemSize?: "sm" | "md"
}
const ScreenshotQueue: React.FC<ScreenshotQueueProps> = ({
  isLoading,
  screenshots,
  onDeleteScreenshot,
  itemSize = "md"
}) => {
  if (screenshots.length === 0) {
    return <></>
  }

  const displayScreenshots = screenshots.slice(0, 5)

  return (
    // LAYOUT CONTROL: Container for screenshot thumbnails
    // 'gap-4' controls the space between thumbnails.
    // 'justify-start' aligns them to the left.
    <div className="flex gap-4 justify-start">
      {displayScreenshots.map((screenshot, index) => (
        <ScreenshotItem
          key={screenshot.path}
          isLoading={isLoading}
          screenshot={screenshot}
          index={index}
          onDelete={onDeleteScreenshot}
          size={itemSize}
        />
      ))}
    </div>
  )
}

export default ScreenshotQueue
