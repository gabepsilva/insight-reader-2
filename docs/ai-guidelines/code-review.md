# Code review

Perform a thorough review of proposed changes. Focus on **correctness, safety, and design** — not cleanup (that’s [code-simplification.md](code-simplification.md)).

---

## Review dimensions

### 1. Correctness

- Does the code do what it claims?
- Are edge cases handled? (empty inputs, `None`, network failures)
- Are error paths tested and reasonable?
- Any logic bugs or off-by-one errors?
- Does async code handle cancellation properly?

### 2. Safety and security

- Any `.unwrap()` or `.expect()` that could panic in production?
- User input validated before use?
- Secrets/credentials handled correctly (not logged, not hardcoded)?
- Any `unsafe` blocks? Are SAFETY comments present and valid?
- File paths sanitized? (no path traversal)
- Network inputs treated as untrusted?

### 3. Error handling

- Are errors propagated with context? (e.g. `anyhow::Context`)
- User-facing errors actionable and clear?
- Errors logged at appropriate levels?
- Recovery possible where it should be?

### 4. Architecture and design

- Does this change belong in this module, or does it suggest a refactor?
- Any new coupling that could be avoided?
- Is the abstraction level appropriate (not over/under-engineered)?
- Will this be easy to modify in 6 months?
- Breaking changes to public APIs?

### 5. Rust-specific

- Ownership used correctly? (unnecessary clones, `Arc<Mutex>` overuse)
- Lifetimes reasonable?
- Traits used appropriately (not stringly-typed)?
- `#[cfg(...)]` platform code compiles on all targets?
- Blocking code in async context?

### 6. Tauri/UI (if applicable)

- Commands and events used consistently?
- Heavy work off the command/UI thread where appropriate?
- Frontend fails gracefully when not running under Tauri?

### 7. Tests

- New code covered by tests?
- Tests assert behavior, not implementation?
- Edge cases covered?
- Tests deterministic (no timing or random dependencies)?

### 8. Documentation

- Public APIs documented?
- Complex logic has comments (WHY, not WHAT)?
- README/docs updated if behavior changed?

---

## Review output format

Structure the review as:

```text
## Summary
[1–2 sentence overall assessment]

## Must Fix (blocking)
- [ ] Issue → suggested fix

## Should Fix (important but not blocking)
- [ ] Issue → suggested fix

## Consider (suggestions / nitpicks)
- [ ] Optional improvement

## Questions
- Clarifying questions about intent or context

## What's Good
- Call out well-written code (reinforcement matters)
```

---

## Reviewer mindset

- **Assume good intent** — ask "why was this done?" before criticizing.
- **Be specific** — e.g. "this unwrap on line 42 panics if the file doesn’t exist".
- **Suggest, don’t demand** — especially for style preferences.
- **Praise good work** — reinforcement helps.
- **Severity matters** — distinguish "this will crash" from "I’d name this differently".
- **You might be wrong** — if something seems odd, ask before assuming it’s a bug.

---

## Out of scope

- Formatting (that’s `cargo fmt`)
- Lint warnings (that’s `cargo clippy`)
- Simple cleanup (that’s [code-simplification.md](code-simplification.md))
- Bike-shedding on naming unless genuinely confusing

---

## Workflow suggestion

1. Write code (guided by [AGENTS.md](../../AGENTS.md)).
2. Self-cleanup pass ([code-simplification.md](code-simplification.md)).
3. Code review (this doc).
4. `cargo fmt` / `cargo clippy` / `cargo test`.
5. Commit.
