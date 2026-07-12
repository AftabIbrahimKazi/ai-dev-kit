# Astro — Component Files

Read [html-standards/component-files.md](../../html-standards/component-files.md) and [frameworks/astro.md](../astro.md) first.

---

## RULE AC-01 — Component filename matches component identity

The `.astro` filename must match the primary class or ID used in the component's markup, in PascalCase.

```
WarpOverlay.astro  →  <div class="warp-overlay">
LandingHeader.astro  →  <header class="landing-header">
```

---

## RULE AC-02 — Scoped styles are preferred over global styles

Component styles must use a plain `<style>` block (Astro's default scoping). Use `is:global` only when styles must intentionally escape the component scope (e.g. targeting a canvas element or a dynamically injected child).

---

## RULE AC-03 — Components do not load page-level scripts

A component must not import or boot a page-level entry script. Scripts that initialise a full engine belong in the page file, not the component.

---

## RULE AC-04 — Astro components are server-rendered by default

Do not add client-side interactivity to an Astro component via frontmatter. All client-side behaviour must go in a `<script>` block or an imported TS file.
