---
name: comment-style
description: Writing or editing code, or changing comment style or verbosity. Load BEFORE writing code; default is no comments.
---

# Comment Style — Per-Project Comment Level

One project-wide comment level, so the AI stops improvising comment volume per edit.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a case that was wrongly commented or wrongly left bare, or an exception category that turned out to be missing). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Active level
**Active level: none**

Read the line above before writing any code; it is the only setting. `install-kit` writes it at install; the user changes it later by stating so in-session ("set comment style to terse") — the AI edits that line and confirms in one sentence. Never change it on inference.

## The three levels

| Level | Rule |
|---|---|
| `none` (default) | Write no comments in code you author. Only the exceptions below. |
| `terse` | A comment only when the *why* is non-obvious (hidden constraint, workaround, surprising behavior). One line, plain words, no more than ~80 characters. Never restate what the code does. |
| `descriptive` | Same triggers as `terse`, but up to 3 short lines in simple words — what the tricky part is, why it's done that way, and what breaks if changed. Still never narrates obvious code line by line. |

`terse` matches RULE AI-11; `descriptive` loosens it by the user's choice (say so in the install report).

## Exceptions that apply at every level, including `none`
A comment is still written when a rule or tool requires one. Only these categories qualify:
1. **Justifications for escape hatches** — one line on why it is safe or necessary: TS/JS `as` assertions (RULE TS-15 / JT-TS-05), and the reason on suppression directives (`@ts-expect-error`, `@ts-ignore`, `eslint-disable`, `stylelint-disable`, `# noqa`, `# type: ignore`).
2. **Directive/pragma comments a tool consumes** — `// @ts-check`, `/** @jsx */`, `// prettier-ignore`, bundler hints like `/* webpackChunkName */`, and a license header the project requires.
3. **JSDoc as the type system** in a JS-only project whose standard mandates it — and only the type tags, not prose.

Anything else gets no comment at `none`; when unsure, write none. A new mandatory case the user names goes in this list.

At `none`, put a non-obvious why in the end-of-turn note or the commit message, one line, never in the code.

## Boundaries
- Governs comments you **write**. Never strip or rewrite existing comments in a file you're editing, and never comment-out code (RULE TS-09 / JT-10 / JS-08).
- Applies to code comments only — docstrings for a public API the project's standard requires, README text, and commit messages follow their own standards.
- The level applies to every language in the project; there is no per-language override.
