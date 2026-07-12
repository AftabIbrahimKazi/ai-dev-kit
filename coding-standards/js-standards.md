# JS Standards — JavaScript Only Projects

These rules apply when a project uses **JavaScript exclusively**. No TypeScript files exist in the project.

This file is **standalone and self-contained**. Do not read `ts-standards.md` or `js-and-ts-standards.md` alongside this file.

For file-type specific rules see: [js-standards/](js-standards/)

---

## RULE JS-01 — No magic numbers or strings

Literal values used for logic must be named constants. The name must describe what the value represents.

```js
// Wrong
if (speed > 0.85) { ... }

// Right
const WARP_THRESHOLD = 0.85;
if (speed > WARP_THRESHOLD) { ... }
```

---

## RULE JS-02 — Functions do one thing

A function must have a single, clearly named responsibility. If a function needs a comment to explain what it does, split it into smaller named functions.

---

## RULE JS-03 — No console.log in committed code

`console.log`, `console.warn`, and `console.error` must not appear in committed code.

---

## RULE JS-04 — Event listeners must be cleaned up

Any event listener added programmatically must have a corresponding removal path on destroy, navigation, or unmount.

```js
// Wrong
window.addEventListener('resize', handleResize);

// Right
window.addEventListener('resize', handleResize);
// on cleanup:
window.removeEventListener('resize', handleResize);
```

---

## RULE JS-05 — No global mutable state

Variables must not be declared at module scope and mutated from multiple places. Shared state must go through a single designated module or class.

---

## RULE JS-06 — Async functions must handle errors

Every `async` function or `Promise` chain must have explicit error handling.

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

## RULE JS-07 — Imports are grouped and ordered

Imports must appear in this order, separated by a blank line:
1. External packages (npm)
2. Internal absolute paths
3. Relative paths

---

## RULE JS-08 — No commented-out code

Commented-out code must not be committed. Use git history for reference.

---

## RULE JS-09 — Use const by default, let only when reassignment is needed

`var` is not permitted. Use `const` for all declarations. Use `let` only when the value must be reassigned.

```js
// Wrong
var count = 0;
let name = 'Sol';

// Right
const name = 'Sol';
let count = 0; // reassigned in loop
```

---

## RULE JS-10 — Use strict equality

Always use `===` and `!==`. Never use `==` or `!=`.

---

## RULE JS-11 — State attributes are updated by value, never added or removed

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
