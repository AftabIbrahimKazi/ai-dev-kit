# JS + TS Standards — Combined Projects

These rules apply when a project uses **both JavaScript and TypeScript files simultaneously** — for example, a TypeScript application that consumes JavaScript packages, or a project where some files are `.js` and others are `.ts`.

These rules are **standalone and self-contained**. Do not read `js-standards.md` or `ts-standards.md` alongside this file. This file replaces both for combined projects.

For file-type specific rules see: [js-and-ts-standards/](js-and-ts-standards/)

---

## Language Assignment

Before editing any script file, identify its language:

| File extension | Language | Additional rules |
|---|---|---|
| `.js`, `.mjs`, `.cjs` | JavaScript | JS rules in this file apply |
| `.ts`, `.mts` | TypeScript | All rules in this file apply |
| `.d.ts` | Type declarations | See [js-and-ts-standards/type-files.md](js-and-ts-standards/type-files.md) |

---

## RULE JT-01 — Do not convert files without a clear reason

A `.js` file must not be renamed to `.ts` unless there is a deliberate decision to migrate it. Accidental conversions introduce type errors in surrounding code. Conversion must be intentional and complete — partial type coverage is not acceptable.

---

## RULE JT-02 — JS files must not import from TS files directly

JavaScript files cannot consume TypeScript type information at runtime. A `.js` file must not import from a `.ts` file. If shared logic is needed, it must be in a `.js` file or compiled output.

---

## RULE JT-03 — No magic numbers or strings in either language

Literal values used for logic must be named constants in both JS and TS files.

```js
// Wrong
if (speed > 0.85) { ... }

// Right
const WARP_THRESHOLD = 0.85;
if (speed > WARP_THRESHOLD) { ... }
```

---

## RULE JT-04 — Functions do one thing

A function must have a single, clearly named responsibility. This applies in both JS and TS files.

---

## RULE JT-05 — No console.log in committed code

`console.log`, `console.warn`, and `console.error` must not appear in committed code in either JS or TS files.

---

## RULE JT-06 — Event listeners must be cleaned up

Any event listener added programmatically must have a corresponding removal path. This applies in both JS and TS files.

```js
// Wrong
window.addEventListener('resize', handleResize);

// Right
window.addEventListener('resize', handleResize);
// on cleanup:
window.removeEventListener('resize', handleResize);
```

---

## RULE JT-07 — No global mutable state

Variables must not be declared at module scope and mutated from multiple places. Shared state must go through a single designated module or class in both JS and TS files.

---

## RULE JT-08 — Async functions must handle errors

Every `async` function or `Promise` chain must have explicit error handling in both JS and TS files.

```js
// Wrong
async function load() {
  const data = await fetchData();
}

// Right
async function load() {
  try {
    const data = await fetchData();
  } catch (err) {
    handleError(err);
  }
}
```

---

## RULE JT-09 — Imports are grouped and ordered

Imports must appear in this order, separated by a blank line:
1. External packages (npm)
2. Internal absolute paths
3. Relative paths

---

## RULE JT-10 — No commented-out code

Commented-out code must not be committed in either JS or TS files.

---

## TS-Only Rules (apply to `.ts` files only)

---

## RULE JT-TS-01 — No implicit any

Every variable, parameter, and return value in a `.ts` file must have an explicit type. Use `unknown` and narrow it rather than falling back to `any`.

```ts
// Wrong
function init(config) { ... }

// Right
function init(config: AppConfig): void { ... }
```

---

## RULE JT-TS-02 — Prefer interface over type for object shapes

Use `interface` for object shapes. Use `type` for unions, intersections, and primitive aliases.

```ts
// Wrong
type CardProps = { title: string; size: string; };

// Right
interface CardProps { title: string; size: string; }
type Size = 'sm' | 'md' | 'lg';
```

---

## RULE JT-TS-03 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }

// Right
enum Direction { LEFT = 'LEFT', RIGHT = 'RIGHT' }
```

---

## RULE JT-TS-04 — No duplicate type definitions

A type used in more than one file must be defined once in a type file and imported everywhere it is needed.

---

## RULE JT-TS-05 — Type assertion requires a comment explaining why

Using `as` to assert a type must be accompanied by a short inline comment explaining why the assertion is safe. If you cannot justify it, the type is wrong.

```ts
// Wrong
const canvas = document.querySelector('#canvas') as HTMLCanvasElement;

// Right
const canvas = document.querySelector('#canvas') as HTMLCanvasElement; // guaranteed present by layout template
```

---

## RULE JT-11 — State attributes are updated by value, never added or removed

When controlling element state via data attributes, only update the attribute's value. Never add or remove the attribute itself. Never add or remove classes or IDs to reflect state.

```js
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
