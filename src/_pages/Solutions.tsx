// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

import { ProblemStatementData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"
import { normalizeScreenshotsResponse } from "../utils/screenshots"

// Markdown renderer component for consistent styling
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "")
        const language = match ? match[1] : ""

        return !inline && language ? (
          <SyntaxHighlighter
            style={dracula}
            language={language}
            PreTag="div"
            customStyle={{
              margin: "0.5rem 0",
              borderRadius: "8px",
              fontSize: "12px",
              backgroundColor: "rgba(0, 0, 0, 0.3)",
            }}
            {...props}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        ) : (
          <code
            className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400 font-mono text-xs"
            {...props}
          >
            {children}
          </code>
        )
      },
      p: ({ children }) => (
        <p className="mb-2 text-white/85 leading-relaxed">{children}</p>
      ),
      h1: ({ children }) => (
        <h1 className="text-lg font-bold mb-2 text-white mt-3">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-base font-semibold mb-2 text-white mt-2">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-sm font-medium mb-1 text-white/90 mt-1">{children}</h3>
      ),
      ul: ({ children }) => (
        <ul className="list-disc list-inside mb-2 space-y-1 text-white/80">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="list-decimal list-inside mb-2 space-y-1 text-white/80">{children}</ol>
      ),
      li: ({ children }) => <li className="text-white/80">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-indigo-500 pl-3 italic text-white/70 my-2">
          {children}
        </blockquote>
      ),
      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      em: ({ children }) => <em className="italic text-white/90">{children}</em>,
    }}
  >
    {content}
  </ReactMarkdown>
)

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2 w-full slide-up">
    <h2 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
      <div className="w-0.5 h-3 rounded-full bg-indigo-500" />
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-indigo-500 animate-spin" />
        <p className="text-sm text-white/50">Extracting...</p>
      </div>
    ) : (
      <div className="text-[13px] leading-relaxed text-white/80 w-full">
        {typeof content === "string" ? <MarkdownContent content={content} /> : content}
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
  <div className="space-y-2 w-full slide-up">
    <h2 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
      <div className="w-0.5 h-3 rounded-full bg-emerald-500" />
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-emerald-500 animate-spin" />
        <p className="text-sm text-white/50">Loading...</p>
      </div>
    ) : (
      <div className="w-full code-block overflow-hidden">
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
            backgroundColor: "transparent",
            fontSize: "12px",
            lineHeight: "1.6"
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
  <div className="space-y-2 w-full slide-up">
    <h2 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
      <div className="w-0.5 h-3 rounded-full bg-amber-500" />
      Complexity
    </h2>
    {isLoading ? (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-amber-500 animate-spin" />
        <p className="text-sm text-white/50">Calculating...</p>
      </div>
    ) : (
      <div className="flex gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <span className="text-xs font-medium text-blue-400">Time:</span>
          <span className="text-sm text-white/80">{timeComplexity}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <span className="text-xs font-medium text-purple-400">Space:</span>
          <span className="text-sm text-white/80">{spaceComplexity}</span>
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

  // Listen for model-used events to update the displayed model in real-time
  useEffect(() => {
    const unsubscribeModelUsed = window.electronAPI.onModelUsed((model: string) => {
      console.log("Model used event received:", model)
      setCurrentModel(model)
    })

    return () => {
      unsubscribeModelUsed()
    }
  }, [])

  const { showToast } = useToast()

  useEffect(() => {
    // Height update logic - send actual content height without restrictions
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        let contentWidth = contentRef.current.scrollWidth
        
        // Ensure minimum dimensions to prevent pill from disappearing
        // Minimum should fit the pill + some padding
        contentWidth = Math.max(contentWidth, 120)
        contentHeight = Math.max(contentHeight, 80)
        
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
      // Note: screenshot-taken is primarily handled by SubscribedApp for view switching
      // Here we just update our local extra screenshots state if still in Solutions view
      window.electronAPI.onScreenshotTaken(async () => {
        // This may be called right before view switches to queue
        // Only update if we're still mounted and visible
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
          // Silently ignore - we might be unmounting
          console.debug("Screenshot fetch in Solutions (might be unmounting):", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["problem_statement"]
        })
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })
        
        // Reset all state
        setProblemStatementData(null)
        setShortAnswerData(null)
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset ALL relevant states
        setProblemStatementData(null); // Reset problem statement
        setShortAnswerData(null); // Reset short answer
        setSolutionData(null);
        setThoughtsData(null);
        setTimeComplexityData(null);
        setSpaceComplexityData(null);
        
        // Also clear the query cache for fresh start
        queryClient.removeQueries({ queryKey: ["problem_statement"] });
        queryClient.removeQueries({ queryKey: ["solution"] });
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
        // Main container - Minimal Design
        <div ref={contentRef} className="w-full min-w-0 px-4 py-4">
          {/* Pill/Commands row */}
          <div className="mb-4">
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

          {/* Main Content - Minimal Glass Panel */}
          <div className="w-full glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-4 space-y-4">
              {/* Model indicator */}
              {currentModel && (
                <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
                  <div className="w-1.5 h-1.5 rounded-full status-online"></div>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">
                    Powered by <span className="text-white/60">{currentModel}</span>
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
                    <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-indigo-500 animate-spin" />
                      <p className="text-sm text-white/50">Generating solutions...</p>
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
                    title={`Explanation (${COMMAND_KEY}+↑↓ to move)`}
                    content={
                      thoughtsData && (
                        <div className="space-y-1.5">
                          {thoughtsData.map((thought, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                            >
                              <span className="text-[10px] font-medium text-indigo-400 mt-0.5 shrink-0">{index + 1}.</span>
                              <div className="text-white/80 text-sm flex-1">
                                <MarkdownContent content={thought} />
                              </div>
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
                <div className="pt-3 border-t border-white/[0.04]">
                  <div className="flex items-center justify-center gap-4 text-[10px] text-white/30">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] font-mono">{COMMAND_KEY}+↑↓</kbd>
                      <span>Move</span>
                    </span>
                    <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] font-mono">{COMMAND_KEY}+←→</kbd>
                      <span>Position</span>
                    </span>
                  </div>
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
