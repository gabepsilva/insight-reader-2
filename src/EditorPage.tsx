import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  binaryInlined,
  Dialect,
  type Lint,
  WorkerLinter,
  type Suggestion,
} from "harper.js";
import type { Editor } from "@tiptap/core";
import { CloseIcon } from "./components/icons";
import { ResizeGrip } from "./player/ResizeGrip";
import { LintPopup } from "./components/LintPopup";
import { TipTapEditor } from "./components/TipTapEditor";
import { makeLintKey } from "./extensions/harperLint";
import { applySuggestion } from "./utils/applySuggestion";
import { callBackendPrompt } from "./backendPrompt";
import { parseThemeMode } from "./player/utils";
import { useWindowSize } from "./player/hooks/useWindowSize";
import "./App.css";
import "./EditorPage.css";

interface Config {
  voice_provider: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  ui_theme?: string | null;
}

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 14;
const POPUP_CORNER_OFFSET = 3;
const POPUP_EDGE_MARGIN = 12;
const POPUP_MAX_WIDTH = 360;
const POPUP_HEIGHT_ESTIMATE = 120;
const POPUP_HIDE_DELAY_MS = 60;

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
    case "microsoft":
      return config.selected_microsoft_voice ?? "Not selected";
    default:
      return "Not selected";
  }
}

/**
 * Computes fixed positioning for the lint popup so it stays on-screen.
 * Uses left when there is room to the right, otherwise right.
 */
function getPopupStyle(mouse: { x: number; y: number }): CSSProperties {
  const { x: mx, y: my } = mouse;
  const wouldOverflowRight =
    mx + POPUP_CORNER_OFFSET + POPUP_MAX_WIDTH >
    window.innerWidth - POPUP_EDGE_MARGIN;
  const top = Math.max(
    POPUP_EDGE_MARGIN,
    Math.min(
      my + POPUP_CORNER_OFFSET,
      window.innerHeight - POPUP_HEIGHT_ESTIMATE - POPUP_EDGE_MARGIN,
    ),
  );
  if (wouldOverflowRight) {
    const idealRight = window.innerWidth - (mx + POPUP_CORNER_OFFSET);
    const maxRight = window.innerWidth - POPUP_EDGE_MARGIN - POPUP_MAX_WIDTH;
    const right = Math.max(POPUP_EDGE_MARGIN, Math.min(idealRight, maxRight));
    return { position: "fixed", right, top };
  }
  const left = Math.max(POPUP_EDGE_MARGIN, mx + POPUP_CORNER_OFFSET);
  return { position: "fixed", left, top };
}

