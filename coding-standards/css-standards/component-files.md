# CSS Standards — Component Files

**Role:** A component file contains styles scoped to a single reusable UI component. It controls the appearance, spacing, typography, and state of that component and nothing outside it.

Read [css-standards.md](../css-standards.md) first for global rules. Rules below are specific to component files only.

---

## RULE C-01 — Scope does not leak

A component file must not style elements outside the component's own root selector. No global tag selectors, no reaching into sibling or parent elements.

```css
/* Wrong */
h2 { font-size: var(--font-size-lg); }
.other-component { margin-top: var(--space-md); }

/* Right */
.card__title { font-size: var(--font-size-lg); }
.card { margin-top: var(--space-md); }
```

---

## RULE C-02 — All spacing from token variables

Every `padding`, `margin`, and `gap` value must use `var(--space-*)`. No hardcoded pixel spacing values except those permitted under RULE 07 of `css-standards.md`.

---

## RULE C-03 — All typography from token variables

Every `font-size`, `font-weight`, and `letter-spacing` must use a token variable.

```css
/* Wrong */
.card__title { font-size: 24px; font-weight: 700; letter-spacing: 0.12em; }

/* Right */
.card__title { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); letter-spacing: var(--tracking-md); }
```

---

## RULE C-04 — State variants use data attribute values only

All state changes (hover excluded) must be driven exclusively by data attribute values. Data attributes are the sole mechanism for UI state. No class toggling, no chained state classes, no inline style manipulation for state.

CSS listens to the data attribute value. JS only updates the value — it never adds, removes, or toggles classes or attributes.

```css
/* Wrong — JS inline style */
/* style="opacity: 0.5" */

/* Wrong — class toggling for state */
.card.card-disabled { opacity: var(--opacity-low); }

/* Wrong — standalone modifier class */
.card--disabled { opacity: var(--opacity-low); }

/* Right — data attribute value is the sole state mechanism */
.card[data-state="disabled"] { opacity: var(--opacity-low); pointer-events: none; }
.card[data-state="active"]   { border-color: var(--color-accent-border); }

/* Right — native browser pseudo-classes for interaction states */
.card:hover .card__cta { opacity: var(--opacity-high); }
.card:focus-visible { outline: 2px solid var(--color-accent); }
```

---

## RULE C-05 — No hardcoded colours

All colour values must reference a token. No `hex`, `rgb()`, `rgba()`, or `hsl()` values in component files. See RULE 10 in `css-standards.md`.

---

## RULE C-06 — Transitions follow the global pattern

```css
/* Wrong */
transition: all 0.3s;
transition: var(--transition-opacity);

/* Right */
transition: opacity var(--duration-fast) ease;
```
