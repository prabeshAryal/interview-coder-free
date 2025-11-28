// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import { ProblemStatementData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"
import { normalizeScreenshotsResponse } from "../utils/screenshots"

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2 w-full">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 w-full">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  currentLanguage: string
}) => (
  <div className="space-y-2 w-full">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
            Loading solutions...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full">
        {/* @ts-ignore */}
        <SyntaxHighlighter
          showLineNumbers
          language={currentLanguage == "golang" ? "go" : currentLanguage}
          style={dracula}
          customStyle={{
            maxWidth: "100%",
            margin: 0,
            padding: "1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            backgroundColor: "rgba(22, 27, 34, 0.5)"
          }}
          wrapLongLines={true}
        >
          {content as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-2 w-full">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
        Calculating complexity...
      </p>
    ) : (
      <div className="space-y-1">
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [debugProcessing, setDebugProcessing] = useState(false);
  const [problemStatementData, setProblemStatementData] = useState<ProblemStatementData | null>(null);
  // Add state for the short answer
  const [shortAnswerData, setShortAnswerData] = useState<string | null>(null);
  const [solutionData, setSolutionData] = useState<string | null>(null);
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null);
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(null);
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(null); // Corrected syntax: removed extra closing parenthesis and duplicate line

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)
  const [currentModel, setCurrentModel] = useState<string>("")

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        console.log("Raw screenshot data:", existing)
        const previews = normalizeScreenshotsResponse(existing)
        const screenshots = previews.map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        console.log("Processed screenshots:", screenshots)
        setExtraScreenshots(screenshots)
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        setExtraScreenshots([])
      }
    }

    const fetchModel = async () => {
      try {
        const result = await window.electronAPI.getModel()
        if (result.success && result.model) {
          setCurrentModel(result.model)
        }
      } catch (error) {
        console.error("Error loading model:", error)
      }
    }

    fetchScreenshots()
    fetchModel()
  }, [solutionData])

  const { showToast } = useToast()

  useEffect(() => {
    // Height update logic - send actual content height without restrictions
    const updateDimensions = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        // Send full dimensions - don't add tooltip height separately
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
    
    // Initial update
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const previews = normalizeScreenshotsResponse(existing)
          const screenshots = previews.map(
            (p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states, including short answer
        setShortAnswerData(null); // Reset short answer
        setSolutionData(null);
        setThoughtsData(null);
        setTimeComplexityData(null);
        setSpaceComplexityData(null);
      }),
      window.electronAPI.onProblemExtracted((data) => {
        queryClient.setQueryData(["problem_statement"], data)
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", error, "error");
        // Reset solutions in the cache and complexities to previous states, including short answer
        const solution = queryClient.getQueryData(["solution"]) as {
          short_answer?: string | null; // Add optional short_answer
          code: string;
          thoughts: string[];
          time_complexity: string;
          space_complexity: string;
        } | null;
        if (!solution) {
          setView("queue");
        }
        setShortAnswerData(solution?.short_answer ?? null); // Correctly reset short answer using ?? null
        setSolutionData(solution?.code || null);
        setThoughtsData(solution?.thoughts || null);
        setTimeComplexityData(solution?.time_complexity || null);
        setSpaceComplexityData(solution?.space_complexity || null);
        console.error("Processing error:", error);
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return;
        }
        console.log({ data });
        // Expect data to potentially have short_answer
        const solutionPayload = {
          short_answer: data.short_answer, // Include short_answer
          code: data.code,
          thoughts: data.thoughts,
          time_complexity: data.time_complexity,
          space_complexity: data.space_complexity
        };

        queryClient.setQueryData(["solution"], solutionPayload);
        setShortAnswerData(solutionPayload.short_answer ?? null); // Correctly set short answer state using ?? null
        setSolutionData(solutionPayload.code || null);
        setThoughtsData(solutionPayload.thoughts || null);
        setTimeComplexityData(solutionPayload.time_complexity || null);
        setSpaceComplexityData(solutionPayload.space_complexity || null);

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const previews = normalizeScreenshotsResponse(existing)
            const screenshots = previews.map((p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            }))
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true)
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data) => {
        queryClient.setQueryData(["new_solution"], data)
        setDebugProcessing(false)
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
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
  }, []) // Remove isTooltipVisible and tooltipHeight dependencies

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )
    setSolutionData(queryClient.getQueryData(["solution"]) || null)

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          short_answer?: string | null; // Add optional short_answer
          code: string;
          thoughts: string[];
          time_complexity: string;
          space_complexity: string;
        } | null;

        setShortAnswerData(solution?.short_answer ?? null); // Correctly update short answer state from cache using ?? null
        setSolutionData(solution?.code ?? null);
        setThoughtsData(solution?.thoughts ?? null);
        setTimeComplexityData(solution?.time_complexity ?? null);
        setSpaceComplexityData(solution?.space_complexity ?? null);
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const previews = normalizeScreenshotsResponse(existing)
        const screenshots = previews.map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot", "error")
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
      showToast("Error", "Failed to delete the screenshot", "error")
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        // Main container - USE FULL WIDTH
        <div ref={contentRef} className="w-full min-w-0 px-4 py-3">
          {/* Pill/Commands row */}
          <div className="mb-3">
            <SolutionCommands
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              isProcessing={!problemStatementData || !solutionData}
              extraScreenshots={extraScreenshots}
              credits={credits}
              currentLanguage={currentLanguage}
              setLanguage={setLanguage}
              onDeleteScreenshot={handleDeleteExtraScreenshot}
            />
          </div>

          {/* Main Content - FULL WIDTH */}
          <div className="w-full solution-overlay rounded-lg">
            <div className="px-4 py-3 space-y-4">
              {/* Model indicator at top */}
              {currentModel && (
                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">
                    Powered by {currentModel}
                  </span>
                </div>
              )}

              {!solutionData && (
                <>
                  <ContentSection
                    title="Problem Statement"
                    content={problemStatementData?.problem_statement}
                    isLoading={!problemStatementData}
                  />
                  {problemStatementData && (
                    <div className="mt-4 flex">
                      <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                        Generating solutions...
                      </p>
                    </div>
                  )}
                </>
              )}

              {solutionData && (
                <>
                  {shortAnswerData && shortAnswerData.trim() !== "" && (
                    <ContentSection
                      title="Short Answer"
                      content={shortAnswerData}
                      isLoading={false}
                    />
                  )}
                  <ContentSection
                    title={`Explanation (${COMMAND_KEY}+↑↓ to move window)`}
                    content={
                      thoughtsData && (
                        <div className="space-y-2">
                          {thoughtsData.map((thought, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-2"
                            >
                              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                              <div>{thought}</div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    isLoading={!thoughtsData}
                  />

                  <SolutionSection
                    title="Solution"
                    content={solutionData}
                    isLoading={!solutionData}
                    currentLanguage={currentLanguage}
                  />

                  <ComplexitySection
                    timeComplexity={timeComplexityData}
                    spaceComplexity={spaceComplexityData}
                    isLoading={!timeComplexityData || !spaceComplexityData}
                  />
                </>
              )}

              {/* Bottom hint */}
              {solutionData && (
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] text-white/30 text-center">
                    Use {COMMAND_KEY}+↑/↓ to move window • {COMMAND_KEY}+← /→ to move horizontally
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Solutions