export default function EditorPage() {
  const [text, setText] = useState("");
  const [lints, setLints] = useState<Lint[]>([]);
  const [hoveredLintIndex, setHoveredLintIndex] = useState<number | null>(null);
  const [hoveredLintMouse, setHoveredLintMouse] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIndexRef = useRef<number | null>(null);
  const dismissedLintKeysRef = useRef<Set<string>>(new Set());
  const scheduleLintRef = useRef<((immediate?: boolean) => void) | null>(null);
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const editorInstanceRef = useRef<Editor | null>(null);
  const linterRef = useRef<WorkerLinter | null>(null);
  const textRef = useRef(text);
  const [config, setConfig] = useState<Config | null>(null);
  const [transformTask, setTransformTask] = useState<"clear" | "summarize" | null>(
    null,
  );
  /** True while Read aloud is starting (TTS request in progress). */
  const [readPreparing, setReadPreparing] = useState(false);
  const windowSize = useWindowSize();
  const [resizeGripHovered, setResizeGripHovered] = useState(false);

  const applyConfigToUiState = useCallback((cfg: Config) => {
    setConfig(cfg);
  }, []);

  const themeMode = config ? (parseThemeMode(config.ui_theme) ?? "dark") : "dark";

  const getOrCreateLinter = useCallback(async (): Promise<WorkerLinter> => {
    if (linterRef.current) return linterRef.current;
    const l = new WorkerLinter({
      binary: binaryInlined,
      dialect: Dialect.American,
    });
    await l.setup();
    linterRef.current = l;
    return l;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        applyConfigToUiState(cfg);
      } catch (e) {
        console.warn("[EditorPage] get_config failed:", e);
      }
    })();
  }, [applyConfigToUiState]);

  useEffect(() => {
    const unlisten = listen("config-changed", async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        applyConfigToUiState(cfg);
      } catch (e) {
        console.warn("[EditorPage] config-changed get_config failed:", e);
      }
    });
    return () => {
      unlisten.then(
        (fn) => fn(),
        () => {},
      );
    };
  }, [applyConfigToUiState]);

  useEffect(
    () => () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    },
    [],
  );

  const increaseFontSize = useCallback(
    () => setFontSize((f) => Math.min(FONT_SIZE_MAX, f + FONT_SIZE_STEP)),
    [],
  );
  const decreaseFontSize = useCallback(
    () => setFontSize((f) => Math.max(FONT_SIZE_MIN, f - FONT_SIZE_STEP)),
    [],
  );

  // Keep textRef in sync with text state
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const handleRead = async () => {
    const t = text.trim();
    if (!t) return;
    setReadPreparing(true);
    try {
      await invoke("tts_speak", { text: t });
    } catch (e) {
      console.warn("[EditorPage] tts_speak failed:", e);
      alert(
        typeof e === "string" ? e : "Could not read aloud. Is Piper installed?",
      );
    } finally {
      setReadPreparing(false);
    }
  };

  const runTransformTask = async (task: "clear" | "summarize") => {
    const content = text.trim();
    if (!content) return;
    const apiTask = task === "clear" ? "TTS" : "SUMMARIZE";
    setTransformTask(task);
    try {
      const response = await callBackendPrompt(apiTask, content);
      setText(response);
    } catch (e) {
      console.warn(`[EditorPage] backend_prompt ${task} failed:`, e);
      alert(
        typeof e === "string"
          ? e
          : `Backend ${task} failed. Is the ReadingService running on port 8080?`,
      );
    } finally {
      setTransformTask(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const initial =
          (await invoke<string | null>("take_editor_initial_text")) ?? "";
        // Only apply when non-empty so we don't overwrite with "" when there was no initial text.
        if (isMounted && initial.length > 0) {
          setText(initial);
          setTimeout(() => {
            scheduleLintRef.current?.(true);
          }, 2000);
        }
      } catch (e) {
        if (isMounted)
          console.warn("[EditorPage] take_editor_initial_text failed:", e);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("editor-set-text", (e) => {
      setText(e.payload ?? "");
    });
    return () => {
      unlisten.then(
        (fn) => fn(),
        () => {},
      );
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen("editor-trigger-read", () => {
      // Clear any pending timeout
      if (timeoutId) clearTimeout(timeoutId);
      // Trigger read after text has been set (with a small delay to ensure text is ready)
      timeoutId = setTimeout(() => {
        const t = textRef.current.trim();
        if (t) {
          invoke("tts_speak", { text: t }).catch((e) => {
            console.warn("[EditorPage] tts_speak failed:", e);
            alert(
              typeof e === "string"
                ? e
                : "Could not read aloud. Is Piper installed?",
            );
          });
        }
        timeoutId = null;
      }, 50); // Reduced from 100ms - text should be ready after editor-set-text event
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unlisten.then(
        (fn) => fn(),
        () => {},
      );
    };
  }, []);

  const lintFn = useCallback(
    async (t: string) => {
      const linter = await getOrCreateLinter();
      return linter.lint(t);
    },
    [getOrCreateLinter],
  );

  const hoveredLint =
    hoveredLintIndex != null ? lints[hoveredLintIndex] ?? null : null;

  const popupStyle: CSSProperties | null =
    hoveredLintMouse ? getPopupStyle(hoveredLintMouse) : null;

  const handleApplySuggestion = (lint: Lint, suggestion: Suggestion): void => {
    const editor = editorInstanceRef.current;
    if (!editor) return;
    try {
      applySuggestion(editor, lint, suggestion);
      clearHovered();
    } catch (e) {
      console.warn("[EditorPage] applySuggestion failed:", e);
    }
  };

  const cancelPopupClose = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const clearHovered = useCallback(() => {
    cancelPopupClose();
    lastHoveredIndexRef.current = null;
    setHoveredLintIndex(null);
    setHoveredLintMouse(null);
  }, [cancelPopupClose]);

  const schedulePopupClose = useCallback(() => {
    cancelPopupClose();
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      clearHovered();
    }, POPUP_HIDE_DELAY_MS);
  }, [cancelPopupClose, clearHovered]);

  const handleIgnoreLint = (lint: Lint) => {
    dismissedLintKeysRef.current.add(makeLintKey(lint));
    scheduleLintRef.current?.(true);
    clearHovered();
  };

  const handleEditorAreaMouseLeave = schedulePopupClose;
  const handlePopupMouseEnter = cancelPopupClose;
  const handlePopupMouseLeave = schedulePopupClose;

  const handleTitleBarMouseDown = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  }, []);

  const handleClose = useCallback(async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  }, []);

  return (
    <main
      className={`main-shell main-shell--${themeMode} editor-page`}
    >
      <section className="player-card editor-card">
        <header
          className="card-header"
          onMouseDown={handleTitleBarMouseDown}
          role="banner"
        >
          <div className="title-wrap title-wrap--drag">
            <div className="title-icon" aria-hidden="true">
              <img src="/logo.svg" alt="" className="title-icon-img" />
            </div>
            <h1 className="app-name">Insight Editor</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="window-btn close"
              onClick={handleClose}
              aria-label="Close"
              title="Close"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </header>
      <div className="editor-toolbar">
        <button
          type="button"
          onClick={decreaseFontSize}
          disabled={fontSize <= FONT_SIZE_MIN}
          aria-label="Decrease font size"
          title="Decrease font size"
        >
          A−
        </button>
        <button
          type="button"
          onClick={increaseFontSize}
          disabled={fontSize >= FONT_SIZE_MAX}
          aria-label="Increase font size"
          title="Increase font size"
        >
          A+
        </button>
        <button
          type="button"
          onClick={handleRead}
          disabled={!text.trim() || readPreparing}
          aria-label={readPreparing ? "Preparing…" : "Read aloud"}
          title="Read aloud (stop from main window)"
          className="editor-toolbar-read"
        >
          {readPreparing ? "Preparing…" : "Read"}
        </button>
        <button
          type="button"
          onClick={() => runTransformTask("clear")}
          disabled={!text.trim() || transformTask != null}
          aria-label="Clear text"
          title="Clean content for text-to-speech (remove UI clutter, format for narration)"
          className="editor-toolbar-two-lines"
        >
          {transformTask === "clear" ? "…" : <>Clear<br />text</>}
        </button>
        <button
          type="button"
          onClick={() => runTransformTask("summarize")}
          disabled={!text.trim() || transformTask != null}
          aria-label="Summarize"
          title="Replace content with a concise summary"
        >
          {transformTask === "summarize" ? "…" : "Summarize"}
        </button>
      </div>
      <div
        className="editor-area"
        style={{ "--editor-font-size": `${fontSize}px` } as CSSProperties}
        onMouseLeave={handleEditorAreaMouseLeave}
      >
        <TipTapEditor
          content={text}
          onUpdate={setText}
          editorRef={(e) => {
            editorInstanceRef.current = e;
          }}
          placeholder="Paste or type text to check…"
          lint={lintFn}
          onLintsChange={setLints}
          onHover={(index, pos) => {
            cancelPopupClose();
            if (index !== lastHoveredIndexRef.current) {
              lastHoveredIndexRef.current = index;
              setHoveredLintMouse(pos);
            }
            setHoveredLintIndex(index);
          }}
          onHoverEnd={schedulePopupClose}
          getDismissedKeys={() => dismissedLintKeysRef.current}
          scheduleLintRef={scheduleLintRef}
        />
        {hoveredLint != null && popupStyle != null && (
          <LintPopup
            lint={hoveredLint}
            style={popupStyle}
            onApply={(s) => handleApplySuggestion(hoveredLint, s)}
            onDismiss={() => hoveredLint && handleIgnoreLint(hoveredLint)}
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
          />
        )}
      </div>
      <div className="editor-legend" aria-label="Lint count">
        <span className="editor-legend-count">
          {lints.length} issue{lints.length === 1 ? "" : "s"}
        </span>
      </div>
      {config && (
        <div className="editor-status-bar">
          <span className="editor-status-item">
            <span className="editor-status-label">Provider:</span>
            <span className="editor-status-value">
              {getProviderLabel(config.voice_provider)}
            </span>
          </span>
          <span className="editor-status-item">
            <span className="editor-status-label">Voice:</span>
            <span className="editor-status-value">{getVoiceLabel(config)}</span>
          </span>
        </div>
      )}
        <ResizeGrip
          windowSize={windowSize}
          hovered={resizeGripHovered}
          onMouseEnter={() => setResizeGripHovered(true)}
          onMouseLeave={() => setResizeGripHovered(false)}
        />
      </section>
    </main>
  );
}
