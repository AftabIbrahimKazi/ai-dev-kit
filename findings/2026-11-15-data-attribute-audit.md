# Data-attribute audit, 2026-11-15

Rule (html-standards RULE 21, js standards): a `data-*` attribute carries JS-driven state by value, is present from first render, and script only changes its value. Class A = value toggled (good). Class B = attribute injected, removed, toggled by presence, blanked, or selected by presence (bad).

## Scope

Kit standards (`coding-standards/`), kit skills, add-on templates, the docs-site source (`site` branch checkout under `site/ai-dev-kit-doc-site`). `pleximus-design-system/` is read-only and out of scope for edits.

## Results

| File | Line | Attribute | Class | Action |
|---|---|---|---|---|
| coding-standards/js-standards.md | 127-128 | `data-open` add/remove | B, labelled "Wrong" | none, it is the bad example |
| coding-standards/ts-standards.md | 151-152 | `data-open` add/remove | B, labelled "Wrong" | none |
| coding-standards/js-and-ts-standards.md | 194-195 | `data-open` add/remove | B, labelled "Wrong" | none |
| coding-standards/css-standards/overlay-files.md | 36, 44, 59-60 | `data-open` markup, selector, add/remove | B, labelled "Wrong" | none |
| coding-standards/html-standards.md | 108 | `<div data-open>` | B, labelled "Wrong" | none |
| coding-standards/**/*.md (the rest, 30 hits) | | `data-state`, `data-theme`, `data-veil-state`, `data-status` | A | none |
| coding-standards/qa/e2e-testing.md | 34 | `[data-tfg-app-ready]` presence wait | test hook in a JS selector, not CSS state | none (a query hook, not a state toggle) |
| skills/addons/teardown.template/shell/index.html | 32 | `canvas[data-chart]` CSS presence selector | B | fixed: `figure canvas` |
| skills/addons/teardown.template/shell/console.js | 16, 30, 40 | `data-chart="i"`, `data-focus="n"` | A (valued query hooks) | none |
| skills/addons/teardown.cli.ts | 541 | `click('[data-focus="1"]')` | A | none |

Unlabelled B cases left in standards or templates: 0 (was 1: the teardown template).

## Detector gaps closed (`code-audit`)

Before: only `removeAttribute('data-x')` and `setAttribute('data-x', '')` (rule `js-11` / `ts-16`).
Added: `toggleAttribute('data-x')`, `delete el.dataset.x`, `el.dataset.x = ''` (same rule); a value-less `data-x` attribute in markup and a `[data-x]` presence selector in CSS (new rule `data-presence`). Tests: `tests/code-audit.test.js`.

## Deployed site comparison

Deploy URL: https://ai-dev-kit-docs.vercel.app (Next.js, source on the `site` branch). Local checkout of that source (`site/ai-dev-kit-doc-site/src`, `public`): no presence selectors, no `toggleAttribute`, no `removeAttribute('data-...')` in its own code. The only hit is Next.js's own `removeAttribute('data-dpl-id')` inside the framework's bundled chunks (library code, never checked). Live fetch of the deployed page and its 10 script bundles: 0 value-less `data-*` attributes in the HTML; the only `removeAttribute('data-...')` in any bundle is Next.js's own `data-dpl-id` (framework code, never checked). Source and deployed site agree: no B cases in the site's own code.
