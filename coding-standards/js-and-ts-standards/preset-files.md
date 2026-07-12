# JS + TS Standards — Preset Files

**Role:** A preset is a self-contained, parameterised class or function built for a specific use case that repeats across the project. It accepts inputs (IDs, config objects, data attributes) and applies the same behaviour to different targets. Define once, initialise many times.

Read [js-and-ts-standards.md](../js-and-ts-standards.md) first for global rules. Rules below are specific to preset files only.

---

## RULE JT-P-01 — Presets are defined once and initialised many times

A preset must never be duplicated. If the same pattern appears more than once it must be extracted into a preset and called with different parameters each time.

```js
// Wrong — same logic duplicated
function initCarouselA() { /* 30 lines */ }
function initCarouselB() { /* same 30 lines */ }

// Right — one preset, different inputs
function initCarousel(id, config) { ... }

initCarousel('carousel-a', { loop: true,  slides: 3 });
initCarousel('carousel-b', { loop: false, slides: 1 });
```

---

## RULE JT-P-02 — Presets accept all variable aspects as parameters

Every aspect that differs between uses must be an input parameter. No hardcoded IDs, selectors, data attributes, or values inside the preset body. In `.ts` files all parameters must be explicitly typed.

```js
// Wrong — hardcoded target
function initToggle() {
  const el = document.querySelector('#nav-menu');
  el.dataset.state = 'closed';
}

// Right — parameterised
function initToggle(id, attribute, defaultValue) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.dataset[attribute] = defaultValue;
}
```

---

## RULE JT-P-03 — Presets have a single, clearly named purpose

A preset does one thing. Its name must describe that thing precisely. If a preset needs to do two things, split it.

---

## RULE JT-P-04 — Config objects are used when parameters exceed three

When a preset requires more than three input values, group them into a named config object. In `.ts` files the config must be a typed interface.

```js
// JS — config object
initSlider('hero', { loop: true, autoplay: false, slides: 3 });
```

```ts
// TS — typed config interface
interface SliderConfig { loop: boolean; autoplay: boolean; slides: number; }
initSlider('hero', { loop: true, autoplay: false, slides: 3 });
```

---

## RULE JT-P-05 — Presets of the same category share a consistent interface

All presets of the same kind must share the same function signature or class interface. In `.ts` files this interface must be explicitly declared and implemented.

```ts
interface Animation { update(delta: number): void; }

class PlayerAnimation implements Animation { update(delta: number): void { ... } }
class EnemyAnimation  implements Animation { update(delta: number): void { ... } }
```

---

## RULE JT-P-06 — Presets must not depend on each other

A preset must be fully self-contained. It must not import from or call another preset. Shared logic must be extracted to a utility file.

---

## RULE JT-P-07 — Config objects are exported as named constants from a dedicated config file

When a preset is used with varying configurations, each configuration is exported as a named constant from a dedicated config file. This keeps configuration separate from implementation.

```js
// JS
export const HERO_CAROUSEL   = { loop: true,  slides: 3 };
export const FOOTER_CAROUSEL = { loop: false, slides: 1 };
```

```ts
// TS — typed
export const HERO_CAROUSEL:   CarouselConfig = { loop: true,  slides: 3 };
export const FOOTER_CAROUSEL: CarouselConfig = { loop: false, slides: 1 };
```

---

## RULE JT-P-08 — Preset files must not mix JS and TS

A preset file must be entirely `.js` or entirely `.ts`. A `.js` preset must not import from `.ts` files.
