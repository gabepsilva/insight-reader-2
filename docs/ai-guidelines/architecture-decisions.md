# Architecture decision records

When making or revisiting a significant technical decision, document it.

---

## When to use

- Choosing between libraries (e.g. EasyOCR vs PaddleOCR vs docTR)
- Changing module structure significantly
- Adding platform-specific behavior
- Changing data formats or config schemas
- Trade-offs with no obvious "right" answer

---

## ADR format

Use this structure for each ADR:

```markdown
# ADR-NNN: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
What situation prompted this decision?

## Options Considered
1. **Option A** — pros / cons
2. **Option B** — pros / cons
3. **Option C** — pros / cons

## Decision
What we chose and why.

## Consequences
- What becomes easier
- What becomes harder
- What we're accepting as trade-offs
```

---

## Where to save

Save each ADR as `docs/adr/NNN-title.md` (e.g. `docs/adr/001-ocr-backend-choice.md`).

---

## Recommendation

Keep ADRs short and focused. One decision per file. Update Status when the decision is accepted, deprecated, or superseded.
