# TS Standards — TypeScript Only Projects

These rules apply when a project uses **TypeScript exclusively**. Every script file is `.ts`. No `.js` files exist in the project source.

This file is **standalone and self-contained**. Do not read `js-standards.md` or `js-and-ts-standards.md` alongside this file.

For file-type specific rules see: [ts-standards/](ts-standards/)

---

## RULE TS-01 — No implicit any

Every variable, parameter, and return value must have an explicit type. Use `unknown` and narrow it rather than falling back to `any`.

```ts
// Wrong
function init(config) { ... }

// Right
function init(config: AppConfig): void { ... }
```

---

## RULE TS-02 — No magic numbers or strings

Literal values used for logic must be named typed constants.

```ts
// Wrong
if (speed > 0.85) { ... }

// Right
const WARP_THRESHOLD = 0.85 as const;
if (speed > WARP_THRESHOLD) { ... }
```

---

## RULE TS-03 — Functions do one thing

A function must have a single, clearly named responsibility with an explicit return type.

---

## RULE TS-04 — No console.log in committed code

`console.log`, `console.warn`, and `console.error` must not appear in committed code.

---

## RULE TS-05 — Event listeners must be cleaned up

Any event listener added programmatically must have a corresponding removal path.

---

## RULE TS-06 — No global mutable state

Shared state must go through a single designated module or class.

---

## RULE TS-07 — Async functions must handle errors

Every `async` function or `Promise` chain must have explicit error handling.

---

## RULE TS-08 — Imports are grouped and ordered

1. External packages (npm)
2. Internal absolute paths
3. Relative paths

---

## RULE TS-09 — No commented-out code

Commented-out code must not be committed.

---

## RULE TS-10 — Use const by default

`var` is not permitted. Use `const` by default, `let` only when reassignment is required.

---

## RULE TS-11 — Use strict equality

Always use `===` and `!==`. Never use `==` or `!=`.

---

## RULE TS-12 — Prefer interface over type for object shapes

Use `interface` for object shapes. Use `type` for unions, intersections, and primitive aliases.

```ts
// Wrong
type CardProps = { title: string; };

// Right
interface CardProps { title: string; }
type Size = 'sm' | 'md' | 'lg';
```

---

## RULE TS-13 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }

// Right
enum Direction { LEFT = 'LEFT', RIGHT = 'RIGHT' }
```

---

## RULE TS-14 — No duplicate type definitions

A type used in more than one file must be defined once in a type file and imported everywhere needed.

---

## RULE TS-15 — Type assertions require a justifying comment

Using `as` must be accompanied by an inline comment explaining why the assertion is safe.

```ts
// Wrong
const canvas = document.querySelector('#canvas') as HTMLCanvasElement;

// Right
const canvas = document.querySelector('#canvas') as HTMLCanvasElement; // guaranteed present by layout template
```

---

## RULE TS-16 — State attributes are updated by value, never added or removed

When controlling element state via data attributes, only update the attribute's value. Never add or remove the attribute itself. Never add or remove classes or IDs to reflect state.

```ts
// Wrong — adding or removing the attribute
element.setAttribute('data-open', '');
element.removeAttribute('data-open');

// Wrong — toggling a class to reflect state
element.classList.add('is-open');
element.classList.remove('is-open');

// Right — updating the value only
element.dataset.state = 'open';
element.dataset.state = 'closed';

// Right — multi-state update
element.dataset.theme = 'dark';
element.dataset.theme = 'dim';
```
