---
name: code-audit
description: Project-wide audit of the coding-standards rules that a script can check (CSS, HTML, JS/TS, page SEO/a11y/perf basics, git history, versioning). Trigger on a cleanup, audit, retrofit or review task over a whole project or folder, an old or multi-dev codebase, or "find all violations of ...".
compat: node
---

# Code Audit — Count First, Read Only What Is Flagged

A project-wide hunt for violations by grepping and opening files spends tokens on searching. `audit.js` does the search in one run and prints a few dozen lines. You spend tokens on judging and fixing.

It does not replace review. It replaces the searching. Rules a script cannot check stay with you (see "Not covered").

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a false-positive pattern met, an ignore that was needed, a rule the audit missed. Merge instead of duplicating; delete disproven bullets.

## Run it
`node <skill-root>/code-audit/audit.js` from the project root (or `--cwd <dir>`). It works in any tool that can run Node.

| Need | Command |
|---|---|
| Overview | `audit.js` |
| One standard | `audit.js --standard css,html` (also `js ts a11y seo perf git version`) |
| Part of the tree | `audit.js src/components` |
| Every hit of one rule | `audit.js --rule css-14` (`--context` adds the source line, `--limit N` raises the 200 cap) |
| Leave out third-party code | `audit.js --ignore 'vendor/**'` or `ignore` in `.claude/code-audit.json` |
| See what is and is not checked | `audit.js --list` |
| Track progress | `audit.js --baseline` once, then plain `audit.js`; exit code 1 only if a count rose |

## Cleanup workflow
1. Run the overview. If it prints a `hint:` line for a vendor-looking folder, confirm with the user that it is third-party, then rerun with `--ignore`.
2. Run `--baseline`.
3. Work one rule at a time, starting with the cheapest to fix. `--rule <id> --context` gives the file, line and source. Open only those files.
4. Rerun the overview after each batch. The counts are the progress report.
5. Report what is left as `rule: count`, not prose.

## Kinds of finding
- **rule**: a violation of a standard. Fix it, or tell the user why it stays.
- **review**: a heuristic candidate (commented-out code, listeners with no cleanup, an `as` with no comment, `classList` for state, `outline: none`). Judge each one; many are fine.
- **info**: a count only. `<style>` blocks are allowed by css RULE 08 and H-02. They are a violation only for CSS driven by JS state (css RULE 21) or when the project forbids them (Strata SC-03: set `"styleBlocks": "forbid"`).

## Rules for the model
1. **Judgement fixes go to the user.** An `!important` often hides a specificity conflict. A hardcoded colour may need a token that does not exist yet. Per AI-12, say "the standards do not cover X" instead of inventing a rule.
2. **Do not bulk-fix by script.** Fix by hand, or by a small reviewed change per rule. Rerun the audit to prove it.
3. **Third-party code is not the project's debt.** Ask before fixing anything under a vendored, generated or framework folder.
4. **Per-file edits still go through `edit-check`.** This skill is for whole-tree work. The `edit-check` engine runs its small per-edit subset from this same engine.

## Not covered (read the standard and the code instead)
`audit.js --list` prints the full list. In short: naming conventions, variables-store-values-only, gradients, framework-first, selector signatures, import order, function size, async error handling, contrast, focus management, ARIA meaning, unused CSS and JS, Core Web Vitals, and the git and versioning rules that describe workflow (branch flow, pull before push, bump at push time).

## Known limits
- Checks are regex based, not parsers. They skip comments (including `//` in SCSS, Sass and Less, and Liquid `{% comment %}`), strings and JSX prose between tags, but code built inside template strings or generated at runtime is invisible to them.
- Liquid templates are audited like other markup; `{% style %}` and `{% stylesheet %}` count as style blocks.
- The version pack skips a `package.json` with `"private": true` (an app that is never published). The g-05 branch rule skips the standard's permanent branches (`main`, `beta`, `test`, `dev`) and `master`/`develop`.
- Page rules (title, description, canonical, og:title, one `h1`, one `main`, heading order, head scripts) only run on `.html` and `.astro` files that contain their own `<html>`. Layouts and partials are not judged.
- `== null` counts as a violation of TS-11 / JS-10, because the standard has no null exception.
- Git rules read the last 200 commits (`--commits N`). The 50-character limit is measured on the whole header line (type, scope and summary), the same as `pre-commit`'s `check.js`.
- Files with a generated header ("Do not edit", "@generated"), generated or minified names, or very long lines are skipped and counted in the first line. `--skipped` lists them and `--include-generated` audits them anyway.
- Counts are occurrences, not lines. Two on one line count twice.
- Measured once (2026-10-09, one Shopify theme, rules js-09, js-10, js-03, Haiku 5.5 with Read/Grep/Glob against `audit.js`): same files and same lines, except the model missed one file (12 `console` calls). Script: 0.2 s, no tokens. Model: $0.026, 30 turns, 17k output tokens. One project and three rules is thin evidence; the heuristic rules (`review`) have no such comparison yet.
