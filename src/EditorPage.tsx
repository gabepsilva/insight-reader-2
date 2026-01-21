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
  SuggestionKind,
} from "harper.js";
import { renderMirrorContent, type LintEntry } from "./editorMirror";
import "./EditorPage.css";

// LintKind → CSS class for overlay. Mapping and colors are in LINT_KIND_TO_CLASS and EditorPage.css.
const LINT_KIND_TO_CLASS: Record<string, string> = {
  Spelling: "spelling",
  SpellCheck: "spelling", /* Harper rule name; lint_kind usually returns "Spelling" */
  Typo: "spelling",
  Grammar: "grammar",
  Agreement: "grammar",
  BoundaryError: "grammar",
  Eggcorn: "grammar",
  Malapropism: "grammar",
  Usage: "grammar",
  WordChoice: "grammar",
  Punctuation: "punctuation",
  Formatting: "punctuation",
  Capitalization: "capitalization",
  Style: "style",
  Enhancement: "style",
  Readability: "style",
  Redundancy: "style",
  Repetition: "style",
};
const LINT_KIND_DEFAULT = "misc";

function lintKindToClass(kind: string): string {
  return LINT_KIND_TO_CLASS[kind] ?? LINT_KIND_DEFAULT;
}

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

const LINT_DEBOUNCE_MS = 350;

const POPUP_CORNER_OFFSET = 3;
const POPUP_EDGE_MARGIN = 12;
const POPUP_MAX_WIDTH = 360;
const POPUP_HEIGHT_ESTIMATE = 120;
const POPUP_LEAVE_DELAY_MS = 50;

const LEGEND_ITEMS: { key: string; label: string }[] = [
  { key: "spelling", label: "Spelling" },
  { key: "grammar", label: "Grammar" },
  { key: "punctuation", label: "Punctuation" },
  { key: "capitalization", label: "Capitalization" },
  { key: "style", label: "Style" },
  { key: "misc", label: "Other" },
];

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

/**
 * Converts a DOM position (from caretPositionFromPoint / caretRangeFromPoint)
 * inside the mirror content to a plain-text character offset.
 */
