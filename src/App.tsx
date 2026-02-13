import { useState, useRef, useEffect, useMemo } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import logoSvg from "./assets/logo.svg";
import { PencilIcon } from "./components/icons";
import { SeekButton } from "./components/SeekButton";
import { ProgressBar } from "./components/ProgressBar";
import "./App.css";

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [atStart, setAtStart] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const waveformBars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        height: Math.random() * 100,
        delay: i * 0.1,
      })),
    [],
  );

  useEffect(() => {
    const resizeToContent = async () => {
      try {
        const el = controlBarRef.current;
        if (!el) return;
        // Wait for content to be fully rendered
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        const { width, height } = el.getBoundingClientRect();
        if (width > 0 && height > 0) {
          const appWindow = getCurrentWindow();
          await appWindow.setSize(
            new LogicalSize(Math.ceil(width), Math.ceil(height)),
          );
        }
      } catch (e) {
        console.warn("[resizeToContent] setSize failed or not in Tauri:", e);
      }
    };
    // Run immediately and also after a short delay to ensure content is rendered
    resizeToContent();
    const timeoutId = setTimeout(resizeToContent, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  // Poll TTS status and position to sync UI state and detect when audio finishes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await invoke<[boolean, boolean]>("tts_get_status");
        const [isPlayingBackend, isPausedBackend] = status;
        // Update isPlaying: true only if playing and not paused
        setIsPlaying(isPlayingBackend && !isPausedBackend);
        setIsPaused(isPausedBackend);

        // Get position if audio is active
        if (isPlayingBackend) {
          const position = await invoke<[number, number]>("tts_get_position");
          const [currentMs, totalMs] = position;

          // Update progress bar
          if (totalMs > 0) {
            setProgress((currentMs / totalMs) * 100);
          } else {
            setProgress(0);
          }

          // Check bounds
          setAtStart(currentMs === 0);
          setAtEnd(currentMs >= totalMs);
        } else {
          // No audio playing - reset state
          setProgress(0);
          setAtStart(false);
          setAtEnd(false);
        }
      } catch (e) {
        // If status check fails, assume not playing
        setIsPlaying(false);
        setIsPaused(false);
        setProgress(0);
        setAtStart(false);
        setAtEnd(false);
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = async () => {
    try {
      // Check current playback status
      const status = await invoke<[boolean, boolean]>("tts_get_status");
      const [isPlayingBackend] = status;

      if (isPlayingBackend) {
        // Audio is currently playing or paused - toggle pause state
        const newPausedState = await invoke<boolean>("tts_toggle_pause");
        // Update UI: isPlaying should be true only if playing and not paused
        setIsPlaying(!newPausedState);
      } else {
        // No audio is playing - start new playback from selected text
        const text = await invoke<string | null>("get_selected_text");
        if (text != null && text.length > 0) {
          await invoke("tts_speak", { text });
          setIsPlaying(true);
        }
      }
    } catch (e) {
      console.error("handlePlayPause failed:", e);
    }
  };

  const handleStop = async () => {
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setAtStart(false);
    setAtEnd(false);
    try {
      await invoke("tts_stop");
    } catch (e) {
      console.warn("tts_stop failed:", e);
    }
  };

  const handleSettings = () => {
    // TODO: Open settings window
  };

  const handleCamera = async () => {
    try {
      const platform = await invoke<string>("get_platform");
      const isMacOS = platform === "macos";
      
      // Capture screenshot and OCR (OCR result ignored on macOS)
      const [ocrResult, imagePath] = await invoke<[
        { items: Array<{ text: string; bounding_box: { x: number; y: number; width: number; height: number }; confidence: number }>; full_text: string },
        string
      ]>("capture_screenshot_and_ocr");
      
      // Open live text viewer window (OCR data is null on macOS)
      try {
        await invoke("open_live_text_viewer", { 
          imagePath,
          ocrResult: isMacOS ? null : ocrResult,
        });
      } catch (viewerError) {
        console.error("Failed to open live text viewer:", viewerError);
      }
    } catch (e) {
      // Handle structured error response: { type: "cancelled" | "screenshot" | "ocr", message?: string }
      if (typeof e === "object" && e !== null && "type" in e) {
        const error = e as { type: string; message?: string };
        if (error.type === "cancelled") return; // User cancelled - silently return
        const errorType = error.type === "screenshot" ? "Screenshot" : "OCR";
        console.error(`${errorType} error:`, error.message || "Unknown error");
        return;
      }
      
      // Fallback for non-structured errors
      const errorMsg = typeof e === "string" ? e : (e instanceof Error ? e.message : String(e));
      if (errorMsg.toLowerCase().includes("cancelled")) return; // User cancelled
      console.error("Live text capture failed:", e);
      if (e instanceof Error) {
        console.error("Error details:", e.message, e.stack);
      }
    }
  };

  const handleEditor = async () => {
    try {
      // Same logic as "Insight Editor" tray item: selected text, else clipboard, else ""
      const sel = await invoke<string | null>("get_selected_text");
      const text =
        sel != null
          ? sel
          : ((await invoke<string | null>("get_clipboard_text")) ?? "");
      await invoke("open_editor_window", { initialText: text });
    } catch (e) {
      console.warn("open_editor_window failed:", e);
    }
  };

  const handleSeek = async (offsetMs: number, disabled: boolean) => {
    if (isPaused || disabled) return;

    try {
      const result = await invoke<[boolean, boolean, boolean]>("tts_seek", {
        offsetMs,
      });
      const [, atStartResult, atEndResult] = result;

      // Update position immediately for responsive UI
      const position = await invoke<[number, number]>("tts_get_position");
      const [currentMs, totalMs] = position;

      // Batch state updates to avoid race conditions
      const progress = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;
      setAtStart(atStartResult);
      setAtEnd(atEndResult);
      setProgress(progress);
    } catch (e) {
      console.warn(
        `tts_seek ${offsetMs > 0 ? "forward" : "backward"} failed:`,
        e,
      );
    }
  };

  const backwardDisabled = isPaused || atStart || !isPlaying;
  const forwardDisabled = isPaused || atEnd || !isPlaying;

  const handleBackward = () => handleSeek(-5000, atStart);
  const handleForward = () => handleSeek(5000, atEnd);

  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only start dragging if clicking on the control bar itself, not on buttons
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  return (
    <main className="main-container">
      <div
        ref={controlBarRef}
        className="control-bar"
        onMouseDown={handleMouseDown}
      >
        {/* Column 1: App Logo */}
        <div className="column column-logo">
          <div className="logo-container">
            <img src={logoSvg} alt="Insight Reader" className="logo" />
          </div>
          <div className="logo-label">
            Insight
            <br />
            Reader
          </div>
        </div>

        {/* Column 2: Playback Controls */}
        <div className="column column-playback">
          <div className="playback-row">
            <button
              className="control-button play-pause"
              onClick={handlePlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="3" height="12" />
                  <rect x="11" y="4" width="3" height="12" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 4l12 6-12 6V4z" />
                </svg>
              )}
            </button>

            <button
              className="control-button stop"
              onClick={handleStop}
              aria-label="Stop"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <rect x="4" y="4" width="12" height="12" />
              </svg>
            </button>
          </div>

          <div className="playback-row">
            <SeekButton
              label="-5s"
              onClick={handleBackward}
              ariaLabel="Backward 5 seconds"
              disabled={backwardDisabled}
            />
            <SeekButton
              label="+5s"
              onClick={handleForward}
              ariaLabel="Forward 5 seconds"
              disabled={forwardDisabled}
            />
          </div>
        </div>

        {/* Column 3: Controls and Progress Bar */}
        <div className="column column-controls">
          <div className="controls-row">
            <div className="waveform-container">
              <div className="waveform">
                {waveformBars.map(({ height, delay }, i) => (
                  <div
                    key={i}
                    className="waveform-bar"
                    style={{
                      height: `${height}%`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              className="control-button settings"
              onClick={handleSettings}
              aria-label="Settings"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <button
              className="control-button camera"
              onClick={handleCamera}
              aria-label="Live Text"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <button
              className="control-button editor"
              onClick={handleEditor}
              aria-label="Open grammar editor"
            >
              <PencilIcon size={18} />
            </button>
          </div>

          <div className="progress-container">
            <ProgressBar progress={progress} />
          </div>
        </div>

        {/* Column 4: Window controls (minimize, close) */}
        <div className="column column-close">
          <div className="close-row">
            <button
              className="control-button minimize"
              onClick={handleMinimize}
              aria-label="Minimize"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M4 9h12v2H4z" />
              </svg>
            </button>
            <button
              className="control-button close"
              onClick={handleClose}
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
