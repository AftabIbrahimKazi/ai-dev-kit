---
name: strata-css
description: Strata CSS (user's own strata-css framework) — usage, debugging, fixing at source; verifies against the live repo as it evolves. Trigger on using, installing, styling with, debugging, or developing strata-css / Strata classes / strata.config.js.
---

# Strata CSS — Author's-Own-Framework Protocol

Strata is the user's framework: npm package `strata-css` (NOT `strata` — that's an unrelated package), repo at `My Projects/Frameworks/strata`. Because the user owns it, bugs found while using it are *fixable at the source*, and this skill must never argue with the repo — the repo wins over anything remembered here.

## Adaptive rule — the repo is the source of truth
This skill's hardcoded facts WILL go stale as the framework gets updates. Before relying on any specific class name, config option, or behavior:
1. Check the version in play: project's `node_modules/strata-css/package.json` vs the repo's `package.json` + `CHANGELOG.md`. If they differ, the CHANGELOG entries in between are the delta to respect.
2. For any API detail (class names, config keys, `data-st-*` states, theme names): confirm in the repo — `README.md`, `docs/`, or `src/` — rather than from this file or memory.
3. If the repo contradicts this skill, follow the repo AND log the correction in `learnings.md` (see loop below) so the skill self-heals.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — new/changed framework behavior discovered, a bug found (and whether it was filed/fixed at source), a usage pattern that worked. Record the framework version alongside version-sensitive facts. Merge instead of duplicating; delete bullets obsoleted by framework updates.

## Core model (verified against repo — re-verify on version change)
- **Bootstrap-style components + Tailwind-style JIT:** component classes (`btn-primary`, `card`, `navbar`) work zero-config; JIT generates only the CSS actually used.
- **No `!important` anywhere; `@layer` handles specificity** — custom project CSS always wins automatically. Never "fix" a Strata style with `!important`; if custom CSS *doesn't* win, that's a layering bug worth investigating at the source.
- **State via `data-st-*` attributes**, not class toggling in JS — follow that pattern in consuming code.
- **Themes:** built-in light / dark / dim + unlimited custom themes.
- **Arbitrary values:** `mt-[24px]`, `bg-[#ff0000]`, `w-[347px]`.
- **Config:** `strata.config.js`; scaffold via `npx strata-css init`; PostCSS plugin architecture.
- Repo layout: `src/` (framework source), `packages/`, `dist/`, `docs/` (open `docs/index.html` directly — no build step), `test/`, `benchmark/`, `CHANGELOG.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `BRANCHING.md`.

## Using Strata in a project
- Check how the project consumes it first: full framework vs a utility-layer subset (some projects vendor only a slice — e.g. component tokens mirrored into their own variables file). Match the existing consumption pattern.
- Prefer component classes for standard UI, utilities for one-off adjustments, project CSS for anything genuinely custom — in that order.
- A utility that "doesn't exist" may just not be in the JIT output yet — confirm the class appears in generated CSS before concluding it's unsupported.
- Respect the consuming project's own conventions (prefixes, token files) where they wrap Strata.

## When Strata itself misbehaves (owner's privilege)
1. Reproduce minimally — ideally in the repo's `examples/` or `docs/` showcase.
2. Diagnose in `src/`, not in the consuming project — a workaround in the project is a last resort and must be flagged as tech debt pointing at the real fix.
3. Fixing at source: follow the repo's `CONTRIBUTING.md` + `BRANCHING.md`, run `test/` and `benchmark/` before considering it done, and add a `CHANGELOG.md` entry per its format.
4. New feature ideas surfaced by real usage → check `ROADMAP.md` first (may already be planned), then propose there rather than bolting on ad hoc.
5. After any source fix: rebuild/republish flow is the user's call — surface "fixed in repo, needs publish + version bump in consumers" explicitly.
