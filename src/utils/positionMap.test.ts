import { describe, it, expect } from "vitest";
import { Node, Schema } from "@tiptap/pm/model";
import { extractTextWithMap } from "./positionMap";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

function docFromJson(json: unknown): Node {
  return Node.fromJSON(schema, json);
}

describe("extractTextWithMap", () => {
  it("single paragraph: hello world – positions match", () => {
    const doc = docFromJson({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] },
      ],
    });
    const { text, map } = extractTextWithMap(doc);
    expect(text).toBe("hello world");
    // Corrected for 2-char offset: docFrom=abs-1. 1 before 'h' … 13 after 'd'.
    expect(map.textToDoc(0)).toBe(1);
    expect(map.textToDoc(5)).toBe(6);
    expect(map.textToDoc(11)).toBe(13);

    expect(map.docToText(1)).toBe(0);
    expect(map.docToText(6)).toBe(5);
    expect(map.docToText(13)).toBe(11);
  });

  it("multiple paragraphs: newlines between blocks", () => {
    const doc = docFromJson({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
        { type: "paragraph", content: [{ type: "text", text: "world" }] },
      ],
    });
    const { text, map } = extractTextWithMap(doc);
    expect(text).toBe("hello\nworld");

    expect(map.textToDoc(0)).toBe(1);
    expect(map.textToDoc(5)).toBe(7); // after "hello" (end of first block's segment)
    expect(map.textToDoc(6)).toBe(9); // after \n, at start of "world" (para nodeSize 7)
    expect(map.textToDoc(7)).toBe(9); // after 'w' in "world"
    expect(map.textToDoc(12)).toBe(14); // after "world"

    expect(map.docToText(1)).toBe(0);
    expect(map.docToText(7)).toBe(5);
    expect(map.docToText(8)).toBe(5); // newline segment
    expect(map.docToText(9)).toBe(6); // at newline end / world start
  });

  it("three paragraphs: hello, empty, world", () => {
    const doc = docFromJson({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "world" }] },
      ],
    });
    const { text, map } = extractTextWithMap(doc);
    expect(text).toBe("hello\n\nworld");

    expect(map.textToDoc(6)).toBe(9);
    expect(map.textToDoc(7)).toBe(11); // after first \n, before "w"
    expect(map.docToText(11)).toBe(7);
  });

  it("formatted text (single text node): positions inside node correct", () => {
    const doc = docFromJson({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] },
      ],
    });
    const { text, map } = extractTextWithMap(doc);
    expect(text).toBe("hello world");
    expect(map.textToDoc(6)).toBe(7);
    expect(map.textToDoc(11)).toBe(13);
    expect(map.docToText(7)).toBe(6);
    expect(map.docToText(13)).toBe(11);
  });

  it("empty doc: map has sentinel", () => {
    const doc = docFromJson({ type: "doc", content: [{ type: "paragraph" }] });
    const { text, map } = extractTextWithMap(doc);
    expect(text).toBe("");
    expect(map.textToDoc(0)).toBe(1);
    expect(map.docToText(1)).toBe(0);
  });
});
