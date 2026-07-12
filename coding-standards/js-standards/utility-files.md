# JS Standards — Utility / Helper Files

**Role:** A utility file contains pure functions shared across the codebase. No side effects, no state, no imports from class or controller files.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to utility files only.

---

## RULE JS-U-01 — Utilities must be pure functions

A utility function returns the same output for the same input every time. It must not read from or write to external state, the DOM, or global variables.

```js
// Wrong
function getViewportWidth() {
  return window.innerWidth; // reads external state
}

// Right
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
```

---

## RULE JS-U-02 — Utilities are individually named exports

Each utility function is a named export. No default export wrapping unrelated functions.

```js
// Wrong
export default { clamp, lerp, mapRange };

// Right
export function clamp(value, min, max) { ... }
export function lerp(a, b, t) { ... }
```

---

## RULE JS-U-03 — Utilities must not import from class or controller files

A utility file sits at the bottom of the dependency tree. It may only import from other utility files or external packages.
