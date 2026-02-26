import type { Lint } from "harper.js";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { extractTextWithMap } from "../utils/positionMap";

const HARPER_LINT_DEBOUNCE_MS = 350;

const KINDS = [
  "spelling",
  "grammar",
  "punctuation",
  "capitalization",
  "style",
  "typo",
  "repetition",
  "misc",
] as const;
export function toLintClass(kind: string): string {
  const k = kind.toLowerCase().replace(/\s+/g, "");
  return KINDS.includes(k as (typeof KINDS)[number]) ? k : "misc";
}

export interface HarperLintScheduleRef {
  current: ((immediate?: boolean) => void) | null;
}

export interface HarperLintLintRef {
  current: (text: string) => Promise<Lint[]>;
}

export interface HarperLintOptions {
  /** Run Harper on plain text and return lints. Ignored when lintRef is provided. */
  lint?: (text: string) => Promise<Lint[]>;
  /** When set, used for each run so the host can enable/disable Harper without re-mounting. */
  lintRef?: HarperLintLintRef;
  /** Called when lints change (e.g. for legend count). */
  onLintsChange?: (lints: Lint[]) => void;
  /** Called when the pointer is over a lint decoration. index is into the lints array. */
  onHover?: (index: number, mouse: { x: number; y: number }) => void;
  /** Called when the pointer is not over any lint (e.g. clear popup). */
  onHoverEnd?: () => void;
  /** Ref to the plugin's schedule function; set so the host can trigger a re-lint (e.g. after dismiss). */
  scheduleLintRef?: HarperLintScheduleRef;
}

export const harperLintPluginKey = new PluginKey<DecorationSet>("harperLint");

export const HarperLint = Extension.create<HarperLintOptions>({
  name: "harperLint",

  addOptions() {
    return {
      lint: undefined,
      lintRef: undefined,
      onLintsChange: undefined,
      onHover: undefined,
      onHoverEnd: undefined,
      scheduleLintRef: undefined,
    };
  },

  addProseMirrorPlugins() {
    const {
      lint,
      lintRef,
      onLintsChange,
      onHover,
      onHoverEnd,
      scheduleLintRef,
    } = this.options;
    const noopLint = async (): Promise<Lint[]> => [];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastLints: Lint[] = [];

    function runLint(editorView: EditorView) {
      const { doc } = editorView.state;
      const { text, map } = extractTextWithMap(doc);
      if (!text.trim()) {
        lastLints = [];
        onLintsChange?.(lastLints);
        editorView.dispatch(
          editorView.state.tr.setMeta(harperLintPluginKey, DecorationSet.empty),
        );
        return;
      }
      const lintFn = lintRef ? lintRef.current : lint ?? noopLint;
      lintFn(text)
        .then((lints) => {
          lastLints = lints;
          onLintsChange?.(lints);
          const withIdx = lints.map((l, i) => ({ l, i }));
          withIdx.sort((a, b) => a.l.span().start - b.l.span().start);
          let lastEnd = 0;
          const decos: Decoration[] = [];
          const docLen = doc.content.size;
          for (const { l, i: origIndex } of withIdx) {
            const span = l.span();
            if (span.start >= span.end || span.start < lastEnd) continue;
            lastEnd = span.end;
            const from = Math.max(
              1,
              Math.min(map.textToDoc(span.start), docLen),
            );
            const to = Math.max(
              from,
              Math.min(map.textToDoc(span.end), docLen + 1),
            );
            if (to <= from) continue;
            const kind = toLintClass(l.lint_kind());
            decos.push(
              Decoration.inline(from, to, {
                class: `lint lint--${kind}`,
                "data-lint-index": String(origIndex),
              }),
            );
          }
          const set = DecorationSet.create(doc, decos);
          editorView.dispatch(
            editorView.state.tr.setMeta(harperLintPluginKey, set),
          );
        })
        .catch((e) => {
          console.warn("[harperLint] lint failed:", e);
          lastLints = [];
          onLintsChange?.(lastLints);
          editorView.dispatch(
            editorView.state.tr.setMeta(
              harperLintPluginKey,
              DecorationSet.empty,
            ),
          );
        });
    }

    return [
      new Plugin({
        key: harperLintPluginKey,
        state: {
          init(_config, _state) {
            return DecorationSet.empty;
          },
          apply(tr, set, _oldState, _newState) {
            const meta = tr.getMeta(harperLintPluginKey) as
              | DecorationSet
              | undefined;
            if (meta != null) return meta;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return harperLintPluginKey.getState(state) ?? DecorationSet.empty;
          },
          handleDOMEvents: {
            mousemove(view, evt) {
              let el: Element | null = evt.target as Element;
              while (el && el !== view.dom) {
                if (
                  el instanceof HTMLElement &&
                  el.hasAttribute("data-lint-index")
                ) {
                  const idx = parseInt(
                    el.getAttribute("data-lint-index") ?? "",
                    10,
                  );
                  if (!Number.isNaN(idx))
                    onHover?.(idx, { x: evt.clientX, y: evt.clientY });
                  return;
                }
                el = el.parentElement;
              }
              onHoverEnd?.();
            },
          },
        },
        view(editorView) {
          const schedule = (immediate?: boolean) => {
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            if (immediate) {
              runLint(editorView);
            } else {
              timeoutId = setTimeout(() => {
                timeoutId = null;
                runLint(editorView);
              }, HARPER_LINT_DEBOUNCE_MS);
            }
          };
          if (scheduleLintRef) scheduleLintRef.current = schedule;
          schedule();
          return {
            update(view, prevState) {
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy() {
              if (timeoutId) clearTimeout(timeoutId);
              if (scheduleLintRef) scheduleLintRef.current = null;
            },
          };
        },
      }),
    ];
  },
});
