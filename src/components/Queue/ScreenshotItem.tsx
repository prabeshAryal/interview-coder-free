// src/components/ScreenshotItem.tsx
import React from "react"
import { X } from "lucide-react"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotItemProps {
  screenshot: Screenshot
  onDelete: (index: number) => void
  index: number
  isLoading: boolean
  size?: "sm" | "md"
}

const ScreenshotItem: React.FC<ScreenshotItemProps> = ({
  screenshot,
  onDelete,
  index,
  isLoading,
  size = "md"
}) => {
  const handleDelete = async () => {
    await onDelete(index)
  }

  const sizeClasses = size === "sm" ? "w-[100px] h-[60px]" : "w-[156px] h-[92px]"

  return (
    <>
      <div
        className={`glass-panel relative ${sizeClasses} rounded-xl overflow-hidden ${isLoading ? "" : "group focusable cursor-pointer"
          }`}
        tabIndex={isLoading ? -1 : 0}
        role="button"
        aria-label={`Screenshot ${index + 1}`}
      >
        <div className="w-full h-full relative">
          {isLoading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 z-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img
            src={screenshot.preview}
            alt={`Screenshot ${index + 1}`}
            className={`w-full h-full object-cover transition-transform duration-300 ${isLoading
              ? "opacity-50"
              : "group-hover:scale-105 group-hover:brightness-75"
              }`}
          />
        </div>
        {!isLoading && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            className="absolute top-2 left-2 p-1 rounded-full bg-black/70 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            aria-label={`Delete screenshot ${index + 1}`}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </>
  )
}

export default ScreenshotItem
