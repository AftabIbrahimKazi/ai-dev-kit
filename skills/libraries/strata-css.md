---
name: strata-css
description: Strata CSS (user's own strata-css framework) — what utilities exist, safe CSS→utility conversion, debugging, fixing at source. Trigger on using, installing, styling with, migrating to, debugging, or developing strata-css / Strata classes / strata.config.js, or converting CSS to Strata utilities.
---

# Strata CSS — Author's-Own-Framework Protocol

Strata is the user's framework: npm package `strata-css` (NOT `strata` — unrelated package), repo at `My Projects/Frameworks/strata`. The user owns it, so bugs found while using it are *fixable at source*. The repo always wins over anything written here.

## Never hand-derive coverage — run the script

The single biggest time sink is rediscovering "does Strata have a utility for property X?" by reading `registry.js` by hand. Don't. Run the companion script from any project with strata-css installed:

```bash
node .claude/skills/strata-css/coverage.js            # all properties
node .claude/skills/strata-css/coverage.js padding    # filter
node .claude/skills/strata-css/coverage.js --zero     # what has NO utility / named-only
```

It reads the **installed** registry, so output always matches the version in play — nothing to go stale. It reports, per property: `[arb]` arbitrary bracket, `[arb-bp]` breakpoint-scoped arbitrary, named, and breakpoint-scoped named. **A property absent from its output has no utility at all and must stay real CSS.**

It also auto-detects **silent no-ops** — class shapes that match a registry pattern, compile without error, and emit nothing. Trust the script's list over any list written here.

> `require('strata-css/src/registry/registry.js')` fails — the package's `exports` map blocks that subpath. Resolve an absolute path into `node_modules/` instead (the script already does).

## Your Bootstrap/Tailwind intuitions are a liability here

Strata deliberately mirrors Bootstrap naming (`d-flex`, `p-3`, `ms-auto`). That does **not** mean recalled knowledge transfers — and the resemblance makes wrong guesses feel confident. Two proven divergences:

- **Silent no-ops come from exactly this.** The spacing regex accepts `[trblxyes]`, the *union* of physical naming (`t r b l` — Tailwind and Bootstrap 4) and logical naming (`x y e s` — Bootstrap 5), but only `t b x y e s` are implemented. So `pl-[…]`, `pr-[…]`, `ml-[…]`, `mr-[…]` — precisely the Tailwind spellings — match the pattern, compile clean, and emit nothing. Use `ps`/`pe`/`ms`/`me`.
- **`!important` is inverted.** Bootstrap generates its utilities with `!important` (many project standards therefore ban them). Strata's identically-named utilities have none — specificity is handled by `@layer`. Guidance written for Bootstrap will steer you wrong on a Strata project in both directions.

Unlike Bootstrap and Tailwind, Strata is private: none of its API is in the model's prior knowledge. Every class must come from the installed source, i.e. from `coverage.js` — never from recall, and never from "this is what Bootstrap/Tailwind calls it."

## Rules that never go stale

Structural, not version-specific. These caused every real bug in past migrations:

1. **Pseudo-classes, pseudo-elements and state selectors can never become utilities.** Strata has no state-variant syntax (no `hover:` prefix). `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`, `::before`, `::after`, `::placeholder`, `[data-*]` states — permanently real CSS. Don't re-investigate this each time.
2. **Unlayered CSS always beats layered utilities**, regardless of specificity or source order — per the cascade-layers spec. Strata's utilities live in `@layer`; component-colocated `.css` files usually compile unlayered. So `d-lg-none` can *never* override a component's own `display` rule. Fix with a modifier class in that same file (same cascade scope), not a utility.
3. **A base utility + a breakpoint utility on the same property is a landmine** — e.g. base `d-grid` plus `d-sm-flex`. Sometimes the breakpoint one doesn't win. Verify in a browser before trusting it, never on build-green alone.
4. **Shorthand vs per-side.** `border-[…]` sets all four sides; per-side needs `border-top-[…]` etc. Check the script before assuming a per-side form exists.
5. **Arbitrary values use `_` for spaces**: `p-[1rem_2rem]`, `border-[1px_solid_var(--x)]`. `var()` works inside brackets.
6. **`!`-prefixed variants emit `!important`** (`!m-0`). Many projects ban these — check the project's CSS rules first.
7. **Named scales are fixed and small.** Spacing steps are `0 · .25 · .5 · 1 · 1.5 · 3rem`. A token that doesn't land on a step has no named utility — use the arbitrary form or leave it as CSS. Never silently snap to the nearest step; that's a visual change, not a refactor.

## Converting a project's CSS to utilities

- **Scope first.** Only base-state declarations on plain single-class selectors are candidates. Everything in rule 1 is permanently out.
- **Grep every consumer of a class before editing** — not just the file that "owns" the CSS. Shared class names are the #1 cause of regressions in these passes: the CSS sits in one file, the class is applied in several.
- **Prefer one scripted strip-from-CSS + insert-into-markup pass** over manual per-file edits, for exactly that reason.
- **Delete any `.css` file that ends up empty** and remove its `import`. Leave no empty rules or dead imports.
- **Build-green is not verification.** A dropped or silently-no-op'd utility compiles fine. Confirm visually (screenshots at the relevant breakpoints) or by computed style. Past bugs here were invisible to `npm run build`.

## Core model (re-verify on version change)

- Bootstrap-style components + Tailwind-style JIT: `btn-primary`, `card`, `navbar` work zero-config; only used CSS is generated.
- Breakpoints follow Bootstrap: `sm` 576 · `md` 768 · `lg` 992 · `xl` 1200 · `xxl` 1400 — mobile-first `min-width`, cascading upward. A project using its own threshold (e.g. 1024) silently disagrees with every `-lg-` utility; align them.
- `ms`/`me` map to margin-**left**/**right** (physical, despite the start/end naming).
- State via `data-st-*` attributes; themes light / dark / dim + custom.
- Config `strata.config.js`, scaffold `npx strata-css init`, PostCSS plugin. In Next.js the default content glob already covers `src/`, so no config file is needed — just the PostCSS plugin plus the three `@strata` directives.
- Repo layout: `src/`, `packages/`, `docs/` (open `docs/index.html` directly), `test/`, `benchmark/`, `CHANGELOG.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `BRANCHING.md`.

## When Strata itself is the problem (owner's privilege)

1. Reproduce minimally — ideally in the repo's `examples/` or `docs/`.
2. Diagnose in `src/`, not in the consuming project. A project-side workaround is a last resort and must be flagged as debt pointing at the real fix.
3. Fix per `CONTRIBUTING.md` + `BRANCHING.md`; run `test/` and `benchmark/`; add a `CHANGELOG.md` entry.
4. Feature ideas → check `ROADMAP.md` first, propose there rather than bolting on ad hoc.
5. After a source fix, surface "fixed in repo, needs publish + version bump in consumers" explicitly — that call is the user's.

## Self-improvement

1. **At start:** read `learnings.md` in this skill's folder if present; apply what's relevant.
2. **At end:** append one dated bullet — changed behavior, a bug found (and whether filed/fixed at source), a pattern that worked. Record the framework version next to version-sensitive facts. Merge rather than duplicate; delete bullets the framework has obsoleted.
3. If the repo contradicts this file, follow the repo and correct this file so it self-heals.
