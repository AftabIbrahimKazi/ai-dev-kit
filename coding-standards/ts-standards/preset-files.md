# TS Standards — Preset Files

**Role:** A preset is a self-contained, parameterised class or function built for a specific use case that repeats across the project. It accepts typed inputs (IDs, config objects, data attributes) and applies the same behaviour to different targets. Define once, initialise many times.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to preset files only.

---

## RULE TS-P-01 — Presets are defined once and initialised many times

A preset must never be duplicated. If the same pattern appears more than once, it must be extracted into a preset and called with different typed parameters each time.

```ts
// Wrong — same logic duplicated
function initCarouselA(): void { /* 30 lines */ }
function initCarouselB(): void { /* same 30 lines */ }

// Right — one preset, different typed inputs
function initCarousel(id: string, config: CarouselConfig): void { ... }

initCarousel('carousel-a', { loop: true,  slides: 3 });
initCarousel('carousel-b', { loop: false, slides: 1 });
```

---

## RULE TS-P-02 — Presets accept all variable aspects as typed parameters

Every aspect that differs between uses must be a typed input parameter. No hardcoded IDs, selectors, data attributes, or values inside the preset body.

```ts
// Wrong — hardcoded target
function initToggle(): void {
  const el = document.querySelector('#nav-menu')!;
  el.dataset.state = 'closed';
}

// Right — typed parameters
function initToggle(id: string, attribute: string, defaultValue: string): void {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  (el as HTMLElement).dataset[attribute] = defaultValue;
}
```

---

## RULE TS-P-03 — Presets have a single, clearly named purpose

A preset does one thing. Its name must describe that thing precisely. If a preset needs to do two things, split it.

---

## RULE TS-P-04 — Config objects are typed interfaces when parameters exceed three

When a preset requires more than three input values, define a named interface for the config and use it as the parameter type.

```ts
// Wrong — too many positional parameters
initSlider('hero', true, false, 3, 'fade', 400);

// Right — typed config interface
interface SliderConfig {
  loop:     boolean;
  autoplay: boolean;
  slides:   number;
  effect:   'fade' | 'slide';
  duration: number;
}

initSlider('hero', { loop: true, autoplay: false, slides: 3, effect: 'fade', duration: 400 });
```

---

## RULE TS-P-05 — Presets of the same category share a typed interface

All presets of the same kind must implement a shared interface. This makes them interchangeable and enforces a consistent contract.

```ts
interface Animation {
  update(delta: number): void;
}

class PlayerAnimation implements Animation { update(delta: number): void { ... } }
class EnemyAnimation  implements Animation { update(delta: number): void { ... } }
class BossAnimation   implements Animation { update(delta: number): void { ... } }
```

---

## RULE TS-P-06 — Presets must not depend on each other

A preset must be fully self-contained. It must not import from or call another preset. Shared logic must be extracted to a utility file.

---

## RULE TS-P-07 — Config objects are exported as typed constants

When a preset is configured with data that varies per instance, each configuration must be exported as a typed constant from a dedicated config file. This keeps configuration separate from implementation.

```ts
// configs/carousel.config.ts
export const HERO_CAROUSEL: CarouselConfig   = { loop: true,  slides: 3 };
export const FOOTER_CAROUSEL: CarouselConfig = { loop: false, slides: 1 };
```
