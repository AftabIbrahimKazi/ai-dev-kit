# Astro — Layout Templates

Read [html-standards/layout-templates.md](../../html-standards/layout-templates.md) and [frameworks/astro.md](../astro.md) first.

---

## RULE AL-01 — Layout templates import global CSS in the frontmatter

Global stylesheets must be imported in the frontmatter of the layout template, not in a `<style>` block.

```astro
---
import '../styles/global.css';
import '../styles/tokens.css';
---
```

---

## RULE AL-02 — The `<slot />` element is the only content injection point

A layout template passes page content through `<slot />` or named `<slot name="..." />` elements. No other pattern for content injection is permitted.

---

## RULE AL-03 — Layout templates define `<head>` content via props

Dynamic `<head>` values (title, meta description, OG tags) must be received as typed props and rendered in the layout's `<head>`. Pages pass these values when using the layout.

```astro
---
interface Props {
  title: string;
  description?: string;
}
const { title, description = '' } = Astro.props;
---
<html lang="en">
  <head>
    <title>{title}</title>
    <meta name="description" content={description} />
  </head>
  <body>
    <slot />
  </body>
</html>
```
