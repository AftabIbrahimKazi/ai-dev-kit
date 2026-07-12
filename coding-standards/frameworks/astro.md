# Framework Standards — Astro (Global)

These rules apply to all files in an Astro project. They extend the universal standards — they do not replace them. Where a rule overrides a universal rule, this is stated explicitly.

Read the relevant universal standard first, then this file, then the matching Astro partial for the file type you are editing.

Astro partials: [astro/](astro/)

---

## RULE A-01 — Scripts must use inline import syntax

OVERRIDES [html-standards] RULE P-03 (implementation detail)
Reason: Astro/Vite only processes scripts written as inline `<script>` blocks with import statements. A `src=` attribute bypasses the build pipeline and will not be bundled or type-checked.

```astro
<!-- Wrong -->
<script src="../scripts/main.ts"></script>

<!-- Right -->
<script>
  import '../scripts/main.ts';
</script>
```

---

## RULE A-02 — Component styles use `<style>` blocks, not external imports

Scoped styles for an Astro component belong in a `<style>` block inside the `.astro` file. External CSS files are for global or shared styles only.

```astro
<!-- Wrong — importing component-scoped styles from external file -->
<style>
  @import '../styles/my-component.css';
</style>

<!-- Right — scoped styles inline -->
<style>
  .my-component { ... }
</style>
```

Exception: Global stylesheets (tokens, reset, layout) are imported in layout templates via `<style is:global>` or a `<link>` tag.

---

## RULE A-03 — Global styles use `is:global`

Styles that must apply outside the component scope (e.g. canvas resets, warp overlay structural rules) must use the `is:global` directive.

```astro
<!-- Right — structural rule with no JS/TS state dependency -->
<style is:global>
  #ex-warp-canvas { inset: 0; pointer-events: none; position: fixed; }
</style>
```

**Boundary — `is:global` is for structural styles only.**

A `<style is:global>` block must only contain rules that are structurally required and have no dependency on JS/TS state. Any rule that targets a `data-*` attribute updated by a script — or that reflects any JS/TS-driven state — must be moved to a named CSS file and is not permitted inside a `<style>` or `<style is:global>` block.

```astro
<!-- Wrong — JS/TS state-driven rule written in a component style block -->
<style is:global>
  #ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity var(--ex-duration-veil-in) ease-in; }
</style>
```

```css
/* Right — state-driven rule in a named CSS file (e.g. main.css) */
#ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity var(--ex-duration-veil-in) ease-in; }
```

See `css-standards.md` RULE 21 for the complete three-layer pattern (markup / CSS file / script).

---

## RULE A-04 — Props are typed with an interface

Every Astro component that accepts props must define a typed `Props` interface in its frontmatter.

```astro
---
interface Props {
  title: string;
  variant?: 'default' | 'accent';
}
const { title, variant = 'default' } = Astro.props;
---
```

---

## RULE A-05 — Server-only logic stays in frontmatter

Data fetching, file reads, and any Node.js operations must be performed in the `---` frontmatter block. They must not be placed in `<script>` blocks, which run in the browser.

---

## RULE A-06 — Page components live in `src/pages/` only

Routable pages must only exist inside `src/pages/`. Components, layouts, and partials must not be placed there.
