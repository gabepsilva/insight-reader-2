import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import logoSvg from "./assets/logo.svg";
import { SettingsIcon } from "./components/icons";
import "./App.css";

interface Config {
  voice_provider: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  piper: "Piper",
  polly: "AWS Polly",
  microsoft: "Microsoft",
};

function getProviderLabel(provider: string | null): string {
  if (!provider) return "Microsoft";
  return PROVIDER_LABELS[provider] ?? provider;
}

function getVoiceLabel(config: Config): string {
  const provider = config.voice_provider ?? "microsoft";
  switch (provider) {
    case "piper":
      return config.selected_voice ?? "Not selected";
    case "polly":
      return config.selected_polly_voice ?? "Not selected";
    case "microsoft": {
      const voice = config.selected_microsoft_voice ?? "Not selected";
      return voice.replace(/^Microsoft Server Speech Text to Speech Voice \(/, "(");
    }
    default:
      return "Not selected";
  }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTooltipLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 250);
  };

  const handleTooltipEnter = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setShowTooltip(true);
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof console === 'undefined') return;
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      const msg = args.map(a => {
        try {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch {
          return '[unserializable]';
        }
      }).join(' ');
      setErrors(prev => {
        const newErrors = [...prev, msg].slice(-5);
        return newErrors;
      });
    };
    return () => { console.error = originalError; };
  }, []);

  useEffect(() => {
    const resizeToContent = async () => {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.setSize(new LogicalSize(340, 320));
      } catch (e) {
        console.warn("[resizeToContent] setSize failed or not in Tauri:", e);
      }
    };
    resizeToContent();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        console.log("[App] config loaded:", cfg);
        setConfig(cfg);
      } catch (e) {
        console.warn("[App] get_config failed:", e);
      }
    })();
  }, []);

  useEffect(() => {
    const unlisten = listen("config-changed", async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        setConfig(cfg);
      } catch (e) {
        console.warn("[App] config-changed get_config failed:", e);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await invoke<[boolean, boolean]>("tts_get_status");
        const [isPlayingBackend, isPausedBackend] = status;
        setIsPlaying(isPlayingBackend && !isPausedBackend);
        setIsPaused(isPausedBackend);

        if (isPlayingBackend) {
          const position = await invoke<[number, number]>("tts_get_position");
          const [currentMs, totalMs] = position;

          if (totalMs > 0) {
            setCurrentTimeMs(currentMs);
            setTotalTimeMs(totalMs);
          }
          setAtEnd(currentMs >= totalMs);
        } else {
          setCurrentTimeMs(0);
          setTotalTimeMs(0);
          setAtEnd(false);
        }
      } catch (e) {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentTimeMs(0);
        setAtEnd(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = async () => {
    try {
      const status = await invoke<[boolean, boolean]>("tts_get_status");
      const [isPlayingBackend] = status;

      if (isPlayingBackend) {
        const newPausedState = await invoke<boolean>("tts_toggle_pause");
        setIsPlaying(!newPausedState);
      } else {
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
    setCurrentTimeMs(0);
    setTotalTimeMs(0);
    setAtEnd(false);
    try {
      await invoke("tts_stop");
    } catch (e) {
      console.warn("tts_stop failed:", e);
    }
  };

  const handleSeek = async (offsetMs: number, disabled: boolean) => {
    if (disabled) return;

    try {
      await invoke<[boolean, boolean, boolean]>("tts_seek", {
        offsetMs,
      });
      const position = await invoke<[number, number]>("tts_get_position");
      const [currentMs, totalMs] = position;

      setAtEnd(currentMs >= totalMs);
      setCurrentTimeMs(currentMs);
    } catch (e) {
      console.warn(`tts_seek failed:`, e);
    }
  };

  const handleBackward = () => handleSeek(-5000, isPaused || currentTimeMs < 5000);
  const handleForward = () => handleSeek(5000, isPaused || atEnd);

  const handleMouseDown = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  return (
    <main className="main-container">
      <div className="control-bar" onMouseDown={handleMouseDown}>
        <div className="header">
          <div className="brand">
            <div className="app-icon">
              <img src={logoSvg} alt="Insight Reader" />
            </div>
          </div>
          <div className="app-title">
            <span className="app-name">Insight Reader</span>
          </div>
          {errors.length > 0 && (
            <div 
              className="error-indicator"
              onMouseEnter={handleTooltipEnter}
              onMouseLeave={handleTooltipLeave}
            >
              <svg viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              {showTooltip && (
                <div className="error-tooltip">
                  <button 
                    className="copy-errors-btn"
                    onClick={() => navigator.clipboard.writeText(errors.join('\n'))}
                  >
                    Copy
                  </button>
                  {errors.map((err, i) => <div key={i}>{err}</div>)}
                </div>
              )}
            </div>
          )}
          <button className="more-btn" aria-label="More options">
            <svg viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
        </div>

        <div className="time-display">
          <span className="current-time">{formatTime(currentTimeMs)}</span>
          <span className="total-time separator">/</span>
          <span className="total-time">{formatTime(totalTimeMs)}</span>
        </div>

        <div className="controls">
          <button
            className="control-btn"
            onClick={handleBackward}
            disabled={isPaused || currentTimeMs < 5000}
          >
            -5s
          </button>

          <button
            className="control-btn play-btn"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            className="control-btn"
            onClick={handleStop}
            aria-label="Stop"
          >
            <svg viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" fill="currentColor" />
            </svg>
          </button>

          <button
            className="control-btn"
            onClick={handleForward}
            disabled={isPaused || atEnd}
          >
            +5s
          </button>
        </div>

        <div className="grammar-row">
          <button
            className="grammar-btn"
            onClick={async () => {
              const text = await invoke<string>("get_text_or_clipboard");
              invoke("open_editor_window", { initialText: text });
            }}
            aria-label="Open grammar editor"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                fill="currentColor"
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </button>
          <button
            className="grammar-btn"
            onClick={() => invoke("open_settings_window")}
            aria-label="Open settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
        <div className="status-bar">
          <span className="status-item">
            <span className="status-label">Provider:</span>
            <span className="status-value">
              {config ? getProviderLabel(config.voice_provider) : "Loading..."}
            </span>
          </span>
          <span className="status-item">
            <span className="status-label">Voice:</span>
            <span className="status-value">
              {config ? getVoiceLabel(config) : "Loading..."}
            </span>
          </span>
        </div>
      </div>
    </main>
  );
}

export default App;