function domPositionToCharacterOffset(
  root: Node,
  targetNode: Node,
  targetOffset: number
): number {
  let count = 0;
  const walk = (n: Node): boolean => {
    if (n === targetNode) {
      if (n.nodeType === Node.TEXT_NODE) {
        count += Math.max(
          0,
          Math.min(targetOffset, (n.textContent ?? "").length)
        );
        return true;
      }
      for (let i = 0; i < Math.min(targetOffset, n.childNodes.length); i++) {
        walk(n.childNodes[i]);
      }
      return true;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      count += (n.textContent ?? "").length;
      return false;
    }
    for (let i = 0; i < n.childNodes.length; i++) {
      if (walk(n.childNodes[i])) return true;
    }
    return false;
  };
  walk(root);
  return count;
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
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linterRef = useRef<WorkerLinter | null>(null);
  const lintIdRef = useRef(0);

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

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const initial =
          (await invoke<string | null>("take_editor_initial_text")) ?? "";
        // Only apply when non-empty: avoid StrictMode's second effect run
        // overwriting with "" after take consumed the value.
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
    const timer = setTimeout(async () => {
      if (!text.trim()) {
        setLints([]);
        return;
      }
      const myId = ++lintIdRef.current;
      try {
        const linter = await getOrCreateLinter();
        const list: Lint[] = await linter.lint(text);
        if (myId !== lintIdRef.current) return;
        setLints(list);
      } catch (e) {
        if (myId === lintIdRef.current) setLints([]);
        console.warn("[EditorPage] Harper lint failed:", e);
      }
    }, LINT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, getOrCreateLinter]);

  const handleScroll = () => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (ta && mirror) {
      mirror.scrollTop = ta.scrollTop;
      mirror.scrollLeft = ta.scrollLeft;
    }
  };

  const entries: LintEntry[] = lints.map((lint, i) => {
    const s = lint.span();
    const raw =
      lint.lint_kind?.() ?? lint.lint_kind_pretty?.() ?? "Miscellaneous";
    return {
      start: s.start,
      end: s.end,
      kind: lintKindToClass(String(raw)),
      index: i,
    };
  });

  const hoveredLint =
    hoveredLintIndex != null ? lints[hoveredLintIndex] ?? null : null;

  const popupStyle: CSSProperties | null =
    hoveredLintMouse != null ? getPopupStyle(hoveredLintMouse) : null;

  const handleApplySuggestion = async (
    lint: Lint,
    suggestion: Suggestion
  ): Promise<void> => {
    try {
      const linter = await getOrCreateLinter();
      const next = await linter.applySuggestion(text, lint, suggestion);
      setText(next);
      clearHovered();
    } catch (e) {
      console.warn("[EditorPage] applySuggestion failed:", e);
    }
  };

  const clearHovered = () => {
    setHoveredLintIndex(null);
    setHoveredLintMouse(null);
  };

  const handleIgnoreLint = (lintIndex: number) => {
    setLints((prev) => prev.filter((_, i) => i !== lintIndex));
    clearHovered();
  };

  const schedulePopupClose = () => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      clearHovered();
    }, POPUP_LEAVE_DELAY_MS);
  };

  const cancelPopupClose = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const handleMirrorMouseMove = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest?.(".lint");
    if (mark) {
      cancelPopupClose();
      const idx = mark.getAttribute("data-lint-index");
      if (idx != null) {
        const newIndex = parseInt(idx, 10);
        if (!Number.isInteger(newIndex) || newIndex < 0) return;
        const isNewPopup = hoveredLintIndex !== newIndex;
        setHoveredLintIndex(newIndex);
        if (isNewPopup) {
          setHoveredLintMouse({ x: e.clientX, y: e.clientY });
        }
      }
    } else {
      schedulePopupClose();
    }
  };

  const handleEditorAreaMouseLeave = () => {
    cancelPopupClose();
    clearHovered();
  };

  const handlePopupMouseEnter = () => cancelPopupClose();
  const handlePopupMouseLeave = () => clearHovered();

  const handleMirrorClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest?.(".lint")) return;
    const ta = textareaRef.current;
    const content = mirrorRef.current?.querySelector(".editor-mirror-content");
    if (!ta || !content) {
      ta?.focus();
      return;
    }
    // Get caret position at click; mirror is on top so we get a position in its DOM.
    const cp =
      document.caretPositionFromPoint?.(e.clientX, e.clientY) ??
      (document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY);
    let offset: number;
    if (cp) {
      const node =
        "offsetNode" in cp ? cp.offsetNode : (cp as Range).startContainer;
      const off = "offset" in cp ? cp.offset : (cp as Range).startOffset;
      if (!content.contains(node)) {
        offset = text.length;
      } else {
        offset = domPositionToCharacterOffset(content, node, off);
      }
    } else {
      offset = text.length;
    }
    offset = Math.max(0, Math.min(offset, text.length));
    ta.focus();
    ta.setSelectionRange(offset, offset);
  };

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
      </div>
      <div
        className="editor-area"
        style={{ "--editor-font-size": `${fontSize}px` } as CSSProperties}
        onMouseLeave={handleEditorAreaMouseLeave}
      >
        <div
          ref={mirrorRef}
          className="editor-mirror editor-mirror--overlay"
          aria-hidden="true"
          onMouseMove={handleMirrorMouseMove}
          onClick={handleMirrorClick}
        >
          <div
            className="editor-mirror-content"
            dangerouslySetInnerHTML={{ __html: renderMirrorContent(text, entries) }}
          />
        </div>
        <textarea
          ref={textareaRef}
          className="editor-textarea editor-textarea--under-mirror"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={handleScroll}
          placeholder="Paste or type text to check…"
          spellCheck={false}
        />
        {hoveredLint != null && popupStyle != null && (
          <div
            className="editor-lint-popup"
            style={popupStyle}
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
          >
            <p className="editor-lint-popup__message">
              {hoveredLint.message()}
            </p>
            {hoveredLint.suggestions().length > 0 && (
              <ul className="editor-lint-popup__suggestions" role="list">
                {hoveredLint.suggestions().map((s, i) => {
                  const label =
                    s.kind() === SuggestionKind.Replace
                      ? s.get_replacement_text()
                      : s.kind() === SuggestionKind.Remove
                        ? "Remove"
                        : `Insert "${s.get_replacement_text()}" after`;
                  return (
                    <li key={i} className="editor-lint-popup__item">
                      <button
                        type="button"
                        className="editor-lint-popup__apply"
                        onClick={() => handleApplySuggestion(hoveredLint, s)}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              className="editor-lint-popup__ignore"
              onClick={() => { if (hoveredLintIndex != null) handleIgnoreLint(hoveredLintIndex); }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
      <div className="editor-legend" aria-label="Lint categories">
        {lints.length > 0 && (
          <span className="editor-legend-count">
            {lints.length} issue{lints.length === 1 ? "" : "s"}
          </span>
        )}
        {LEGEND_ITEMS.map(({ key, label }) => (
          <span key={key} className="editor-legend-item">
            <span
              className={`editor-legend-swatch editor-legend-swatch--${key}`}
              aria-hidden
            />
            <span>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
