import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  CloseIcon,
  MinimizeIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  QuickReplayIcon,
  SettingsIcon,
  StopIcon,
  SummaryIcon,
} from "./components/icons";
import { callBackendPrompt } from "./backendPrompt";
import "./App.css";

const DEFAULT_VOLUME = 80;

type ThemeMode = "dark" | "light";

interface Config {
  voice_provider: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  ui_volume?: number | null;
  ui_muted?: boolean | null;
  ui_theme?: string | null;
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

function clampVolume(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function parseConfigVolume(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return clampVolume(Math.round(value));
}

function parseThemeMode(value: string | null | undefined): ThemeMode | null {
  if (value === "dark" || value === "light") return value;
  return null;
}

function getRestoredVolume(currentVolume: number, previousVolume: number): number {
  if (currentVolume > 0) return currentVolume;
  if (previousVolume > 0) return previousVolume;
  return DEFAULT_VOLUME;
}

function hasMatchingUiPrefs(left: Config, right: Config): boolean {
  return (
    (left.ui_volume ?? null) === (right.ui_volume ?? null) &&
    (left.ui_muted ?? null) === (right.ui_muted ?? null) &&
    (left.ui_theme ?? null) === (right.ui_theme ?? null)
  );
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
  const [configLoaded, setConfigLoaded] = useState(false);

  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [resizeGripHovered, setResizeGripHovered] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const isSpeedControlEnabled = false;
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const previousVolumeRef = useRef(DEFAULT_VOLUME);
  const hasHydratedUiPrefsRef = useRef(false);
  const hasPendingUiPrefChangeRef = useRef(false);

  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateSize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    invoke<string>("get_platform")
      .then(setPlatform)
      .catch(() => setPlatform(null));
  }, []);

  const applyUiPrefsFromConfig = useCallback((cfg: Config) => {
    const configVolume = parseConfigVolume(cfg.ui_volume);
    if (configVolume != null) {
      setVolume(configVolume);
      if (configVolume > 0) {
        previousVolumeRef.current = configVolume;
      }
    }

    if (cfg.ui_muted != null) {
      setIsMuted(cfg.ui_muted);
    }

    const parsedTheme = parseThemeMode(cfg.ui_theme);
    if (parsedTheme != null) {
      setThemeMode(parsedTheme);
    }

    return { configVolume, parsedTheme };
  }, []);

  const applyCurrentUiPrefsToConfig = useCallback(
    (baseConfig: Config): Config => ({
      ...baseConfig,
      ui_volume: clampVolume(volume),
      ui_muted: isMuted,
      ui_theme: themeMode,
    }),
    [isMuted, themeMode, volume],
  );

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
    if (typeof console === "undefined") return;
    const originalError = console.error;

    console.error = (...args) => {
      originalError.apply(console, args);
      const msg = args
        .map((a) => {
          try {
            return typeof a === "object" ? JSON.stringify(a) : String(a);
          } catch {
            return "[unserializable]";
          }
        })
        .join(" ");

      setErrors((prev) => [...prev, msg].slice(-5));
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        const { configVolume, parsedTheme } = applyUiPrefsFromConfig(cfg);

        const normalizedConfig: Config = {
          ...cfg,
          ui_volume: configVolume ?? DEFAULT_VOLUME,
          ui_muted: cfg.ui_muted ?? false,
          ui_theme: parsedTheme ?? "dark",
        };

        setConfig(normalizedConfig);

        const shouldBackfillUiPrefs =
          cfg.ui_volume == null ||
          cfg.ui_muted == null ||
          parsedTheme == null;

        if (shouldBackfillUiPrefs) {
          await invoke("save_config", { configJson: JSON.stringify(normalizedConfig) });
        }
      } catch (e) {
        console.warn("[App] get_config failed:", e);
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, [applyUiPrefsFromConfig]);

