# JS Standards — Utility / Helper Files

**Role:** A utility file contains pure functions shared across the codebase. Utilities have no side effects, hold no state, and do not import from class or controller files.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to utility files only.

---

## RULE U-01 — Utilities must be pure functions

A utility function must return the same output for the same input every time. It must not read from or write to external state, the DOM, or global variables.

```ts
// Wrong
function getViewportWidth(): number {
  return window.innerWidth; // reads external state
}

// Right
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

---

## RULE U-02 — Utilities are individually exported

Each utility function is a named export. No utility file exports a default class or object wrapping unrelated functions.

```ts
// Wrong
export default {
  clamp,
  lerp,
  mapRange,
};

// Right
export function clamp(...) { ... }
export function lerp(...) { ... }
export function mapRange(...) { ... }
```

---

## RULE U-03 — Utilities must have explicit parameter and return types

All parameters and return types must be typed. No implicit `any`.

---

## RULE U-04 — Utilities must not import from class or controller files

A utility file sits at the bottom of the dependency tree. It may only import from other utility files or external packages.
