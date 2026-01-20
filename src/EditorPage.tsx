import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

export default function EditorPage() {
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      unlisten.then((fn) => fn());
    };
  }, []);

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
          <div className="editor-mirror-content">
            {text}
          </div>
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
    </div>
  );
}
