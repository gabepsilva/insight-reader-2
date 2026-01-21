import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  binaryInlined,
  Dialect,
  type Lint,
  WorkerLinter,
  type Suggestion,
} from "harper.js";
import type { Editor } from "@tiptap/core";
import { LintPopup } from "./components/LintPopup";
import { TipTapEditor } from "./components/TipTapEditor";
import { makeLintKey } from "./extensions/harperLint";
import { applySuggestion } from "./utils/applySuggestion";
import "./EditorPage.css";

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 14;
const STORAGE_KEY = "insight-editor-dark-mode";

function loadDarkMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDarkMode(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

const POPUP_CORNER_OFFSET = 3;
const POPUP_EDGE_MARGIN = 12;
const POPUP_MAX_WIDTH = 360;
const POPUP_HEIGHT_ESTIMATE = 120;
const POPUP_HIDE_DELAY_MS = 60;

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
      window.innerHeight - POPUP_HEIGHT_ESTIMATE - POPUP_EDGE_MARGIN
    )
  );
  if (wouldOverflowRight) {
    const idealRight = window.innerWidth - (mx + POPUP_CORNER_OFFSET);
    const maxRight =
      window.innerWidth - POPUP_EDGE_MARGIN - POPUP_MAX_WIDTH;
    const right = Math.max(
      POPUP_EDGE_MARGIN,
      Math.min(idealRight, maxRight)
    );
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
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const editorInstanceRef = useRef<Editor | null>(null);
  const linterRef = useRef<WorkerLinter | null>(null);
  const textRef = useRef(text);

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
    saveDarkMode(darkMode);
  }, [darkMode]);

  useEffect(
    () => () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    },
    []
  );

  const increaseFontSize = () =>
    setFontSize((f) => Math.min(FONT_SIZE_MAX, f + FONT_SIZE_STEP));
  const decreaseFontSize = () =>
    setFontSize((f) => Math.max(FONT_SIZE_MIN, f - FONT_SIZE_STEP));

  // Keep textRef in sync with text state
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const handleRead = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await invoke("tts_speak", { text: t });
    } catch (e) {
      console.warn("[EditorPage] tts_speak failed:", e);
      alert(typeof e === "string" ? e : "Could not read aloud. Is Piper installed?");
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const initial =
          (await invoke<string | null>("take_editor_initial_text")) ?? "";
        // Only apply when non-empty so we don't overwrite with "" when there was no initial text.
        if (isMounted && initial.length > 0) setText(initial);
      } catch (e) {
        if (isMounted) console.warn("[EditorPage] take_editor_initial_text failed:", e);
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
      unlisten.then((fn) => fn(), () => {});
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
            alert(typeof e === "string" ? e : "Could not read aloud. Is Piper installed?");
          });
        }
        timeoutId = null;
      }, 50); // Reduced from 100ms - text should be ready after editor-set-text event
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unlisten.then((fn) => fn(), () => {});
    };
  }, []);

  const lintFn = useCallback(
    async (t: string) => {
      const linter = await getOrCreateLinter();
      return linter.lint(t);
    },
    [getOrCreateLinter]
  );

  const hoveredLint =
    hoveredLintIndex != null ? lints[hoveredLintIndex] ?? null : null;

  const popupStyle: CSSProperties | null =
    hoveredLintMouse != null ? getPopupStyle(hoveredLintMouse) : null;

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

  const cancelPopupClose = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const clearHovered = () => {
    cancelPopupClose();
    lastHoveredIndexRef.current = null;
    setHoveredLintIndex(null);
    setHoveredLintMouse(null);
  };

  const schedulePopupClose = () => {
    cancelPopupClose();
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      clearHovered();
    }, POPUP_HIDE_DELAY_MS);
  };

  const handleIgnoreLint = (lint: Lint) => {
    dismissedLintKeysRef.current.add(makeLintKey(lint));
    scheduleLintRef.current?.(true);
    clearHovered();
  };

  const handleEditorAreaMouseLeave = () => schedulePopupClose();

  const handlePopupMouseEnter = () => cancelPopupClose();
  const handlePopupMouseLeave = () => schedulePopupClose();

  return (
    <div className={`editor-page ${darkMode ? "editor-page--dark" : ""}`}>
      <div className="editor-toolbar">
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="editor-toolbar-theme"
        >
          {darkMode ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
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
          disabled={!text.trim()}
          aria-label="Read aloud"
          title="Read aloud (stop from main window)"
          className="editor-toolbar-read"
        >
          Read
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
            onDismiss={() => handleIgnoreLint(hoveredLint!)}
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
          />
        )}
      </div>
      <div className="editor-legend" aria-label="Lint count">
        {lints.length > 0 && (
          <span className="editor-legend-count">
            {lints.length} issue{lints.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}
