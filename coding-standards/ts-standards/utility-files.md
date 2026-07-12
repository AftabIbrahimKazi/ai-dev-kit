# TS Standards — Utility / Helper Files

**Role:** A utility file contains pure typed functions shared across the codebase. No side effects, no state, no imports from class or controller files.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to utility files only.

---

## RULE TS-U-01 — Utilities must be pure functions with explicit types

All parameters and return types must be typed. No implicit `any`.

```ts
// Wrong
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Right
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

---

## RULE TS-U-02 — Utilities are individually named exports

```ts
// Wrong
export default { clamp, lerp };

// Right
export function clamp(...): number { ... }
export function lerp(...): number { ... }
```

---

## RULE TS-U-03 — Utilities must not import from class or controller files

A utility file sits at the bottom of the dependency tree. It may only import from other utility files or external packages.
