# CLAUDE.example.md

This is a template for the `CLAUDE.md` file that must sit at the root of your project.
Copy this file to your project root and rename it to `CLAUDE.md`, then fill in the
project-specific values for your project.

Do not rename or move this file — it is a template only. The active file must be
`CLAUDE.md` at the project root. This file has no effect on its own.

---

# CLAUDE.md — [Project Name]

This file is auto-loaded by Claude Code at the start of every session. It defines the project context, active standards, and behavioural contract for all AI work on this project.

---

## Session Start Protocol

At the start of every session Claude must:

1. Begin every response with `[CX]` — signals context is active
2. On the first response, declare standards as **not yet loaded**
3. Read `coding-standards/index.md` — loads the full standards map — only on the first turn that actually touches a file (edit, create, or a request needing a convention). Conversational, planning, or review-only turns never trigger this read.
4. Once loaded, confirm active standards below and declare them loaded from that point on

If `[CX]` is ever missing from a response the session has lost context. Stop immediately, discard the response, and start a new session.

---

## Active Standards

| Standard | Active |
|---|---|
| CSS standard | `coding-standards/css-standards.md` |
| HTML standard | `coding-standards/html-standards.md` |
| Script standard | `coding-standards/[js-standards OR ts-standards OR js-and-ts-standards].md` |
| Git standard | `coding-standards/git-standards.md` |
| Versioning standard | `coding-standards/versioning-standards.md` |
| SEO standard | `coding-standards/seo-standards.md` |
| Performance standard | `coding-standards/performance-standards.md` |
| Accessibility standard | `coding-standards/accessibility-standards.md` |
| QA standard | `coding-standards/qa/index.md` |
| AI standard | `coding-standards/ai-standards.md` |
| Framework | `coding-standards/frameworks/[framework].md` (remove if not applicable) |
| CSS Framework | `coding-standards/frameworks/[bootstrap OR other].md` (remove if not applicable) |

---

## Project-Specific Context

| Property | Value |
|---|---|
| Project name | [Your project name] |
| Framework | [e.g. Astro 6.4.8 / Next.js / None] |
| CSS framework | [e.g. Bootstrap 5 / None] |
| Script standard | [JS only / TS only / JS + TS combined] |
| CSS token prefix | [e.g. `--ex-` / `--ct-` / `--my-`] |
| Selector signature | [e.g. `ex-` / `ct-` / `my-`] |
| Token file | [path to your variables/token CSS file] |
| Global stylesheet | [path to your main CSS file] |
| Entry scripts | [paths to your page entry scripts] |

---

## How to Load Standards Per File

Before editing any file identify its role using the table in `coding-standards/index.md` then load:

1. The relevant discipline global standard (`css-standards.md`, `html-standards.md`, etc.)
2. The relevant file-role partial (`css-standards/component-files.md`, etc.)
3. The relevant framework file if applicable (`frameworks/astro.md`, etc.)

Never edit a file without loading its standard chain first.

---

## AI Behavioural Contract

- Every response starts with `[CX]`
- First response of every session declares standards as not-yet-loaded; standards load lazily on first file-touching turn, not eagerly at session start
- No restating the task before acting
- No trailing summaries after completing work
- No filler phrases
- No invented rules — gaps in standards are flagged to the developer
- Full rules in `coding-standards/ai-standards.md`

---

## Parallel-Session Coordination

(Remove this section if the project does not use the parallel-session system.)

Before claiming or resuming any task in the parallel-session system (`handover/` — board, locks, per-role handovers), read `handover/PROTOCOL.md` and follow it. Never touch a file that is part of shared or locked work without going through that protocol first.

---

## Project State

For current project state, completed work, known issues, and next steps read `handover.md` in the project root.
