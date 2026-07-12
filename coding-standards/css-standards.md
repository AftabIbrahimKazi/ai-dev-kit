# CSS Standards — Global Rules

These rules apply to **every CSS file in the project** without exception.
Read this file before reading any CSS file-type partial.

For file-type specific rules see: [css-standards/](css-standards/)

---

## RULE 01 — Single source of truth for tokens

All reusable values (colours, spacing, font sizes, durations, etc.) must be defined in one dedicated token file per project. No value that is used in more than one place may be hardcoded in a component or layout file.

```css
/* Wrong */
.card { padding: 16px; color: #a78bfa; }

/* Right */
.card { padding: var(--space-md); color: var(--color-accent); }
```

---

## RULE 02 — Variables store values only

A CSS custom property must store a single value. It must never store a full declaration, shorthand, or function call.

```css
/* Wrong */
--transition-color: color 1.2s ease;
--gradient-hero: linear-gradient(to bottom, #000, #1a1a2e);

/* Right */
--duration-slow: 1.2s;
--color-hero-start: #000;
--color-hero-end: #1a1a2e;
```

---

## RULE 03 — Gradients are written in CSS rules, not variables

`linear-gradient()`, `radial-gradient()`, and `conic-gradient()` are written at the point of use. Variables supply only the colour-stop values.

```css
/* Wrong */
--bg-hero: linear-gradient(to bottom, var(--color-start), var(--color-end));
.hero { background: var(--bg-hero); }

/* Right */
.hero { background: linear-gradient(to bottom, var(--color-start), var(--color-end)); }
```

---

## RULE 04 — Font weights are numeric only

Font weight values must always be numeric. Keyword values are not permitted.

```css
/* Wrong */
font-weight: bold;
font-weight: normal;
font-weight: semi-bold;

/* Right */
font-weight: 400;
font-weight: 600;
font-weight: 700;
```

---

## RULE 05 — Line-height only at body level and heading tokens

`line-height` is set in exactly two places: once on the root body class in the global stylesheet, and on heading-role rules via the dedicated leading tokens. No other rule in any CSS file may set `line-height`, and no line-height value may be hardcoded outside the token file.

Permitted leading tokens (defined in the token file, unitless values only):

```css
--leading-body:  1.6;   /* body text — used once, on the body class */
--leading-tight: 1.2;   /* headings / display type */
```

```css
/* Wrong — hardcoded, or on a non-heading rule */
.heading { line-height: 1.2; }
.card p  { line-height: 24px; }

/* Right — body once, headings via token */
.body { line-height: var(--leading-body); }
.ex-hero-title { line-height: var(--leading-tight); }
```

Rationale: display-size headings at body leading (1.6) render visibly loose; a single tight token keeps heading leading consistent without opening line-height up everywhere.

---

## RULE 06 — Transitions use property name in CSS, duration from a variable

The transition property name is written explicitly in the CSS rule. The duration value comes from a token variable. Easing is written in CSS.

```css
/* Wrong */
transition: var(--transition-color);
transition: all 0.3s;

/* Right */
transition: color var(--duration-fast) ease;
transition: opacity var(--duration-slow) ease-in-out;
```

---

## RULE 07 — Permitted hardcoded values

The following hardcoded values are acceptable and do not require a variable:

- `0` (zero — no unit needed)
- Viewport units: `100dvh`, `100vw`, `50%`
- Border widths that are structural and non-repeating (e.g. `1px`, `2px`)
- `blur()` filter values
- `calc()` expressions using viewport units

All other numeric values must use a token variable.

**`width`, `height`, `min-width`, `min-height`, `max-width`, and `max-height` are never hardcoded — without exception.** All fixed size values for these properties must use a token from the fixed size scale (`--ex-size-xxxs` → `--ex-size-xxxl`). There is no "one-off" exception for size properties. If no scale step fits, add one to the token file.

```css
/* Wrong */
.ex-badge { width: 160px; }
.ex-modal { max-width: 480px; }

/* Right */
.ex-badge { width: var(--ex-size-default); }
.ex-modal { max-width: var(--ex-size-xxl); }
```

---

## RULE 08 — No inline styles

Styles must never be applied via a `style` attribute in markup. All styles belong in CSS files or scoped style blocks.

```html
<!-- Wrong -->
<div style="padding: 16px; color: red;">

<!-- Right -->
<div class="card">
```

---

## RULE 09 — Scale naming convention

All token scales must follow this naming convention in order from smallest to largest:

`xxxs` `xxs` `xs` `sm` `default` `md` `lg` `xl` `xxl` `xxxl`

Every scale must have a `default` step that maps to the base/body value for that scale.

---

## RULE 10 — Colors always from tokens

No colour value (`hex`, `rgb()`, `rgba()`, `hsl()`, `oklch()`) may be hardcoded in a component, layout, or overlay file. All colours must reference a token variable.

```css
/* Wrong */
.pill { background: rgba(167, 139, 250, 0.15); }

/* Right */
.pill { background: var(--color-accent-pill-bg); }
```

---

## RULE 11 — Selector naming convention

