# HTML Standards — Global Rules

These rules apply to **every HTML or markup file in the project** without exception.
Read this file before reading any HTML file-type partial.

For file-type specific rules see: [html-standards/](html-standards/)

---

## RULE H-01 — Semantic elements over generic containers

Use the most semantically appropriate HTML element for the content. Generic `<div>` and `<span>` are only used when no semantic element fits.

```html
<!-- Wrong -->
<div class="header">
  <div class="nav">...</div>
</div>

<!-- Right -->
<header>
  <nav>...</nav>
</header>
```

---

## RULE H-02 — No inline styles

Styles must never be applied via the `style` attribute. All styles belong in CSS files or scoped style blocks.

```html
<!-- Wrong -->
<div style="padding: 16px; color: red;">

<!-- Right -->
<div class="card">
```

---

## RULE H-03 — IDs are for behaviour, classes are for styling

`id` attributes are reserved for JavaScript hooks and anchor targets. Never use an `id` to apply CSS styles.

```html
<!-- Wrong -->
<section id="hero"> with #hero { ... } in CSS

<!-- Right -->
<section id="hero" class="hero-section">
```

---

## RULE H-04 — Every image must have an alt attribute

All `<img>` elements must have an `alt` attribute. Decorative images use `alt=""`. Informative images must have a meaningful description.

```html
<!-- Wrong -->
<img src="planet.jpg">

<!-- Right — informative -->
<img src="planet.jpg" alt="Jupiter with its Great Red Spot">

<!-- Right — decorative -->
<img src="divider.svg" alt="">
```

---

## RULE H-05 — No presentational attributes

Attributes like `width`, `height` (for layout purposes), `align`, `border`, `bgcolor` must not be used in markup. Layout and appearance belong in CSS.

Exception: `width` and `height` on `<img>` for aspect-ratio hints to prevent layout shift are permitted.

---

## RULE H-06 — Data attributes are for JavaScript-driven state only

`data-*` attributes are used exclusively to reflect JavaScript-driven state. They must not be used for static styling decisions or presentational purposes.

```html
<!-- Wrong — data attribute used purely for CSS targeting with no JS state -->
<div data-style="card-large">

<!-- Right — data attribute reflects a JS-controlled state -->
<div data-state="idle">
```

---

## RULE H-09 — Data attributes are always present, JS updates their value only

A data attribute that represents state must be present on the element from initial render with a default value. JavaScript must only ever update the attribute's value — it must never add or remove the attribute itself. Classes and IDs follow the same rule: they are never added or removed by JavaScript.

The value a data attribute holds can be anything appropriate to its purpose — boolean-style strings (`"true"/"false"`, `"open"/"closed"`, `"visible"/"hidden"`), or multiple named states (`"dark"/"light"/"dim"`). What matters is that the attribute is always present in the markup and always carries a value.

See the active script standard for the corresponding JS rule on how to update state attributes correctly.

```html
<!-- Wrong — attribute absent, JS adds it on open -->
<div class="modal"></div>

<!-- Wrong — value-less boolean, JS removes it on close -->
<div class="modal" data-open></div>

<!-- Right — boolean-style, always present with a default value -->
<div class="modal" data-state="closed"></div>

<!-- Right — multi-state, always present with a default value -->
<div class="theme-root" data-theme="light"></div>
```

---

## RULE H-07 — Interactive elements must be keyboard accessible

All interactive elements (`<button>`, `<a>`, custom controls) must be reachable and operable via keyboard. Never suppress focus outlines without providing an equivalent visible focus style.

---

## RULE H-08 — Heading hierarchy must be sequential

Heading levels (`h1` → `h6`) must not skip levels. There must be exactly one `h1` per page.

```html
<!-- Wrong -->
<h1>Page Title</h1>
<h3>Section</h3>

<!-- Right -->
<h1>Page Title</h1>
<h2>Section</h2>
```

---

## RULE H-10 — Banned tags in UI markup

The following HTML tags are banned in all UI markup. They may only appear in email templates where inline CSS is unavoidable.

| Banned tag | Replacement |
|---|---|
| `<br>` | `<span>` with `display: block` via a CSS class |
| `<strong>` | `<span>` with font-weight via a CSS class |
| `<small>` | `<span>` with font-size via a CSS class |

```html
<!-- Wrong -->
<br>
<strong>Important text</strong>
<small>Fine print</small>

<!-- Right -->
<span class="ex-line-break"></span>
<span class="ex-text-bold">Important text</span>
<span class="ex-text-small">Fine print</span>
```

The reason: these tags encode presentation in markup. All presentation belongs in CSS.
