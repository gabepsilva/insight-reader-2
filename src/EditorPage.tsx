import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { binaryInlined, Dialect, type Lint, WorkerLinter } from "harper.js";
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

const LEGEND_ITEMS: { key: string; label: string }[] = [
  { key: "spelling", label: "Spelling" },
  { key: "grammar", label: "Grammar" },
  { key: "punctuation", label: "Punctuation" },
  { key: "capitalization", label: "Capitalization" },
  { key: "style", label: "Style" },
  { key: "misc", label: "Other" },
];

export default function EditorPage() {
  const [text, setText] = useState("");
  const [lints, setLints] = useState<LintEntry[]>([]);
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
        const entries: LintEntry[] = list.map((lint) => {
          const s = lint.span();
          const raw =
            lint.lint_kind?.() ?? lint.lint_kind_pretty?.() ?? "Miscellaneous";
          return {
            start: s.start,
            end: s.end,
            kind: lintKindToClass(String(raw)),
          };
        });
        setLints(entries);
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
        style={{ "--editor-font-size": `${fontSize}px` } as React.CSSProperties}
      >
        <div
          ref={mirrorRef}
          className="editor-mirror"
          aria-hidden="true"
        >
          <div
            className="editor-mirror-content"
            dangerouslySetInnerHTML={{ __html: renderMirrorContent(text, lints) }}
          />
        </div>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={handleScroll}
          placeholder="Paste or type text to check…"
          spellCheck={false}
        />
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
