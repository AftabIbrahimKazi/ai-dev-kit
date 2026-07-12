# Performance Standards

These rules apply to every page, component, asset, and script across all projects. Performance is a feature — it is designed in, not optimised after the fact.

---

## Assets

---

## RULE PERF-01 — Images are served in modern formats

All raster images must be served in WebP or AVIF format. JPEG and PNG are only permitted as fallbacks for browsers that do not support modern formats.

```html
<!-- Right — modern format with fallback -->
<picture>
  <source srcset="image.avif" type="image/avif">
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="Description">
</picture>
```

---

## RULE PERF-02 — Images have explicit width and height attributes

Every `<img>` must declare `width` and `height` attributes matching the image's intrinsic dimensions. This allows the browser to reserve space before the image loads and prevents layout shift (CLS).

```html
<!-- Wrong -->
<img src="planet.webp" alt="Jupiter">

<!-- Right -->
<img src="planet.webp" alt="Jupiter" width="800" height="600">
```

---

## RULE PERF-03 — Images below the fold are lazy loaded

All images that are not visible on initial page load must use `loading="lazy"`. Above-the-fold images must use `loading="eager"` or omit the attribute.

```html
<img src="planet.webp" alt="Jupiter" width="800" height="600" loading="lazy">
```

---

## RULE PERF-04 — The largest contentful paint image is preloaded

The image that is the Largest Contentful Paint (LCP) element must be preloaded in the `<head>`.

```html
<link rel="preload" as="image" href="hero.webp">
```

---

## RULE PERF-05 — Fonts are preloaded and self-hosted

Web fonts must be self-hosted — no third-party font CDNs. Font files must be preloaded in the `<head>` and use `font-display: swap` to prevent invisible text during load.

```html
<link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin>
```

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter.woff2') format('woff2');
  font-display: swap;
}
```

---

## Scripts

---

## RULE PERF-06 — Scripts do not block rendering

No `<script>` tag may block the main thread during page parse. Scripts must use `defer` or `async`, or be loaded through a build tool that handles this automatically.

```html
<!-- Wrong -->
<script src="main.js"></script>

<!-- Right -->
<script src="main.js" defer></script>
```

---

## RULE PERF-07 — No unused JavaScript is shipped

Every JavaScript file included in the bundle must be used on the page it is loaded on. Tree shaking must be enabled. Dead code, unused imports, and unreferenced modules must be removed before shipping.

---

## RULE PERF-08 — Third-party scripts are loaded asynchronously

Any third-party script (analytics, chat widgets, embeds) must be loaded with `async` and must not block the critical rendering path. Non-essential third-party scripts must be deferred until after the page is interactive.

---

## CSS

---

## RULE PERF-09 — No unused CSS is shipped

CSS that does not apply to any element on the page must not be included in the shipped stylesheet. Purge unused CSS as part of the build process.

---

## RULE PERF-10 — Critical CSS is inlined

CSS required to render above-the-fold content must be inlined in the `<head>` to eliminate render-blocking stylesheet requests. Non-critical CSS is loaded asynchronously.

---

## RULE PERF-11 — Animations use transform and opacity only

CSS animations and transitions must only animate `transform` and `opacity`. Animating layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`) triggers reflow and destroys performance.

```css
/* Wrong — triggers reflow */
.card { transition: height 0.3s ease; }

/* Right — compositor only */
.card { transition: transform var(--duration-fast) ease,
                    opacity  var(--duration-fast) ease; }
```

---

## RULE PERF-12 — will-change is used sparingly and intentionally

`will-change` must only be applied to elements that are actively animating and only for the properties being animated. It must be removed after the animation completes. Applying it globally is prohibited.

```css
/* Wrong — applied globally */
* { will-change: transform; }

/* Right — scoped and intentional */
.warp-canvas { will-change: opacity; }
```

---

## General

---

## RULE PERF-13 — No layout thrashing in JavaScript

JavaScript must not read and write layout properties (e.g. `offsetWidth`, `getBoundingClientRect`, `scrollTop`) in alternating sequence inside a loop or animation frame. Batch all reads first, then all writes.

```js
// Wrong — read/write alternating causes reflow per iteration
elements.forEach(el => {
  const height = el.offsetHeight; // read
  el.style.height = height + 'px'; // write
});

// Right — batch reads then writes
const heights = elements.map(el => el.offsetHeight); // all reads
elements.forEach((el, i) => { el.style.height = heights[i] + 'px'; }); // all writes
```

---

## RULE PERF-14 — Event listeners on scroll and resize are debounced or throttled

Event handlers attached to `scroll`, `resize`, `mousemove`, or `pointermove` must be debounced or throttled. Raw high-frequency events must never trigger expensive DOM operations or layout recalculations directly.

---

## RULE PERF-15 — Core Web Vitals are the performance benchmark

All pages must target the following Core Web Vitals thresholds before shipping:

| Metric | Target |
|---|---|
| LCP (Largest Contentful Paint) | under 2.5s |
| CLS (Cumulative Layout Shift) | under 0.1 |
| INP (Interaction to Next Paint) | under 200ms |
