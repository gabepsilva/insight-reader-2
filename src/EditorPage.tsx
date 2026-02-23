import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  binaryInlined,
  Dialect,
  type Lint,
  type Suggestion,
  WorkerLinter,
} from "harper.js";
import type { Editor } from "@tiptap/core";
import { CloseIcon } from "./components/icons";
import { ResizeGrip } from "./player/ResizeGrip";
import { LintPopup } from "./components/LintPopup";
import { TipTapEditor } from "./components/TipTapEditor";
import { EditorToolbar } from "./components/editor/EditorToolbar";
import {
  AssistantPanelResizeHandle,
  loadStoredWidth,
} from "./components/editor/AssistantPanelResizeHandle";
import { EditorAssistantPanel } from "./components/editor/EditorAssistantPanel";
import { EditorLegend } from "./components/editor/EditorLegend";
import { FORMAT_OPTIONS, type AssistantTabId } from "./components/editor/editorData";
import { applySuggestion } from "./utils/applySuggestion";
import { callBackendPrompt, type BackendPromptTask } from "./backendPrompt";
import { parseThemeMode } from "./player/utils";
import { useWindowSize } from "./player/hooks/useWindowSize";
import { usePlatform } from "./player/hooks/usePlatform";
import { useWindowRadius } from "./player/hooks/useWindowRadius";
import { useBackendHealth } from "./player/hooks/useBackendHealth";
import type { Config } from "./player/types";
import "./App.css";
import "./EditorPage.css";

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 15;
const POPUP_CORNER_OFFSET = 3;
const POPUP_EDGE_MARGIN = 12;
const POPUP_MAX_WIDTH = 360;
const POPUP_HEIGHT_ESTIMATE = 120;
const POPUP_HIDE_DELAY_MS = 60;
const HARPER_IGNORED_LINTS_KEY = "insight-reader-harper-ignored-lints";
const HARPER_DICTIONARY_KEY = "insight-reader-harper-dictionary";

