# TipTap Migration Checklist

Each milestone is designed to be completed in a single LLM session. After completing a milestone, clear context and reference this checklist for the next one.

---

## Milestone 1: Install Dependencies & Create Bare TipTap Component

**Goal**: Get TipTap rendering in place of textarea, no functionality yet.

- [ ] Install TipTap packages:
  ```bash
  npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
  ```
- [ ] Create `src/components/TipTapEditor.tsx` with basic editor:
  - StarterKit extension
  - Placeholder extension ("Paste or type text to check…")
  - Accept `content` and `onUpdate` props
  - Export the editor instance via ref or callback
- [ ] Create `src/components/TipTapEditor.css` with minimal styles:
  - `.tiptap` base styles (font, padding, outline)
  - Placeholder styling
- [ ] Test: Editor renders, can type text, basic formatting works (bold/italic with keyboard shortcuts)

**Output**: Working TipTap editor component, not yet integrated into EditorPage.

---

## Milestone 2: Integrate TipTap into EditorPage (No Linting)

**Goal**: Replace textarea with TipTap, maintain existing UI (toolbar, dark mode, font size).

- [ ] Modify `src/EditorPage.tsx`:
  - Import TipTapEditor component
  - Replace textarea + mirror div with TipTapEditor
  - Wire up `content` state (convert from plain text to TipTap content)
  - Wire up `onUpdate` to update state
  - Keep toolbar (dark mode, font size buttons)
  - Keep Tauri integration (`take_editor_initial_text`, `editor-set-text` event)
- [ ] Update `src/EditorPage.css`:
  - Remove textarea/mirror styles (keep for reference, comment out)
  - Add TipTap container styles
  - Ensure font size CSS variable works with TipTap
  - Ensure dark mode class works with TipTap
- [ ] Test: Editor loads, toolbar works, dark mode toggles, font size changes, Tauri events set content

**Output**: EditorPage uses TipTap, no linting yet, UI functional.

---

## Milestone 3: Position Mapping Utility

**Goal**: Create utility to map between plain text offsets and ProseMirror positions.

- [x] Create `src/utils/positionMap.ts`:
  - `extractTextWithMap(doc: Node): { text: string, map: PositionMap }`
  - `PositionMap` interface with `textToDoc(offset: number): number` and `docToText(pos: number): number`
  - Handle block nodes (paragraphs add newlines)
  - Handle inline nodes (text nodes map 1:1)
- [x] Create `src/utils/positionMap.test.ts` (or manual test cases):
  - Single paragraph: "hello world" → positions match
  - Multiple paragraphs: "hello\n\nworld" → newlines handled
  - Formatted text: "hello **world**" → positions inside marks correct
- [x] Test: Console log mapping for sample documents, verify correctness

**Output**: Tested position mapping utility ready for use.

---

## Milestone 4: Harper Lint Extension (Decorations Only)

**Goal**: Create TipTap extension that runs Harper and shows decorations, no popup yet.

- [x] Create `src/extensions/harperLint.ts`:
  - TipTap Extension with ProseMirror plugin
  - On document change (debounced 350ms):
    1. Extract plain text using positionMap utility
    2. Run Harper linter (reuse existing WorkerLinter setup)
    3. Map lint positions to doc positions
    4. Create Decoration.inline for each lint
  - Store decorations in plugin state
  - Return decorations via `props.decorations`
- [x] Add decoration CSS classes to `src/components/TipTapEditor.css`:
  - `.lint--spelling` (red underline)
  - `.lint--grammar` (blue underline)
  - `.lint--punctuation` (orange underline)
  - `.lint--capitalization` (yellow underline)
  - `.lint--style` (purple underline)
  - `.lint--misc` (gray underline)
- [x] Wire extension into TipTapEditor component
- [x] Test: Type text with errors, see colored underlines appear

**Output**: Lints display as underlines, no interaction yet.

---

## Milestone 5: Lint Popup Component (Display Only)

**Goal**: Show popup with lint message on hover/click, no actions yet.

- [x] Create `src/components/LintPopup.tsx`:
  - Props: `lint: Lint`, `position: {x, y}`, `onClose: () => void`
  - Display lint message
  - Display suggestions as list (text only, no buttons yet)
  - Styled to match existing popup design
