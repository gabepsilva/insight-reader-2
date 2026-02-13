# Code simplification and cleanup

Review **uncommitted** changes and look for opportunities to simplify and remove unnecessary code while keeping or improving maintainability. This is a cleanup focus, not a full code review.

Start your response with: **"## Code Cleanup Review"** and a brief summary of what you're examining.

---

## Principles (in order of priority)

1. **Maintainability is paramount** — Never compromise clarity, readability, or maintainability.
2. **Simplification** — Remove complexity where possible without sacrificing clarity.
3. **Elimination** — Remove dead code, unused imports, redundant logic, and unnecessary abstractions.

---

## What to look for

### Code to eliminate

- Dead code (unreachable or unused functions, variables, imports)
- Duplicate code that could be consolidated
- Commented-out code that doesn’t document anything
- Redundant checks or operations
- Unnecessary intermediate variables that don’t improve clarity

### Code to simplify

- Overly complex conditionals (prefer guard clauses, `let-else`)
- Nested structures that can be flattened
- Verbose patterns that have simpler idiomatic equivalents
- Unnecessary abstractions or indirection
- Complex expressions that would benefit from being split or clarified

### Rust-specific patterns

```rust
// Verbose
if optional.is_some() {
    let value = optional.unwrap();
    use_value(value);
}

// Simplified
if let Some(value) = optional {
    use_value(value);
}

// Nested error handling → early return with ?
let value = result?;
// ... rest of code
```

### Maintainability improvements

- Better naming (clearer, more descriptive)
- Better structure (logical grouping, separation of concerns)
- Better comments (explaining "why" not "what")
- Consistent patterns across the codebase
- Reduced cognitive load

---

## Guidelines

- Always prioritize clarity over cleverness.
- If simplification makes code harder to understand, don’t do it.
- Add brief comments when removing seemingly redundant code.
- Preserve error handling and edge cases.
- Keep performance characteristics similar unless improvement is clear.
- Document any behavioral changes explicitly.

---

## When proposing changes

- Explain **why** the change improves maintainability.
- Point out what complexity is being removed.
- Note assumptions and any trade-offs.
