# JS Standards — Preset Files

**Role:** A preset is a self-contained, parameterised class or function built for a specific use case that repeats across the project. It accepts inputs (IDs, config objects, data attributes) and applies the same behaviour to different targets. Define once, initialise many times.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to preset files only.

---

## RULE JS-P-01 — Presets are defined once and initialised many times

A preset must never be duplicated. If the same pattern appears more than once, it must be extracted into a preset and called with different parameters each time.

```js
// Wrong — same logic duplicated for each target
function initCarouselA() { /* 30 lines */ }
function initCarouselB() { /* same 30 lines, different selector */ }

// Right — one preset, different inputs
function initCarousel(id, config) { /* 30 lines, driven by parameters */ }

initCarousel('carousel-a', { loop: true,  slides: 3 });
initCarousel('carousel-b', { loop: false, slides: 1 });
```

---

## RULE JS-P-02 — Presets accept all variable aspects as parameters

Every aspect of the preset that differs between uses must be an input parameter. No hardcoded IDs, selectors, data attributes, or values inside the preset body.

```js
// Wrong — hardcoded target inside preset
function initToggle() {
  const el = document.querySelector('#nav-menu'); // hardcoded
  el.dataset.state = 'closed';
}

// Right — target passed as parameter
function initToggle(id, attribute, defaultValue) {
  const el = document.querySelector(`#${id}`);
  el.dataset[attribute] = defaultValue;
}
```

---

## RULE JS-P-03 — Presets have a single, clearly named purpose

A preset does one thing. Its name must describe that thing precisely. If a preset needs to do two things, split it into two presets.

---

## RULE JS-P-04 — Config objects are used when parameters exceed three

When a preset requires more than three input values, group them into a named config object. This keeps call sites readable and makes adding future options non-breaking.

```js
// Wrong — too many positional parameters
initSlider('hero', true, false, 3, 'fade', 400);

// Right — config object
initSlider('hero', {
  loop:     true,
  autoplay: false,
  slides:   3,
  effect:   'fade',
  duration: 400,
});
```

---

## RULE JS-P-05 — Presets follow a consistent interface within their category

All presets of the same kind must share the same function signature or class interface. This makes them interchangeable and predictable.

```js
// Right — all animation presets share the same update interface
class PlayerAnimation { update(delta) { ... } }
class EnemyAnimation  { update(delta) { ... } }
class BossAnimation   { update(delta) { ... } }
```

---

## RULE JS-P-06 — Presets must not depend on each other

A preset must be fully self-contained. It must not import from or call another preset. Shared logic must be extracted to a utility file.