- [x] Create `src/components/LintPopup.css`:
  - Position fixed, near cursor
  - Dark mode support
  - Match existing `.editor-lint-popup` styles
- [x] Add hover detection to harperLint extension:
  - Track which decoration is hovered
  - Store hovered lint + mouse position in React state (via callback prop)
- [x] Update TipTapEditor to render LintPopup when lint is hovered
- [x] Test: Hover over underlined text, popup appears with message

**Output**: Popup shows on hover, displays lint info.

---

## Milestone 6: Apply Suggestions

**Goal**: Make suggestion buttons functional, applying fixes to the document.

- [x] Update `src/components/LintPopup.tsx`:
  - Add click handler to suggestion items
  - Props: add `onApply: (suggestion: Suggestion) => void`
  - Add "Dismiss" button with `onDismiss` prop
- [x] Update `src/extensions/harperLint.ts` or TipTapEditor:
  - `applySuggestion(editor, lint, suggestion)` in `src/utils/applySuggestion.ts`:
    - Get doc positions from lint span
    - Handle SuggestionKind.Replace: delete range, insert text
    - Handle SuggestionKind.Remove: delete range
    - Handle SuggestionKind.InsertAfter: insert text at position
  - After applying, close popup and re-lint
- [x] Add ignore/dismiss functionality:
  - Track dismissed lint indices
  - Filter them out of decoration creation
- [x] Test: Click suggestion, text is replaced/removed/inserted correctly

**Output**: Full lint interaction working - hover, view, apply, dismiss.

---

## Milestone 7: Legend & Issue Count

**Goal**: Add the legend bar and issue count from original design.

- [x] Update TipTapEditor or EditorPage:
  - Pass lint count up to parent (or compute in parent)
  - Render legend bar below editor (reuse existing JSX from EditorPage)
- [x] Ensure legend colors match decoration colors
- [x] Test: Legend displays, count updates as lints change

**Output**: UI matches original design with legend.

---

## Milestone 8: Cleanup & Polish

**Goal**: Remove old code, fix edge cases, polish UX.

- [x] Remove deprecated files:
  - Delete `src/editorMirror.ts` (no longer needed)
  - Remove commented-out textarea/mirror code from EditorPage
- [x] Edge cases:
  - Empty document handling
  - Very fast typing (ensure debounce works)
  - Overlapping lints (first wins, same as before)
  - Undo/redo doesn't break lint state
- [ ] Performance check:
  - Test with large document (1000+ words)
  - Ensure no lag on typing
- [ ] Accessibility:
  - Keyboard navigation for popup
  - ARIA labels on decorations
- [x] Test: Full workflow works smoothly

**Output**: Production-ready TipTap grammar editor.

---

## Milestone 9 (Optional): Markdown Support

**Goal**: Add markdown input/output support.

- [ ] Install markdown extension:
  ```bash
  npm install @tiptap/extension-markdown
  ```
- [ ] Or implement basic markdown input rules:
  - `**bold**` → bold
  - `*italic*` → italic
  - `# heading` → heading
  - `- item` → bullet list
- [ ] Add markdown export function if needed
- [ ] Test: Type markdown syntax, see formatting applied

**Output**: Markdown formatting support.

---

## Quick Reference: File Locations

| File | Purpose |
|------|---------|
| `src/components/TipTapEditor/` | Main editor component |
| `src/components/LintPopup/` | Suggestion popup |
| `src/extensions/harperLint.ts` | Harper linting extension |
| `src/utils/positionMap.ts` | Position mapping utility |
| `src/utils/applySuggestion.ts` | Apply Harper suggestions via editor transactions |
| `src/EditorPage.tsx` | Parent page (modified) |
| `src/EditorPage.css` | Page styles (modified) |

---

## Session Start Template

When starting a new session, paste this:

```
Continue TipTap migration. Current milestone: [NUMBER]

Checklist: docs/tiptap-migration-checklist.md
Architecture doc: docs/tiptap-harper-integration.md

Completed milestones: [LIST]

Start working on Milestone [NUMBER].
```
