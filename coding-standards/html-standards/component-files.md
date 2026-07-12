# HTML Standards — Component Files

**Role:** A component file is a reusable markup fragment that encapsulates a single UI concern. It accepts props or slots, renders its own markup, and is responsible for loading its own scoped styles.

Read [html-standards.md](../html-standards.md) first for global rules. Rules below are specific to component files only.

---

## RULE CH-01 — Components have a single root element

Every component must have exactly one root element wrapping all its markup. Multiple sibling root elements are not permitted.

```html
<!-- Wrong -->
<div class="card__header">...</div>
<div class="card__body">...</div>

<!-- Right -->
<div class="card">
  <div class="card__header">...</div>
  <div class="card__body">...</div>
</div>
```

---

## RULE CH-02 — Components own their own styles

A component file is responsible for importing or defining its own scoped CSS. It must not rely on a parent page or layout to supply its styles.

---

## RULE CH-03 — Props control content, not appearance

A component receives data through props. Props must not be used to pass raw CSS values or style strings. Appearance variants are expressed through modifier classes or named variant props that map to predefined CSS classes.

```html
<!-- Wrong -->
<Card color="#a78bfa" paddingTop="24px" />

<!-- Right -->
<Card variant="accent" size="lg" />
```

---

## RULE CH-04 — Slots are used for content injection

Variable or optional content sections within a component must use named slots. Hard-coded content that never changes may be written directly in the component template.
