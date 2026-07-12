---
name: astro-page
description: Convention-driven Astro scaffolding — discover project conventions, mirror the nearest sibling, verify. Trigger when adding an Astro page, component, overlay, entry script, or wiring CSS/TS into an Astro site.
---

# Astro Page — Convention-Driven Scaffolding

New surface area in an Astro project should be indistinguishable from existing surface area. This skill front-loads convention discovery so nothing gets invented that the project already standardizes.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a convention discovered the hard way, a scaffolding step that was missing. Merge instead of duplicating; delete disproven bullets.

## Step 1 — Discover the project's conventions (never assume)
Before writing anything, establish from the project itself:
- **Standards docs:** CLAUDE.md, `coding-standards/`, or equivalent — load the chain for every file role you'll touch (component, stylesheet, script).
- **Prefixes:** CSS token prefix and selector signature (e.g. `--ex-` / `ex-`) — grep an existing stylesheet to confirm.
- **File placement:** where do pages, components, overlays, entry scripts, and per-feature CSS live? Mirror the nearest sibling, don't invent a location.
- **Script wiring:** does the project use per-page entry scripts (`src/scripts/*-entry.ts`)? New page → new entry or extend an existing one, matching the established pattern.
- **The nearest sibling is the template.** Copy the structure of the closest existing equivalent (an existing overlay for a new overlay) and change what differs — this beats generating from scratch on every axis.

## Step 2 — Scaffold in dependency order
1. Component/page `.astro` — markup only, semantic HTML, project's class signature on every styled element.
2. Stylesheet in the project's convention location — tokens from the token file, no hardcoded values the token file already covers, no new tokens without checking existing ones first.
3. Script (TS) — separate file, imported via the entry-script pattern; no inline `<script>` unless the project's siblings do it.
4. Wire-up: route/nav/imports — grep for how siblings are registered.

## Astro-specific rules
- Islands discipline: no `client:*` directive unless the component genuinely needs client JS; prefer `client:visible` over `client:load` for below-fold interactivity.
- Scoped styles vs project stylesheets: follow the project split (many convention systems put component CSS in `public/css/` deliberately — don't "fix" that into scoped styles).
- Props typed via interface in frontmatter; no `any`.
- Assets: through the project's established asset path (`public/` vs `src/assets/` with `astro:assets`) — check which one siblings use.
- MPA navigation: if the project has page-transition scripts (warp effects, loaders), new pages must hook the same lifecycle — find where siblings register.

## Step 3 — Verify
- Dev-server render of the new route, console clean.
- Grep your new files for convention violations: hardcoded colors/sizes with existing tokens, missing prefix on selectors, wrong import style.
- Accessibility pass per project standard (landmarks, alt text, focus, reduced-motion for animated pages).
