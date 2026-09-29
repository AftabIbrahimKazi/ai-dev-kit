---
name: comment-style
description: Set how much the AI comments code it writes — none (default), terse, or descriptive — to cut token waste. Trigger whenever writing or editing code, or when the user asks to change comment style, verbosity, or add/remove comments.
---

# Comment Style — Per-Project Comment Level

Comments cost output tokens when written and input tokens on every later re-read of the file. This skill fixes one project-wide level so the AI stops improvising comment volume per edit.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a case that was wrongly commented or wrongly left bare, or an exception category that turned out to be missing. Merge instead of duplicating; delete disproven bullets.

## Active level
**Active level: none**

Read the line above before writing any code; it is the only setting. `install-kit` writes it at install; the user changes it later by stating so in-session ("set comment style to terse") — the AI edits that line and confirms in one sentence. Never change it on inference.

## The three levels

| Level | Rule |
|---|---|
| `none` (default) | Write no comments in code you author. Only the exceptions below. |
| `terse` | A comment only when the *why* is non-obvious (hidden constraint, workaround, surprising behavior). One line, plain words, no more than ~80 characters. Never restate what the code does. |
| `descriptive` | Same triggers as `terse`, but up to 3 short lines in simple words — what the tricky part is, why it's done that way, and what breaks if changed. Still never narrates obvious code line by line. |

`terse` matches `coding-standards` RULE AI-11. `descriptive` deliberately loosens AI-11 for this project by the user's own choice — say so in the install report.

## Exceptions that apply at every level, including `none`
A comment is still written when a rule or tool requires one. Only these categories qualify:
1. **Justifications for escape hatches** — one line on why it is safe or necessary: TS/JS `as` assertions (RULE TS-15 / JT-TS-05), and the reason on suppression directives (`@ts-expect-error`, `@ts-ignore`, `eslint-disable`, `stylelint-disable`, `# noqa`, `# type: ignore`).
2. **Directive/pragma comments a tool consumes** — `// @ts-check`, `/** @jsx */`, `// prettier-ignore`, bundler hints like `/* webpackChunkName */`, and a license header the project requires.
3. **JSDoc as the type system** in a JS-only project whose standard mandates it — and only the type tags, not prose.

Anything not on this list gets no comment at `none`. If a case looks similar but you're unsure it qualifies, default to no comment. When the user names a new mandatory case, add it here (not to the code base) and note it in `learnings.md`.

## Where the reasoning goes instead
At `none`, a non-obvious why still matters — surface it in the end-of-turn summary or the commit message, one line, never in the code. That keeps the context lean without losing the rationale.

## Boundaries
- Governs comments you **write**. Never strip or rewrite existing comments in a file you're editing, and never comment-out code (RULE TS-09 / JT-10 / JS-08).
- Applies to code comments only — docstrings for a public API the project's standard requires, README text, and commit messages follow their own standards.
- The level applies to every language in the project; there is no per-language override.
