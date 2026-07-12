# Accessibility Standards

These rules apply to every page, component, and interaction across all projects. Accessibility is not an optional add-on — it is a baseline requirement built in from the start. The target conformance level is **WCAG 2.1 AA**.

---

## Structure and Semantics

---

## RULE A11Y-01 — Semantic HTML is the first tool

Use the most semantically appropriate HTML element for every piece of content. Native elements come with built-in accessibility behaviour (keyboard support, ARIA roles, focus management) that custom elements require manual effort to replicate.

```html
<!-- Wrong — custom button with no native behaviour -->
<div class="ex-btn" onclick="submit()">Submit</div>

<!-- Right — native element with built-in behaviour -->
<button type="submit">Submit</button>
```

---

## RULE A11Y-02 — Landmark regions are used on every page

Every page must define its landmark regions so screen reader users can navigate efficiently.

Required landmarks:

```html
<header>   <!-- site header -->
<nav>      <!-- primary navigation -->
<main>     <!-- primary page content — one per page -->
<footer>   <!-- site footer -->
```

Optional but recommended:

```html
<aside>    <!-- supplementary content -->
<section>  <!-- thematic grouping with a heading -->
<article>  <!-- self-contained content -->
```

---

## RULE A11Y-03 — One main landmark per page

There must be exactly one `<main>` element per page. It contains the primary content unique to that page.

---

## RULE A11Y-04 — Heading hierarchy is sequential

Heading levels must not skip. See `html-standards.md` RULE H-08. Headings communicate page structure to assistive technology — do not use them for visual size.

---

## Focus and Keyboard

---

## RULE A11Y-05 — All interactive elements are keyboard accessible

Every interactive element must be reachable and operable via keyboard alone. Tab order must follow a logical reading sequence.

Interactive elements that must be keyboard accessible:
- `<a href>` — activated with Enter
- `<button>` — activated with Enter or Space
- `<input>`, `<select>`, `<textarea>` — standard keyboard behaviour
- Custom controls — must implement equivalent keyboard behaviour manually

---

## RULE A11Y-06 — Focus outline is always visible

The browser default focus outline must never be suppressed with `outline: none` or `outline: 0` unless an equivalent, clearly visible custom focus style is provided.

```css
/* Wrong — removes focus with no replacement */
*:focus { outline: none; }

/* Right — custom focus style that is clearly visible */
*:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
```

---

## RULE A11Y-07 — Focus is managed programmatically when content changes

When content changes dynamically (modal opens, page section swaps, error appears), focus must be moved to the appropriate element programmatically. Focus must not remain on a hidden or removed element.

```js
// Right — move focus to modal when it opens
modal.addEventListener('data-state change', () => {
  if (modal.dataset.state === 'open') {
    modal.querySelector('[data-focus-first]').focus();
  }
});
```

---

## RULE A11Y-08 — Focus is trapped inside open modals and dialogs

When a modal or dialog is open, keyboard focus must be trapped within it. Tab and Shift+Tab must cycle through focusable elements inside the modal only. Focus must be returned to the trigger element when the modal closes.

---

## Colour and Contrast

---

## RULE A11Y-09 — Text contrast meets WCAG AA minimums

All text must meet the following contrast ratios against its background:

| Text size | Minimum contrast ratio |
|---|---|
| Normal text (under 18pt / 14pt bold) | 4.5 : 1 |
| Large text (18pt+ / 14pt+ bold) | 3 : 1 |
| UI components and icons | 3 : 1 |

---

## RULE A11Y-10 — Colour is never the sole means of conveying information

Information must never be communicated by colour alone. A secondary indicator (icon, label, pattern, text) must always accompany colour-coded meaning.

```html
<!-- Wrong — only colour distinguishes error from success -->
<span class="ex-status ex-status--red">Failed</span>

<!-- Right — icon + colour + text -->
<span class="ex-status" data-status="error">
  <svg aria-hidden="true"><!-- error icon --></svg>
  Failed
</span>
```

---

## Images and Media

---

## RULE A11Y-11 — All images have appropriate alt text

Content images must have descriptive alt text. Decorative images must use `alt=""` so screen readers skip them. See `html-standards.md` RULE H-04.

---

## RULE A11Y-12 — Videos have captions and audio descriptions

All video content must have:
- Closed captions for all spoken dialogue and meaningful audio
- Audio descriptions for visual content not conveyed through dialogue

---

## RULE A11Y-13 — No content flashes more than 3 times per second

Flashing or strobing content must not exceed 3 flashes per second. Content that does must be removed or placed behind a user-consent warning.

---

## ARIA

---

## RULE A11Y-14 — ARIA is used only when native HTML cannot do the job

ARIA attributes must not be used to override or supplement native HTML semantics that already work correctly. ARIA is only added when a custom interactive pattern has no native HTML equivalent.

```html
<!-- Wrong — adding role to a native element that already has it -->
<button role="button">Click me</button>

<!-- Right — ARIA only on custom interactive elements -->
<div role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></div>
```

---

## RULE A11Y-15 — All ARIA labels are meaningful and accurate

Every `aria-label`, `aria-labelledby`, and `aria-describedby` must provide a meaningful description that accurately reflects the element's purpose. Generic labels are not acceptable.

```html
<!-- Wrong -->
<button aria-label="button">...</button>

<!-- Right -->
<button aria-label="Close navigation menu">...</button>
```

---

## RULE A11Y-16 — Dynamic content changes are announced to screen readers

When content updates dynamically without a page reload, the update must be announced to screen readers using an ARIA live region.

```html
<!-- Status messages, alerts, loading states -->
<div role="status" aria-live="polite" aria-atomic="true">
  Loading complete — 9 planets loaded.
</div>
```

Use `aria-live="polite"` for non-urgent updates. Use `aria-live="assertive"` only for critical alerts that require immediate attention.

---

## Forms

---

## RULE A11Y-17 — Every form input has a visible, associated label

Every `<input>`, `<select>`, and `<textarea>` must have a `<label>` associated via `for`/`id`. Placeholder text is not a substitute for a label.

```html
<!-- Wrong — no label, placeholder only -->
<input type="email" placeholder="Email address">

<!-- Right -->
<label for="email">Email address</label>
<input type="email" id="email" placeholder="name@example.com">
```

---

## RULE A11Y-18 — Form errors are described in text and associated to the field

Validation errors must be communicated as text — not colour alone. Error messages must be programmatically associated to the field that caused them via `aria-describedby`.

```html
<label for="email">Email address</label>
<input type="email" id="email" aria-describedby="email-error" aria-invalid="true">
<span id="email-error" role="alert">Please enter a valid email address.</span>
```
