/**
 * Mirror rendering for the grammar editor: builds HTML from text and lint spans
 * for the overlay. Kept separate so it can be tested without Harper/React.
 */

export interface LintEntry {
  start: number;
  end: number;
  kind: string;
}

/**
 * Escapes HTML special characters for safe insertion into HTML (element content or
 * attributes). Covers &, <, >, ", ' to support attribute use if needed later.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** When text ends with a newline, the textarea reserves an extra line for the
 * cursor; the mirror must match or scroll sync is off by one at the bottom. */
export function trailingCursorLine(text: string): string {
  return text.endsWith("\n") ? "<br>" : "";
}

/**
 * Builds HTML for the mirror: escaped text with <mark> spans around each
 * lint. Lints are sorted by start; overlapping spans are skipped (first wins).
 * Security: all user-derived text is passed through escapeHtml; l.kind, l.start,
 * and l.end are from our mapping or Harper, not user-controlled.
 */
export function renderMirrorContent(text: string, lints: LintEntry[]): string {
  if (lints.length === 0) return escapeHtml(text) + trailingCursorLine(text);

  const sorted = [...lints].sort((a, b) => a.start - b.start);
  let lastEnd = 0;
  const filtered: LintEntry[] = [];
  for (const l of sorted) {
    if (l.start >= l.end) continue;
    if (l.start < lastEnd) continue;
    filtered.push(l);
    lastEnd = l.end;
  }

  const parts: string[] = [];
  let pos = 0;
  for (const l of filtered) {
    if (l.start > pos) parts.push(escapeHtml(text.slice(pos, l.start)));
    const start = Math.max(0, Math.min(l.start, text.length));
    const end = Math.max(start, Math.min(l.end, text.length));
    if (end > start) {
      parts.push(
        `<mark class="lint lint--${l.kind}" data-start="${l.start}" data-end="${l.end}">${escapeHtml(text.slice(start, end))}</mark>`
      );
      pos = end;
    }
  }
  parts.push(escapeHtml(text.slice(pos)));
  return parts.join("") + trailingCursorLine(text);
}
