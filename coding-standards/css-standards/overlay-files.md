# CSS Standards — Overlay Files

**Role:** An overlay file contains styles scoped to a modal, panel, drawer, tooltip, or any UI layer that sits above the main content. Overlays are typically triggered, transitioned, and dismissed programmatically.

Read [css-standards.md](../css-standards.md) first for global rules.
Read [component-files.md](component-files.md) — all component rules also apply to overlays.
Rules below are specific to overlay files only.

---

## RULE O-01 — Overlays must define their own stacking context

Every overlay root element must set `position` and `z-index` explicitly. The z-index value must come from a token or be a hardcoded structural value with a comment explaining its stack position.

```css
/* Wrong */
.modal { position: fixed; }

/* Right */
.modal { position: fixed; z-index: 200; } /* above header (100), below system alerts (300) */
```

---

## RULE O-02 — Visibility is controlled by a single data attribute value

An overlay's shown/hidden state must be driven by a data attribute that is **always present** on the root element from initial render. JavaScript updates the attribute's value only — it never adds or removes the attribute. CSS targets the value.

No class toggling, no attribute adding/removing, no scattered property changes across multiple selectors for a single state change.

```html
<!-- Wrong — attribute absent by default, JS adds it on open -->
<div class="modal"></div>

<!-- Wrong — JS removes the attribute on close -->
<div class="modal" data-open></div>

<!-- Right — attribute always present, JS sets its value -->
<div class="modal" data-state="closed"></div>
```

```css
/* Wrong — targets presence/absence of attribute */
.modal[data-open] { opacity: 1; }

/* Wrong — visibility split across selectors */
.modal { display: none; }
.modal__backdrop { opacity: 0; }
.modal.is-open { display: block; }
.modal.is-open .modal__backdrop { opacity: 1; }

/* Right — targets the attribute value */
.modal { opacity: 0; pointer-events: none; transition: opacity var(--duration-fast) ease; }
.modal[data-state="open"] { opacity: 1; pointer-events: auto; }
```

```js
// Wrong — adding/removing the attribute
element.setAttribute('data-open', '');
element.removeAttribute('data-open');

// Right — updating the value only
element.dataset.state = 'open';
element.dataset.state = 'closed';
```

---

## RULE O-03 — Entry and exit transitions use the same duration variable

The same `var(--duration-*)` token must be used for both the entry and exit transition of an overlay. They must not use different durations unless there is a documented design reason.

---

## RULE O-04 — Backdrop styles are scoped to the overlay file

Any backdrop/scrim that belongs to an overlay is styled in the same overlay file, not in a global or layout file.
