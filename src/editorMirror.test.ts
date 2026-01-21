import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderMirrorContent,
  trailingCursorLine,
  type LintEntry,
} from "./editorMirror";

describe("escapeHtml", () => {
  it("escapes &, <, >", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });
  it("escapes double and single quotes", () => {
    expect(escapeHtml('say "hi" and \'bye\'')).toBe(
      "say &quot;hi&quot; and &#39;bye&#39;"
    );
  });
  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("trailingCursorLine", () => {
  it("returns <br> when text ends with newline", () => {
    expect(trailingCursorLine("a\n")).toBe("<br>");
    expect(trailingCursorLine("\n")).toBe("<br>");
  });
  it("returns empty when text does not end with newline", () => {
    expect(trailingCursorLine("a")).toBe("");
    expect(trailingCursorLine("")).toBe("");
  });
});

describe("renderMirrorContent", () => {
  it("returns escaped text plus trailing br when no lints", () => {
    expect(renderMirrorContent("hello", [])).toBe("hello");
    expect(renderMirrorContent("a < b\n", [])).toBe("a &lt; b\n<br>");
  });

  it("wraps a single lint in a mark", () => {
    const lints: LintEntry[] = [{ start: 2, end: 5, kind: "spelling" }];
    expect(renderMirrorContent("hello world", lints)).toBe(
      'he<mark class="lint lint--spelling" data-start="2" data-end="5">llo</mark> world'
    );
  });

  it("sorts by start and skips overlapping lints (first wins)", () => {
    const lints: LintEntry[] = [
      { start: 5, end: 10, kind: "grammar" },
      { start: 2, end: 7, kind: "spelling" },
    ];
    const out = renderMirrorContent("hello world", lints);
    // First by start: [2,7) then [5,10). [5,7) overlaps [2,7), so [5,10) is skipped.
    expect(out).toContain('data-start="2" data-end="7"');
    expect(out).not.toContain('data-start="5"');
  });

  it("skips zero-width and reversed spans", () => {
    const lints: LintEntry[] = [
      { start: 3, end: 3, kind: "spelling" },
      { start: 5, end: 4, kind: "grammar" },
    ];
    expect(renderMirrorContent("hello", lints)).toBe("hello");
  });

  it("clamps OOB spans to text length", () => {
    const lints: LintEntry[] = [{ start: 1, end: 99, kind: "misc" }];
    expect(renderMirrorContent("hi", lints)).toBe(
      'h<mark class="lint lint--misc" data-start="1" data-end="99">i</mark>'
    );
  });

  it("escapes user text inside marks", () => {
    const lints: LintEntry[] = [{ start: 0, end: 8, kind: "style" }];
    expect(renderMirrorContent("<script>", lints)).toBe(
      '<mark class="lint lint--style" data-start="0" data-end="8">&lt;script&gt;</mark>'
    );
  });

  it("appends trailing br when text ends with newline", () => {
    const lints: LintEntry[] = [{ start: 0, end: 1, kind: "spelling" }];
    expect(renderMirrorContent("a\n", lints)).toMatch(/<br>$/);
  });
});
