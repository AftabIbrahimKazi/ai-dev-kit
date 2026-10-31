# CLAUDE.example.md

This is a template for your project's session-protocol file, which must sit at the
project root under the name your coding tool auto-loads: `CLAUDE.md` for Claude Code,
`AGENTS.md` for OpenCode and other agents.md-convention tools. (This template's
filename is historical; its body is tool-neutral.) Copy it there, then fill in the
project-specific values.

Do not rename or move this file — it is a template only. The active file must be the
tool's own instruction file at the project root. This file has no effect on its own.

---

# [CLAUDE.md | AGENTS.md] — [Project Name]

This file is auto-loaded by your coding tool (Claude Code, OpenCode, …) at the start of every session. It defines the project context, active standards, and behavioural contract for all AI work on this project.

---

## Session Start Protocol

At the start of every session the AI assistant must:

1. Begin every response with `[CX <Context code>]` (or bare `[CX]` if no code is set below) — it tells the user you have not forgotten the project context
2. On the first response, declare standards as **not yet loaded**
3. Read `coding-standards/index.md` — loads the full standards map — only on the first turn that actually touches a file (edit, create, or a request needing a convention). Conversational, planning, or review-only turns never trigger this read.
4. Once loaded, confirm active standards below and declare them loaded from that point on

If the token is ever missing from a response — or the Context code is missing or wrong — the session has lost context. Stop immediately, discard the response, and start a new session.

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
| Design standard | `coding-standards/design-standards.md` (remove if not applicable). Leads only for new UI from scratch. If a design doc, Figma file or design system exists: after UI work, offer once "Want a UI/UX audit against the design standards?"; never audit or change the design unasked. |
| AI standard | `coding-standards/ai-standards.md` |
| Framework | `coding-standards/frameworks/[framework].md` (remove if not applicable) |
| CSS Framework | `coding-standards/frameworks/[bootstrap OR other].md` (remove if not applicable) |

---

## Project-Specific Context

| Property | Value |
|---|---|
| Context code | [2–4 chars you choose, e.g. `X7` — letters+digit, not a common string like `OK` or `007`; delete this row to use bare `[CX]`] |
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

## AI Behavioural Contract

- Before editing a file, load its standard chain (role table in `coding-standards/index.md`): discipline standard, file-role partial, framework file
- Every response starts with `[CX <Context code>]` (bare `[CX]` if no code is set)
- First response of every session declares standards as not-yet-loaded; standards load lazily on first file-touching turn, not eagerly at session start
- No restating the task, trailing summaries or filler
- Response shape follows the data (RULE AI-18): table for 2+ items with 2+ attributes, one line for one fact, yes/no for yes/no; `/format` overrides
- Where the tool renders links, file references are markdown links, not bare or inline-code paths (RULE AI-17)
- No invented rules — gaps in standards are flagged to the developer
- **Decision preference (every mode):** weigh token efficiency and correct results first, with minimal Agent-tool use (see `agent-usage`, `mode-kernel`).
- Full rules in `coding-standards/ai-standards.md`

---

## Skill Triggers

Load the skill BEFORE the action (a skill not loaded is a rule not applied). Remove rows for skills not installed.

| Situation | Skill |
|---|---|
| About to commit | `pre-commit` |
| About to say a task is done | `pre-merge-gate` |
| A build, test or runtime failure whose cause is not obvious | `debug-protocol` |
| A task touching 3+ files | `plan-first` |

---

## Parallel-Session Coordination

(Remove this section if the project does not use the parallel-session system.)

Before claiming or resuming any task in the parallel-session system (`handover/` — board, locks, per-role handovers), read `handover/PROTOCOL.md` and follow it. Never touch a file that is part of shared or locked work without going through that protocol first.

---

## Project State

For current project state, completed work, known issues, and next steps read `handover.md` in the project root.