/** Type guard: linter has a dispose method (Harper WorkerLinter). */
function hasDispose(
  l: WorkerLinter | null,
): l is WorkerLinter & { dispose: () => Promise<void> } {
  return (
    l != null &&
    typeof (l as { dispose?: () => Promise<void> }).dispose === "function"
  );
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
  const platform = usePlatform();
  useWindowRadius();
  const backendHealthy = useBackendHealth();
  const isMacos = platform === "macos";
  const [text, setText] = useState("");
  const [lints, setLints] = useState<Lint[]>([]);
  const [hoveredLintIndex, setHoveredLintIndex] = useState<number | null>(null);
  const [hoveredLintMouse, setHoveredLintMouse] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIndexRef = useRef<number | null>(null);
  const scheduleLintRef = useRef<((immediate?: boolean) => void) | null>(null);
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const editorInstanceRef = useRef<Editor | null>(null);
  const linterRef = useRef<WorkerLinter | null>(null);
  const textRef = useRef(text);
  const triggerReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [transformTask, setTransformTask] = useState<BackendPromptTask | null>(
    null,
  );
  const [activeTone, setActiveTone] = useState("professional");
  const [activeFormat, setActiveFormat] = useState(FORMAT_OPTIONS[0]?.id ?? "email");
  const [activeSubOption, setActiveSubOption] = useState(
    FORMAT_OPTIONS[0]?.subOptions[0] ?? "",
  );
  const [activeTab, setActiveTab] = useState<AssistantTabId>("tone");
  const [grammarVerificationEnabled, setGrammarVerificationEnabled] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [promptHistory, setPromptHistory] = useState<string[]>([
    "10% more humor",
    "Remove all emojis",
  ]);
  /** True while Read aloud is starting (TTS request in progress). */
  const [readPreparing, setReadPreparing] = useState(false);
  const [summaryMuted, setSummaryMuted] = useState(false);
  const windowSize = useWindowSize();
  const [resizeGripHovered, setResizeGripHovered] = useState(false);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(loadStoredWidth);

  const applyConfigToUiState = useCallback((cfg: Config) => {
    setConfig(cfg);
    setSummaryMuted(cfg.summary_muted ?? false);
  }, []);

  const handleSummaryMutedChange = useCallback((muted: boolean) => {
    setSummaryMuted(muted);
    void (async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        await invoke("save_config", {
          configJson: JSON.stringify({ ...cfg, summary_muted: muted }),
        });
      } catch (e) {
        console.warn("[EditorPage] save_config (summary_muted) failed:", e);
      }
    })();
  }, []);

  const themeMode = config ? (parseThemeMode(config.ui_theme) ?? "dark") : "dark";

  const getOrCreateLinter = useCallback(async (): Promise<WorkerLinter> => {
    if (linterRef.current) return linterRef.current;
    const l = new WorkerLinter({
      binary: binaryInlined,
      dialect: Dialect.American,
    });
    await l.setup();
    try {
      const ignoredJson = localStorage.getItem(HARPER_IGNORED_LINTS_KEY);
      if (ignoredJson) await l.importIgnoredLints(ignoredJson);
      const wordsJson = localStorage.getItem(HARPER_DICTIONARY_KEY);
      if (wordsJson) {
        const words = JSON.parse(wordsJson) as string[];
        if (Array.isArray(words) && words.length > 0) await l.importWords(words);
      }
      const config = await l.getDefaultLintConfig();
      const enabledAll: Record<string, boolean> = {};
      for (const key of Object.keys(config)) {
        enabledAll[key] = config[key] !== false;
      }
      await l.setLintConfig(enabledAll);
    } catch (e) {
      console.warn("[EditorPage] Harper init (ignored/dictionary/rules) failed:", e);
    }
    linterRef.current = l;
    return l;
  }, []);

  useEffect(() => {
    return () => {
      const l = linterRef.current;
      if (hasDispose(l)) void l.dispose();
      linterRef.current = null;
    };
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

  const runTransformTask = async (
    task: BackendPromptTask,
    options?: { silent?: boolean },
  ): Promise<string | null> => {
    const content = text.trim();
    if (!content) return null;
    if (!backendHealthy) return null;
    setTransformTask(task);
    try {
      const response = await callBackendPrompt(task, content);
      setText(response);
      return response;
    } catch (e) {
      console.warn(`[EditorPage] backend_prompt ${task} failed:`, e);
      if (!options?.silent) {
        alert(
          typeof e === "string"
            ? e
            : `Backend ${task} failed. Is the ReadingService running on port 8080?`,
        );
      }
      return null;
    } finally {
      setTransformTask(null);
    }
  };

  const handleSummarize = async () => {
    const task: BackendPromptTask = summaryMuted
      ? "SUMMARIZE_PROMPT"
      : "SUMMARIZE_AND_READ_PROMPT";
    const newText = await runTransformTask(task, { silent: true });
    if (newText != null && !summaryMuted && newText.trim()) {
      try {
        await invoke("tts_speak", { text: newText.trim() });
      } catch (e) {
        console.warn("[EditorPage] tts_speak after summarize failed:", e);
        alert(
          typeof e === "string" ? e : "Could not read aloud. Is Piper installed?",
        );
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const state = await invoke<{
          text: string | null;
          trigger_read: boolean;
        }>("get_editor_initial_text");
        const initial = state?.text ?? "";
        if (!isMounted || initial.length === 0) return;
        setText(initial);
        if (state?.trigger_read) {
          if (triggerReadTimeoutRef.current) clearTimeout(triggerReadTimeoutRef.current);
          triggerReadTimeoutRef.current = setTimeout(() => {
            const t = initial.trim();
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
            triggerReadTimeoutRef.current = null;
          }, 50);
        }
      } catch (e) {
        if (isMounted)
          console.warn("[EditorPage] get_editor_initial_text failed:", e);
      }
    })();
    return () => {
      isMounted = false;
      if (triggerReadTimeoutRef.current) {
        clearTimeout(triggerReadTimeoutRef.current);
        triggerReadTimeoutRef.current = null;
      }
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

  // When grammar verification is toggled, re-run lint so the plugin uses the updated lint ref.
  useEffect(() => {
    const tid = setTimeout(() => scheduleLintRef.current?.(true), 0);
    return () => clearTimeout(tid);
  }, [grammarVerificationEnabled]);

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

  const handleIgnoreLint = useCallback(
    async (lint: Lint) => {
      try {
        const linter = await getOrCreateLinter();
        await linter.ignoreLint(text, lint);
        const json = await linter.exportIgnoredLints();
        localStorage.setItem(HARPER_IGNORED_LINTS_KEY, json);
      } catch (e) {
        console.warn("[EditorPage] ignoreLint failed:", e);
      }
      scheduleLintRef.current?.(true);
      clearHovered();
    },
    [text, getOrCreateLinter, clearHovered],
  );

  const handleAddToDictionary = useCallback(
    async (word: string) => {
      if (!word.trim()) return;
      try {
        const linter = await getOrCreateLinter();
        await linter.importWords([word]);
        const words = await linter.exportWords();
        localStorage.setItem(HARPER_DICTIONARY_KEY, JSON.stringify(words));
      } catch (e) {
        console.warn("[EditorPage] importWords failed:", e);
      }
      scheduleLintRef.current?.(true);
      clearHovered();
    },
    [getOrCreateLinter, clearHovered],
  );

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

  const handleApplyPrompt = () => {
    const next = customPrompt.trim();
    if (!next) return;
    setPromptHistory((current) => [next, ...current.filter((item) => item !== next)].slice(0, 8));
    setCustomPrompt("");
  };

  const handleAssistantRewrite = () => {
    void runTransformTask("SUMMARIZE");
  };

  const hasText = text.trim().length > 0;

  return (
    <main
      className={`main-shell main-shell--${themeMode} editor-page`}
      data-tauri-drag-region
    >
      <section className="player-card editor-card">
        <header
          className={`card-header ${isMacos ? "card-header--macos" : ""}`}
          onMouseDown={handleTitleBarMouseDown}
          role="banner"
        >
          {isMacos ? (
            <div className="traffic-lights">
              <button
                type="button"
                className="traffic-btn traffic-btn--close"
                onClick={handleClose}
                aria-label="Close"
              >
                <span className="traffic-btn-icon">
                  <CloseIcon size={10} />
                </span>
              </button>
            </div>
          ) : null}
          {!isMacos ? (
            <div className="title-wrap title-wrap--drag">
              <div className="title-icon" aria-hidden="true">
                <img src="/logo.svg" alt="" className="title-icon-img" />
              </div>
              <h1 className="app-name">Insight Editor</h1>
            </div>
          ) : (
            <div className="title-wrap title-wrap--spacer title-wrap--drag" />
          )}
          <div className="editor-header__toolbar">
            <EditorToolbar
              fontSize={fontSize}
              minFontSize={FONT_SIZE_MIN}
              maxFontSize={FONT_SIZE_MAX}
              readPreparing={readPreparing}
              transformTask={transformTask}
              hasText={hasText}
              backendHealthy={backendHealthy}
              summaryMuted={summaryMuted}
              onSummaryMutedChange={handleSummaryMutedChange}
              onDecreaseFontSize={decreaseFontSize}
              onIncreaseFontSize={increaseFontSize}
              onRead={() => void handleRead()}
              onClear={() => void runTransformTask("TTS")}
              onSummarize={() => void handleSummarize()}
              onExplain={() => void runTransformTask("EXPLAIN1")}
            />
          </div>
          <div className="header-actions">
            {!isMacos && (
              <button
                type="button"
                className="window-btn close"
                onClick={handleClose}
                aria-label="Close"
                title="Close"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </header>
      <div className="editor-content">
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
            placeholder="Paste or type text to check..."
            lint={grammarVerificationEnabled ? lintFn : undefined}
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
            scheduleLintRef={scheduleLintRef}
          />
          {hoveredLint != null && popupStyle != null && (
            <LintPopup
              lint={hoveredLint}
              style={popupStyle}
              word={text.slice(hoveredLint.span().start, hoveredLint.span().end)}
              onApply={(s) => handleApplySuggestion(hoveredLint, s)}
              onDismiss={() => void handleIgnoreLint(hoveredLint)}
              onAddToDictionary={handleAddToDictionary}
              onMouseEnter={handlePopupMouseEnter}
              onMouseLeave={handlePopupMouseLeave}
            />
          )}
        </div>
        <AssistantPanelResizeHandle
          width={assistantPanelWidth}
          onWidthChange={setAssistantPanelWidth}
        />
        <EditorAssistantPanel
          width={assistantPanelWidth}
          activeTone={activeTone}
          activeFormat={activeFormat}
          activeSubOption={activeSubOption}
          activeTab={activeTab}
          customPrompt={customPrompt}
          promptHistory={promptHistory}
          hasText={hasText}
          backendHealthy={backendHealthy}
          isRunningTransform={transformTask != null}
          onActiveToneChange={setActiveTone}
          onActiveFormatChange={(format, subOption) => {
            setActiveFormat(format);
            setActiveSubOption(subOption);
          }}
          onActiveSubOptionChange={setActiveSubOption}
          onActiveTabChange={setActiveTab}
          onCustomPromptChange={setCustomPrompt}
          onApplyPrompt={handleApplyPrompt}
          onUseHistoryPrompt={setCustomPrompt}
          onApplyRewrite={handleAssistantRewrite}
        />
      </div>
      <EditorLegend
        issueCount={lints.length}
        grammarEnabled={grammarVerificationEnabled}
        onToggleGrammar={() =>
          setGrammarVerificationEnabled((v) => !v)
        }
      >
        <ResizeGrip
          windowSize={windowSize}
          hovered={resizeGripHovered}
          onMouseEnter={() => setResizeGripHovered(true)}
          onMouseLeave={() => setResizeGripHovered(false)}
        />
      </EditorLegend>
      </section>
    </main>
  );
}