All classes, IDs, and data attributes follow this structure:

```
[signature]-[semantic-name]
[signature]-[semantic-name]-[suffix]
```

| Part | Description |
|---|---|
| `signature` | Short unique identifier (min 2 chars). Differentiates custom classes from framework or package classes. Stays consistent across the entire project. |
| `semantic-name` | Short, clear name describing what the element is or does. Single word preferred. Multiple words joined by `-`. |
| `suffix` | Optional. Added only when the class, ID, or data attribute is used or manipulated by JS, TS, or both. |

**Suffix rules:**

| Suffix | Meaning |
|---|---|
| `-js` | Used or manipulated by JavaScript |
| `-ts` | Used or manipulated by TypeScript |
| `-js-ts` | Used or manipulated by both |
| *(none)* | Pure UI — safe to restyle freely |

The suffix always goes at the end regardless of how many words are in the semantic name.

```css
/* Wrong — no signature, no suffix where needed */
.card-wrapper {}
.hide {}

/* Right — pure UI */
.ex-card-wrapper {}
.ex-text-muted {}

/* Right — JS/TS touched */
.ex-hide-js {}
.ex-display-text-js-ts {}
```

IDs follow the exact same convention. The `#` symbol already distinguishes them from classes — no additional marker is needed.

```css
#ex-modal-js {}
#ex-sidebar-ts {}
```

---

## RULE 12 — Properties are ordered alphabetically

All CSS properties inside a rule block must be ordered alphabetically. No exceptions.

```css
/* Wrong */
.ex-card {
  padding: var(--space-md);
  background: var(--color-surface);
  display: flex;
  font-size: var(--font-size-md);
}

/* Right */
.ex-card {
  background: var(--color-surface);
  display: flex;
  font-size: var(--font-size-md);
  padding: var(--space-md);
}
```

---

## RULE 13 — Shorthand always, no longhand properties

Always use shorthand properties. Longhand variants are not permitted.

```css
/* Wrong */
padding-top: var(--space-sm);
margin-left: auto;
border-top-color: var(--color-border);

/* Right */
padding: var(--space-sm) 0 0 0;
margin: 0 auto;
border-color: var(--color-border) transparent transparent transparent;
```

If a shorthand would override an unintended side, redeclare the correct shorthand values explicitly. Do not use longhand as a workaround.

**Carve-out — media-query overrides only.** Inside a media query, when overriding a single side/aspect of a value the base rule already sets, longhand is permitted. Re-stating all four sides in an override pins stale copies of the other three values — if the base rule later changes, the override silently reverts them at that breakpoint.

```css
/* Base rule — shorthand as always */
.ex-card { padding: var(--space-md) var(--space-lg); }

/* Wrong — override re-states sides it doesn't change */
@media (max-width: 575.98px) {
  .ex-card { padding: var(--space-sm) var(--space-lg); }  /* pins --space-lg */
}

/* Right — override touches only what changes */
@media (max-width: 575.98px) {
  .ex-card { padding-top: var(--space-sm); padding-bottom: var(--space-sm); }
}
```

This carve-out applies only inside media queries and only when a base rule owns the shorthand. Top-half rules remain shorthand-only.

---

## RULE 14 — No !important

`!important` is banned everywhere in the project. No exceptions. If a specificity conflict requires `!important` to resolve it, the selector structure must be fixed instead.

---

## RULE 15 — No purposeless properties

Every CSS property must serve a clear and active purpose. Never add properties speculatively, as defaults with no visible effect, or as leftovers from previous iterations.

---

## RULE 16 — Content images use img tag only, never background-image

Content images must always be displayed via an `<img>` tag. CSS `background-image` must never be used for content images. Background images are only permitted for purely decorative, non-content patterns or textures that carry no semantic meaning.

```css
/* Wrong — content image as background */
.hero { background-image: url('hero.jpg'); }

/* Right — content image in markup */
/* <img src="hero.jpg" alt="Description"> */
```

---

## RULE 17 — Media queries are range-based only

Only range-based media queries are used. No mobile-first (`min-width` only) queries. Every breakpoint is an isolated zone — changes in one range do not bleed into another.

```css
/* Wrong — mobile-first, bleeds into larger sizes */
@media (min-width: 768px) { .ex-card { padding: var(--space-lg); } }

/* Right — isolated range */
@media (min-width: 768px) and (max-width: 991.98px) { .ex-card { padding: var(--space-lg); } }
```

Standard breakpoints:

```css
/* Extra Small — Portrait phones */
@media (max-width: 575.98px) {}

/* Small — Landscape phones */
@media (min-width: 576px) and (max-width: 767.98px) {}

/* Medium — Tablets */
@media (min-width: 768px) and (max-width: 991.98px) {}

/* Large — Desktops */
@media (min-width: 992px) and (max-width: 1199.98px) {}

/* Extra Large — Large desktops */
@media (min-width: 1200px) and (max-width: 1399.98px) {}

/* XX-Large — Larger desktops */
@media (min-width: 1400px) {}
```

---

## RULE 18 — CSS frameworks are used first, custom CSS is the last resort

