# CSS Standards — Token Files

**Role:** A token file is the single source of truth for all design tokens in a project. It defines CSS custom properties that all other CSS files consume. There is exactly one token file per project.

Read [css-standards.md](../css-standards.md) first for global rules. Rules below are specific to token files only.

---

## RULE T-01 — One token file per project

There must be exactly one token file. All custom properties are defined here and nowhere else. No other CSS file may declare a custom property.

---

## RULE T-02 — Token file defines values, never usage

The token file defines what a value is. It does not encode how it is used. Token names must describe the value, not the context it will appear in.

```css
/* Wrong — encodes usage/context */
--hero-background-color: #0a0a1a;
--button-padding: 12px;

/* Right — describes the value */
--color-surface-dark: #0a0a1a;
--space-sm: 12px;
```

---

## RULE T-03 — Tokens must be grouped by scale

Related tokens must be grouped together under a comment heading. Groups must appear in this order:

1. Typography (font size, font weight, letter spacing)
2. Spacing
3. Colour palette (raw colour values)
4. Semantic colour tokens (mapped from palette)
5. Opacity
6. Transition duration
7. Any additional project-specific scales

---

## RULE T-04 — Scale values must be ascending

Within any scale, values must increase from `xxxs` to `xxxl`. No step may have a value equal to or less than the step before it.

```css
/* Wrong */
--space-sm: 16px;
--space-md: 12px;

/* Right */
--space-sm: 12px;
--space-md: 16px;
```

---

## RULE T-05 — Semantic colour tokens must reference palette tokens

Semantic tokens (e.g. `--color-text-body`) must be defined by referencing a palette token, not a hardcoded value.

```css
/* Wrong */
--color-text-body: #e2e8f0;

/* Right */
--color-slate-200: #e2e8f0;
--color-text-body: var(--color-slate-200);
```

---

## RULE T-06 — No composite values

A token must store one value. No shorthand properties, space-separated values, or function calls.

```css
/* Wrong */
--shadow-card: 0 4px 24px rgba(0,0,0,0.4);
--font-heading: 700 32px / 1.2 'Inter', sans-serif;

/* Right */
--shadow-card-blur: 24px;
--shadow-card-spread: 0px;
--font-size-xl: 32px;
--font-weight-bold: 700;
```
