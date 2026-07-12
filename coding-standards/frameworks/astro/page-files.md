# Astro — Page Files

Read [html-standards/page-files.md](../../html-standards/page-files.md) and [frameworks/astro.md](../astro.md) first.

---

## RULE AP-01 — Pages import their entry script via inline script block

Every page that needs client-side JavaScript must import its entry script using an inline `<script>` block, not a `src=` attribute.

```astro
<!-- Wrong -->
<script src="../scripts/landing.ts"></script>

<!-- Right -->
<script>
  import '../scripts/landing';
</script>
```

---

## RULE AP-02 — Pages pass layout props explicitly

When using a layout component, all required props must be passed explicitly. No spreading of unknown objects into layout props.

```astro
<!-- Wrong -->
<Layout {...someObject}>

<!-- Right -->
<Layout title="Sol — Exo Space" description="The sun page">
```

---

## RULE AP-03 — No business logic in page frontmatter

Page frontmatter handles data fetching and prop passing only. Complex logic must be extracted to utility files and imported.