If a CSS framework is in use on the project, its utilities and components must be exhausted before any custom CSS is written. Custom CSS is only written when the framework genuinely cannot produce the required UI.

**Order of precedence:**
1. Use the framework class directly
2. Combine framework classes to achieve the result
3. Extend a framework class using the project's chaining pattern
4. Only then write custom CSS

```html
<!-- Wrong — custom CSS written when framework class exists -->
<div class="ex-flex-center">...</div>

<!-- Right — framework class used first -->
<div class="d-flex align-items-center">...</div>
```

---

## RULE 19 — Framework classes that violate coding standards must be avoided

Framework classes that internally use `!important`, inline styles, or any other pattern prohibited by these standards must not be used. Where the framework provides a workaround or alternative class, that must be used instead.

```html
<!-- Wrong — Bootstrap's .text-truncate uses inline overflow: hidden -->
<p class="text-truncate">...</p>

<!-- Right — write a compliant custom class that achieves the same result -->
<p class="ex-text-truncate">...</p>
```

```css
/* ex-text-truncate in component CSS — no !important, no inline style */
.ex-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## RULE 20 — Third-party package style violations must be flagged, not silently accepted

Some third-party packages (e.g. Select2, Flatpickr, Swiper) inject their own styles that may violate these standards — including `!important`, inline styles, or hardcoded values. These cannot always be avoided.

**The AI must flag every violation at the point of integration.** The developer decides whether to:
- Accept the violation as an unavoidable package exception
- Find a workaround
- Replace the package

Accepted exceptions must be documented with a comment at the point of use stating the package name, the violation, and that it was a deliberate developer decision.

```css
/* PACKAGE EXCEPTION — Select2 v4
   Violation: injects inline styles for dropdown width
   Decision: accepted — no workaround available
   Reviewed by: [developer] */
.select2-container { ... }
```

The standards are never silently diluted. Every exception is visible.

---

## RULE 21 — JS/TS state-driven CSS must live in a named CSS file

Any CSS rule activated or controlled by a JavaScript or TypeScript state change must be written in a named CSS file (e.g. `main.css`, a component CSS file). It must never be written inside a `<style>` or `<style is:global>` block in a component file, and it must never be applied as an inline `style` attribute.

This rule applies without exception to any rule that targets a `data-*` attribute value that a script updates, or any selector that reflects a JS/TS-driven state.

The correct pattern has three parts — each in its own layer:

1. **Markup** — declares the element with its initial `data-*` state attribute present and set to a default value
2. **CSS file** — contains every visual rule for every possible state, targeting the `data-*` attribute
3. **Script** — updates only the `data-*` attribute value, never touches `style`

```html
<!-- Wrong — inline style applied by JS -->
<div id="ex-warp-veil"></div>
<script>veil.style.opacity = '1'; veil.style.transition = 'opacity 0.35s ease-in';</script>

<!-- Wrong — state CSS written in a component style block -->
<style is:global>
  #ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity 0.35s ease-in; }
</style>

<!-- Right — markup declares the initial state -->
<div id="ex-warp-veil" data-veil-state="hidden"></div>
```

```css
/* Right — state CSS in a named CSS file */
#ex-warp-veil[data-veil-state="hidden"]    { opacity: 0; }
#ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity var(--ex-duration-veil-in) ease-in; }
```

```ts
/* Right — script updates only the attribute value */
veil.dataset.veilState = 'fading-in';
```

See the active script standard for the matching JS/TS rule on dataset-only state updates.

---

## RULE 22 — File layout — rules on top, media queries on bottom

Every CSS file that contains both rules and media queries is split into two clearly marked halves. The top half contains all rules and variable definitions. The bottom half contains all media queries for that file. No media queries appear in the top half.

```css
/* ================================
   TOP HALF — Rules
   ================================ */

.ex-card { ... }
.ex-card-header { ... }

/* ================================
   BOTTOM HALF — Media Queries
   ================================ */

@media (max-width: 575.98px) {
  .ex-card { ... }
}
```

---

## RULE 23 — Modern CSS feature stance

Explicit positions on newer CSS features, so no rule has to be invented mid-task:

| Feature | Stance |
|---|---|
| Native CSS nesting (`&`) | **Banned.** Selectors are written flat. Nesting hides specificity and breaks the grep-ability of selectors. |
| `@layer` | **Permitted** for framework/custom layering (it is how compliant frameworks avoid `!important`). Custom project CSS defines at most one named layer scheme per project, declared in the global stylesheet. |
| Container queries | **Permitted**, same isolation discipline as RULE 17: range-based conditions, placed in the bottom half of the file alongside media queries. |
| `:has()` | **Permitted sparingly** — only when the state cannot be expressed with a `data-*` attribute per RULE 21. If a script is already involved, set a `data-*` state instead. |
| `oklch()` / modern color functions | **Permitted inside the token file only** — component files still consume tokens per RULE 10. |
| `@scope`, `@property` | **Flag before use** (RULE AI-12 applies) — not yet covered until a real need defines the rule. |

Any feature not listed here falls under RULE AI-12: flag it, don't improvise a stance.
