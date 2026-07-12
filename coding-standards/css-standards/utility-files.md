# CSS Standards — Utility Files

**Role:** A utility file contains atomic, single-purpose helper classes. Each class does exactly one thing. Utilities are composable and applied directly in markup.

Read [css-standards.md](../css-standards.md) first for global rules. Rules below are specific to utility files only.

---

## RULE U-01 — One property per utility class

A utility class must set exactly one CSS property (or one logically inseparable group, e.g. `display: flex` + `align-items: center` for a flex-center helper). If a class sets more than one unrelated property, it is a component, not a utility.

```css
/* Wrong — too many responsibilities */
.text-accent { color: var(--color-accent); font-weight: var(--font-weight-bold); letter-spacing: var(--tracking-lg); }

/* Right */
.text-accent  { color: var(--color-accent); }
.font-bold    { font-weight: var(--font-weight-bold); }
.tracking-lg  { letter-spacing: var(--tracking-lg); }
```

---

## RULE U-02 — Utility classes must not use descendant selectors

Utilities target the element they are applied to. No child, sibling, or descendant selectors.

```css
/* Wrong */
.mt-md > * { margin-top: var(--space-md); }

/* Right */
.mt-md { margin-top: var(--space-md); }
```

---

## RULE U-03 — Utility values come from token variables

A utility class must reference a token variable, not a hardcoded value.

```css
/* Wrong */
.p-4 { padding: 16px; }

/* Right */
.p-md { padding: var(--space-md); }
```

---

## RULE U-04 — Utility class names reflect the token scale

Utility class names must match the token scale step they apply (`xs`, `sm`, `md`, `lg`, etc.) so the name and value are predictable without reading the CSS.