  useEffect(() => {
    const unlisten = listen("config-changed", async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        setConfig(cfg);
        applyUiPrefsFromConfig(cfg);
      } catch (e) {
        console.warn("[App] config-changed get_config failed:", e);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [applyUiPrefsFromConfig]);

  useEffect(() => {
    if (!configLoaded) return;

    if (!hasHydratedUiPrefsRef.current) {
      hasHydratedUiPrefsRef.current = true;
      if (!hasPendingUiPrefChangeRef.current) {
        return;
      }
    }

    let cancelled = false;
    void (async () => {
      try {
        const latestConfig = await invoke<Config>("get_config");
        const nextConfig = applyCurrentUiPrefsToConfig(latestConfig);

        const unchanged = hasMatchingUiPrefs(latestConfig, nextConfig);

        if (unchanged) {
          hasPendingUiPrefChangeRef.current = false;
          return;
        }

        if (!cancelled) {
          setConfig(nextConfig);
        }
        await invoke("save_config", { configJson: JSON.stringify(nextConfig) });
        hasPendingUiPrefChangeRef.current = false;
      } catch (e) {
        if (!cancelled) {
          console.warn("[App] save_config failed:", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyCurrentUiPrefsToConfig, configLoaded]);

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
      } catch {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentTimeMs(0);
        setTotalTimeMs(0);
        setAtEnd(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = async () => {
    try {
      const [isPlayingBackend] = await invoke<[boolean, boolean]>("tts_get_status");

      if (isPlayingBackend) {
        const newPausedState = await invoke<boolean>("tts_toggle_pause");
        setIsPlaying(!newPausedState);
      } else {
        const cmd = platform === "macos" ? "get_clipboard_text" : "get_selected_text";
        const text = await invoke<string | null>(cmd);
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
      await invoke<[boolean, boolean, boolean]>("tts_seek", { offsetMs });
      const [currentMs, totalMs] = await invoke<[number, number]>("tts_get_position");
      setAtEnd(currentMs >= totalMs);
      setCurrentTimeMs(currentMs);
    } catch (e) {
      console.warn("tts_seek failed:", e);
    }
  };

  const handleBackward = () => handleSeek(-5000, isPaused || currentTimeMs < 5000);
  const handleForward = () => handleSeek(5000, isPaused || atEnd);

  const effectiveVolume = isMuted ? 0 : volume;

  const syncVolumeWithBackend = async (volumePercent: number) => {
    try {
      await invoke("tts_set_volume", { volumePercent });
    } catch (e) {
      console.warn("tts_set_volume failed:", e);
    }
  };

  useEffect(() => {
    void syncVolumeWithBackend(effectiveVolume);
  }, [effectiveVolume]);

  const handleMuteToggle = () => {
    hasPendingUiPrefChangeRef.current = true;

    if (isMuted) {
      const restored = getRestoredVolume(volume, previousVolumeRef.current);
      setVolume(restored);
      setIsMuted(false);
      return;
    }

    if (volume > 0) {
      previousVolumeRef.current = volume;
    }
    setIsMuted(true);
  };

  const handleVolumeChange = (rawValue: string) => {
    const nextValue = Number.parseInt(rawValue, 10);
    if (Number.isNaN(nextValue)) return;

    hasPendingUiPrefChangeRef.current = true;

    const clamped = clampVolume(nextValue);
    setVolume(clamped);

    if (clamped === 0) {
      setIsMuted(true);
      return;
    }

    previousVolumeRef.current = clamped;
    if (isMuted) {
      setIsMuted(false);
    }
  };

  const handleMouseDown = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, [data-no-drag='true']")) return;
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  };

  const handleClose = async () => {
    try {
      const latestConfig = await invoke<Config>("get_config");
      const nextConfig = applyCurrentUiPrefsToConfig(latestConfig);
      const unchanged = hasMatchingUiPrefs(latestConfig, nextConfig);

      if (!unchanged) {
        await invoke("save_config", { configJson: JSON.stringify(nextConfig) });
        hasPendingUiPrefChangeRef.current = false;
      }
    } catch (e) {
      console.warn("[App] pre-close save_config failed:", e);
    }

    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  const handleOpenSettings = () => {
    void invoke("open_settings_window");
  };

  const handleThemeToggle = () => {
    hasPendingUiPrefChangeRef.current = true;
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <main className={`main-shell main-shell--${themeMode}`} onMouseDown={handleMouseDown}>
      <section className="player-card">
        <header className="card-header">
          <div className="title-wrap">
            <div className="title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h.01M12 10h.01M16 10h.01" />
              </svg>
            </div>
            <h1 className="app-name">Insight Reader</h1>
          </div>

          <div className="header-actions">
            <button
              className="window-btn"
              onClick={handleThemeToggle}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {themeMode === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z" />
                </svg>
              )}
            </button>
            <button className="window-btn" onClick={handleOpenSettings} aria-label="Open settings">
              <SettingsIcon size={14} />
            </button>
            <button className="window-btn minimize" onClick={handleMinimize} aria-label="Minimize window">
              <MinimizeIcon size={14} />
            </button>
            <button className="window-btn close" onClick={handleClose} aria-label="Close window">
              <CloseIcon size={14} />
            </button>
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
                    onClick={() => navigator.clipboard.writeText(errors.join("\n"))}
                  >
                    Copy
                  </button>
                  {errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </header>

        <div className="card-content">
          <div className="time-display">
            <span className="current-time">{formatTime(currentTimeMs)}</span>
            <span className="total-time">/ {formatTime(totalTimeMs)}</span>
          </div>

          <div className="controls-row">
            <button className="control-btn" onClick={handleBackward} disabled={isPaused || currentTimeMs < 5000}>
              -5s
            </button>

            <button className="control-btn" onClick={handleForward} disabled={isPaused || atEnd}>
              +5s
            </button>

            <div className="play-btn-wrap">
              <button
                className="control-btn play-btn"
                onClick={handlePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
              </button>
              {platform === "macos" && !isPlaying && (
                <span className="play-btn-hint">Read clipboard</span>
              )}
            </div>

            <button className="control-btn stop-btn" onClick={handleStop} aria-label="Stop">
              <StopIcon size={16} />
            </button>

            <div
              className={`speed-wrap${!isSpeedControlEnabled ? " speed-wrap--disabled" : ""}`}
              data-no-drag="true"
              data-tooltip={!isSpeedControlEnabled ? "Coming soon" : undefined}
            >
              <button
                className="speed-btn"
                aria-label="Playback speed"
                disabled={!isSpeedControlEnabled}
                title={isSpeedControlEnabled ? "Playback speed" : undefined}
              >
                {playbackSpeed}x
              </button>
              {isSpeedControlEnabled && (
                <div className="speed-menu">
                  {speeds.map((speed) => (
                    <button
                      key={speed}
                      className={playbackSpeed === speed ? "speed-item active" : "speed-item"}
                      onClick={() => setPlaybackSpeed(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="volume-row">
            <button
              className="volume-toggle"
              onClick={handleMuteToggle}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
            </button>

            <div className="volume-track">
              <input
                type="range"
                min="0"
                max="100"
                value={effectiveVolume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                aria-valuetext={`${effectiveVolume}%`}
                style={{
                  background: `linear-gradient(to right, var(--volume-fill-color) 0%, var(--volume-fill-color) ${effectiveVolume}%, var(--volume-track-color) ${effectiveVolume}%, var(--volume-track-color) 100%)`,
                }}
              />
            </div>

            <span className="volume-value">{effectiveVolume}</span>
          </div>

          <div className="action-row">
            <button
              className="action-btn"
              onClick={async () => {
                const text = await invoke<string>("get_text_or_clipboard");
                void invoke("open_editor_window", { initialText: text });
              }}
              aria-label="Open grammar editor"
            >
              <PencilIcon size={15} />
              <span>Edit</span>
            </button>

            <button
              className="action-btn"
              aria-label="Open summary"
              disabled={isSummarizing}
              onClick={async () => {
                setIsSummarizing(true);
                try {
                  const text = await invoke<string>("get_text_or_clipboard");
                  const trimmed = text?.trim() ?? "";
                  if (!trimmed) {
                    setErrors((prev) => [...prev.slice(-4), "Summary: no text (copy or select text first)."]);
                    return;
                  }
                  const textToShow = await callBackendPrompt("SUMMARIZE", trimmed);
                  await invoke("open_editor_window", { initialText: textToShow });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Summary request failed.";
                  setErrors((prev) => [...prev.slice(-4), msg]);
                } finally {
                  setIsSummarizing(false);
                }
              }}
            >
              <SummaryIcon size={15} />
              <span>{isSummarizing ? "…" : "Summary"}</span>
            </button>

            <div className="disabled-action-wrap" data-tooltip="Coming soon">
              <button className="action-btn quick-replay-btn" aria-label="Quick replay" disabled>
                <span className="quick-replay-icon-wrap" aria-hidden="true">
                  <QuickReplayIcon size={14} />
                </span>
                <span className="quick-replay-label">
                  Quick
                  <br />
                  Replay
                </span>
              </button>
            </div>
          </div>
        </div>

        <footer className="status-bar">
          <span className="status-item">
            <span className="status-label">Provider:</span>
            <span className="status-value">{config ? getProviderLabel(config.voice_provider) : "Loading..."}</span>
          </span>
          <span className="status-separator" />
          <span className="status-item">
            <span className="status-label">Voice:</span>
            <span className="status-value">{config ? getVoiceLabel(config) : "Loading..."}</span>
          </span>
        </footer>

        <div
          className="resize-grip"
          data-no-drag="true"
          aria-hidden="true"
          onMouseEnter={() => setResizeGripHovered(true)}
          onMouseLeave={() => setResizeGripHovered(false)}
        >
          {resizeGripHovered && windowSize.width > 0 && windowSize.height > 0 && (
            <span className="resize-grip-dimensions">
              {windowSize.width} × {windowSize.height}
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M12 9 L9 12" />
            <path d="M12 6 L6 12" />
            <path d="M12 3 L3 12" />
          </svg>
        </div>
      </section>
    </main>
  );
}

export default App;
