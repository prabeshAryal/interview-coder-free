# Plan: Fix Model Display, Voice Duplication, Error Handling & UI Issues

This plan addresses 6 key issues: missing model display, voice code duplication, rate limit crashes, UI alignment problems, SSL/screenshot errors, and code inconsistencies. The approach unifies configurations, adds graceful error handling, and fixes UI positioning.

## Steps

1. **Unify AI configuration constants** - Create a shared config in `electron/config.ts` (new file) with default model (`gemini-2.5-flash`), model list, and retry settings. Update `ProcessingHelper.ts` (line 55) and `VoiceHelper.ts` (line 117) to import from this shared config.

2. **Add rate limit handling with fallback** - Modify `callAIWithFallback()` in `ProcessingHelper.ts` (lines 47-96) to detect HTTP 429 errors, add exponential backoff retry (2-5 seconds), and emit user-friendly error messages instead of throwing. Add silent fallback to next model without crashing.

3. **Refactor VoiceHelper to reuse ProcessingHelper** - In `VoiceHelper.ts` (lines 117-192), replace the duplicated Gemini API call logic with a call to `ProcessingHelper.callAIWithFallback()`, passing the voice transcription context.

4. **Create shared voice recording hook** - Create `src/hooks/useVoiceRecording.ts` (new file) with unified recording logic. Update `QueueCommands.tsx` (lines 55-99) and `SolutionCommands.tsx` (lines 73-122) to use the shared hook, using consistent MIME type `audio/webm;codecs=opus`.

5. **Fix model display in UI** - In `Solutions.tsx`, add IPC listener for model changes (after line 244). Update `SettingsPanel.tsx` to emit model change events. Add model name pill display in `Queue.tsx` similar to Solutions view.

6. **Center the pill and fix settings panel** - In `SubscribedApp.tsx` (line 147), change positioning from `fixed bottom-4 left-4` to `fixed bottom-4 left-1/2 transform -translate-x-1/2`. In `SettingsPanel.tsx` (lines 197-209), add overflow handling and dynamic positioning to ensure visibility.

7. **Add SSL/network error recovery** - In `ProcessingHelper.ts` (lines 84-89), wrap API calls with network error detection and automatic retry for transient SSL failures. Add timeout (30s) to screenshot capture in `ScreenshotHelper.ts` (lines 86-100).

8. **Unify types and fix global.d.ts** - Populate `src/types/global.d.ts` with proper `Window.electronAPI` type definitions. Unify `Screenshot` interface across `src/types/screenshots.ts`, `Solutions.tsx` (lines 215-217), and renderer types, using consistent `preview` property name.

## Further Considerations

1. **Should rate limit retry delay be configurable?** Recommend: Google PAI has per minute rate limit and so on, it must better switch to another model rather than retrying, not only fallback better make a proper order, 3 preview first peirity, 2.5 and 2.5 flash and 2.0 flash, thats it, in order order, there can be no othe rmodel than that or shwivehcr already are there, jus maintain peroper order while using fallback if 2.5 pr is being sued decreadse to 2.5 and so on. 3.0 is being used decrease to 2.5 pro , 2.5 flash , cearese to 2.0 flash. 2.0 no fallback, there is something worng somehwere. 

2. **VoiceHelper complete refactor vs minimal fix?** Recommend: full refactor to match further part of codebase improvements. IF possible allow listenining on screens contexts or desktop audio, not only mic. and so on. Make it as best as you can. 

3. **Should model changes require app restart?** Recommend: No - implement live model switching via IPC event `model-changed` for seamless UX.
