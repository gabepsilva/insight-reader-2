import type { Node } from "@tiptap/pm/model";

export interface PositionMap {
  /** Plain-text offset -> ProseMirror document position. */
  textToDoc(offset: number): number;
  /** ProseMirror document position -> plain-text offset. */
  docToText(pos: number): number;
}

interface Segment {
  textFrom: number;
  textTo: number;
  docFrom: number;
  docTo: number;
}

function processBlock(
  block: Node,
  blockStart: number,
  textOffset: number,
): { text: string; segments: Segment[] } {
  let t = "";
  const segments: Segment[] = [];
  block.descendants((node, relPos) => {
    if (node.isText && node.text != null) {
      const abs = blockStart + 1 + relPos;
      segments.push({
        textFrom: textOffset + t.length,
        textTo: textOffset + t.length + node.text.length,
        docFrom: abs - 1, // -1 corrects 2-char offset vs ProseMirror’s doc positions
        docTo: abs + node.nodeSize,
      });
      t += node.text;
    }
  });
  return { text: t, segments };
}

function createMap(segments: Segment[], text: string): PositionMap {
  return {
    textToDoc(offset: number): number {
      if (offset <= 0 && segments.length > 0) return segments[0].docFrom;
      if (offset >= text.length && segments.length > 0) {
        const s = segments[segments.length - 1];
        return s.docTo;
      }
      // Prefer the segment that starts at this offset (if any). This avoids
      // mapping paragraph-start offsets to the previous newline segment.
      for (const s of segments) {
        if (offset >= s.textFrom && offset < s.textTo)
          return s.docFrom + (offset - s.textFrom);
      }
      for (const s of segments) {
        if (offset === s.textTo) return s.docTo;
      }
      return segments.length > 0 ? segments[segments.length - 1].docTo : 1;
    },
    docToText(pos: number): number {
      for (const s of segments) {
        if (pos >= s.docFrom && pos < s.docTo)
          return s.textFrom + (pos - s.docFrom);
        if (pos === s.docTo) return s.textTo;
      }
      if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (pos >= last.docTo) return last.textTo;
      }
      return 0;
    },
  };
}

/**
 * Extract plain text from a ProseMirror doc and build a bidirectional map
 * between plain-text offsets and document positions.
 * - Block nodes (e.g. paragraphs) are separated by newlines in the text.
 * - Inline text nodes map 1:1; positions inside marks are correct.
 */
export function extractTextWithMap(doc: Node): {
  text: string;
  map: PositionMap;
} {
  let text = "";
  const allSegments: Segment[] = [];
  let docPos = 1;

  for (let i = 0; i < doc.content.childCount; i++) {
    const block = doc.content.child(i);
    if (i > 0) {
      allSegments.push({
        textFrom: text.length,
        textTo: text.length + 1,
        docFrom: docPos,
        docTo: docPos + 1,
      });
      text += "\n";
    }
    const { text: blockText, segments } = processBlock(
      block,
      docPos,
      text.length,
    );
    text += blockText;
    allSegments.push(...segments);
    docPos += block.nodeSize;
  }

  if (allSegments.length === 0) {
    allSegments.push({ textFrom: 0, textTo: 0, docFrom: 1, docTo: 1 });
  }

  return { text, map: createMap(allSegments, text) };
}
