# CSS Standards — Layout Files

**Role:** A layout file controls page-level or structural layout. It defines the shell, grid, scroll behaviour, and spatial relationships between major page sections. It does not style content inside those sections.

Read [css-standards.md](../css-standards.md) first for global rules. Rules below are specific to layout files only.

---

## RULE L-01 — Layout files control structure, not appearance

A layout file may set: `display`, `grid`, `flex`, `position`, `width`, `height`, `overflow`, `scroll-snap`, `z-index`, and spacing between sections. It must not set colours, typography, or decorative styles on content elements. Those belong in component or overlay files.

---

## RULE L-02 — Spacing between sections uses token variables

Gaps, margins, and padding between layout sections must use `var(--space-*)` tokens. One-off structural values (e.g. a fixed sidebar width) are permitted as hardcoded values per RULE 07 in `css-standards.md`.

```css
/* Wrong */
.page-sections { gap: 64px; }

/* Right */
.page-sections { gap: var(--space-xxxl); }
```

---

## RULE L-03 — No component styles in layout files

A layout file must not reach inside a component and style it. When a component needs to change based on its context, use one of two patterns depending on scope:

**Option A — Chained class with a connected hierarchy (preferred for multiple child elements)**
Chain a new class directly onto the existing component class — do not discard the original. This tells the developer this is an override of the existing component, not a replacement. The base component rules still apply and the new class only adds or overrides what differs.

```css
/* Wrong — layout file reaching into a component */
.page-shell .card h2 { font-size: 24px; }
.page-shell .card p { color: red; }

/* Wrong — new class replaces card, base rules lost */
.card-hero .card__title { font-size: var(--font-size-lg); }

/* Right — chained onto the existing class, base rules preserved */
.card.card-hero .card__title { font-size: var(--font-size-lg); }
.card.card-hero .card__body { color: var(--color-text-muted); }
```

```html
<!-- The element carries both classes -->
<div class="card card-hero">...</div>
```

**Option B — Chained class on the specific element (for isolated single-element changes only)**
Chain a new class onto the element that needs to change, same as Option A but applied at the element level rather than the parent. Use this only when a small, isolated aspect of a single element differs. Do not use this when multiple child elements change — use Option A instead.

```css
/* Wrong — new class alone, base rules lost */
.card__title--large { font-size: var(--font-size-lg); }

/* Right — chained onto the existing element class */
.card__title.card__title--large { font-size: var(--font-size-lg); }
```

```html
<!-- Both classes on the same element -->
<h2 class="card__title card__title--large">...</h2>
```

**Option C — Universal selectors and nth-child for repeating series patterns**
When elements appear in a series with a mostly shared UI but periodically different aspects at predictable intervals, use universal selectors and `nth-child` to target those positions. This avoids creating classes for every case and keeps the CSS compact.

```css
/* Wrong — a class for every periodic case */
.card--featured { background: var(--color-accent-bg); }

/* Right — nth-child targets the pattern directly */
.card-list .card:nth-child(3n) { background: var(--color-accent-bg); }
.card-list .card:nth-child(3n) .card__title { color: var(--color-accent-hi); }

/* Right — first and last edge cases */
.card-list .card:first-child { border-top: none; }
.card-list .card:last-child { border-bottom: none; }
```

Use Option C when the variation follows a predictable positional pattern. If the variation is content-driven or arbitrary, use Option A or B instead.

---

## RULE L-04 — Fixed/sticky elements must be documented with z-index reason

Any element using `position: fixed` or `position: sticky` must have a comment on the same rule block explaining its stacking purpose.

```css
/* Wrong */
.site-header { position: fixed; z-index: 100; }

/* Right */
.site-header { position: fixed; z-index: 100; } /* above canvas, below modals */
```
