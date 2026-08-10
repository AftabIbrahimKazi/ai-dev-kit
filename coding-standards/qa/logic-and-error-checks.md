# QA — Logic and Error Checks

Read [index.md](index.md) first.

---

## RULE QA-LOGIC-01 — All code paths must be traced

For every function and method Claude writes or modifies, all code paths must
be traced:

- The happy path — correct input, expected output
- The error path — what happens when input is missing, null, wrong type, or
  out of range
- The edge path — empty arrays, zero values, maximum values, simultaneous
  state changes

Any path that leads to an unhandled state must be fixed.

---

## RULE QA-LOGIC-02 — All async operations have error handling

Every `async` function, `Promise`, `fetch`, or dynamic import must have
explicit error handling. Silent failures are not acceptable.

---

## RULE QA-LOGIC-03 — All DOM queries are null-checked

Every `document.querySelector` and `getElementById` result must be checked
for null before use. Assuming an element exists is not acceptable.

```js
// Wrong
const el = document.querySelector('#ex-modal-js');
el.dataset.state = 'open';

// Right
const el = document.querySelector('#ex-modal-js');
if (!el) return;
el.dataset.state = 'open';
```

---

## RULE QA-LOGIC-04 — State transitions are complete and non-destructive

For every data attribute that controls state, all possible values must be
defined in CSS and all transitions between them must be accounted for. No
transition may leave the element in an undefined visual state.
