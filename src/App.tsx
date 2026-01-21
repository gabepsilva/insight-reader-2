import { useState, useRef, useEffect, useMemo } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import logoSvg from "./assets/logo.svg";
import { PencilIcon } from "./components/icons";
import "./App.css";

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const waveformBars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        height: Math.random() * 100,
        delay: i * 0.1,
      })),
    []
  );

  useEffect(() => {
    const resizeToContent = async () => {
      try {
        const el = controlBarRef.current;
        if (!el) return;
        await new Promise((r) => requestAnimationFrame(r));
        const { width, height } = el.getBoundingClientRect();
        const appWindow = getCurrentWindow();
        await appWindow.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
      } catch (e) {
        console.warn("[resizeToContent] setSize failed or not in Tauri:", e);
      }
    };
    resizeToContent();
  }, []);

  const handlePlayPause = async () => {
    try {
      const text = await invoke<string | null>("get_selected_text");
      if (text != null && text.length > 0) {
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("get_selected_text failed:", e);
    }
  };

  const handleStop = async () => {
    setIsPlaying(false);
    setProgress(0);
    try {
      await invoke("tts_stop");
    } catch (e) {
      console.warn("tts_stop failed:", e);
    }
  };

  const handleSettings = () => {
    // TODO: Open settings window
  };

  const handleCamera = () => {
    // TODO: Open screenshot/camera capture
  };

  const handleEditor = async () => {
    try {
      // Same logic as "Insight Editor" tray item: selected text, else clipboard, else ""
      const sel = await invoke<string | null>("get_selected_text");
      const text =
        sel != null ? sel : (await invoke<string | null>("get_clipboard_text")) ?? "";
      await invoke("open_editor_window", { initialText: text });
    } catch (e) {
      console.warn("open_editor_window failed:", e);
    }
  };

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
    if (target.closest('button')) {
      return;
    }
    
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  return (
    <main className="main-container">
      <div ref={controlBarRef} className="control-bar" onMouseDown={handleMouseDown}>
        {/* Column 1: App Logo */}
        <div className="column column-logo">
          <div className="logo-container">
            <img src={logoSvg} alt="Insight Reader" className="logo" />
          </div>
          <div className="logo-label">
            Insight<br />Reader
          </div>
        </div>

        {/* Column 2: Controls and Progress Bar */}
        <div className="column column-controls">
          <div className="controls-row">
              <button
                className="control-button play-pause"
                onClick={handlePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <rect x="6" y="4" width="3" height="12" />
                    <rect x="11" y="4" width="3" height="12" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 4l12 6-12 6V4z" />
                  </svg>
                )}
              </button>

              <button
                className="control-button stop"
                onClick={handleStop}
                aria-label="Stop"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="4" y="4" width="12" height="12" />
                </svg>
              </button>

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
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
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
                aria-label="Screenshot"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
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
                <PencilIcon size={20} />
              </button>
            </div>

            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

        {/* Column 3: Window controls (minimize, close) */}
        <div className="column column-close">
          <div className="close-row">
            <button
              className="control-button minimize"
              onClick={handleMinimize}
              aria-label="Minimize"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 9h12v2H4z" />
              </svg>
            </button>
            <button
              className="control-button close"
              onClick={handleClose}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
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
