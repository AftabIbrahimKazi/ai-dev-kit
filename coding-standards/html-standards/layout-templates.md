# HTML Standards — Layout Templates

**Role:** A layout template is the outermost shell of a page. It defines the document structure (`<html>`, `<head>`, `<body>`), provides slots for page content, loads global assets, and wraps all pages in consistent chrome (header, footer, scripts).

Read [html-standards.md](../html-standards.md) first for global rules. Rules below are specific to layout templates only.

---

## RULE LT-01 — Layout templates own the document head

All `<meta>`, `<link>`, `<title>`, and global `<script>` tags belong in the layout template, not in individual page files. Page files may pass data (e.g. title, description) to the layout via props or slots.

---

## RULE LT-02 — Slots must be named and purposeful

Every slot in a layout template must have a clear name that describes what content it accepts. An unnamed default slot is permitted only if the template has exactly one content area.

---

## RULE LT-03 — Global CSS is loaded once in the layout

Global stylesheets are imported or linked in the layout template only. Page files and components must not re-import global CSS.

---

## RULE LT-04 — Layout templates must not contain page-specific content

A layout template must contain no content that is unique to a single page. All page-specific content belongs in the page file and is passed through slots.

---

## RULE LT-05 — Layout templates must set the document language

The `<html>` element must always have a `lang` attribute.

```html
<!-- Wrong -->
<html>

<!-- Right -->
<html lang="en">
```
