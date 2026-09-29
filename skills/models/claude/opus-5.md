---
name: opus-5
description: Claude Opus 5 (claude-opus-5) protocol — thinking on by default, verbosity/scope/over-verification tuning, subagent caps. Trigger when working with, routing to, or writing code that calls Opus 5.
---

# Opus 5 — Prior-Flagship Protocol

Model ID: `claude-opus-5` · 1M context · 128K max output · $5 in / $25 out per MTok (fast mode $10/$50). Successor to Opus 4.8, superseded by Opus 5.5 (`opus-5-5`, cheaper and stronger) — use this skill only when a project is pinned to Opus 5 or migrating off it.

## Staleness guard
Model facts here (ID, pricing, limits, API rules) were verified 2026-09-25. If a newer Claude generation exists or the API contradicts this file: verify against current docs (Models API / platform.claude.com or the claude-api skill), follow the live source, and log the correction in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd prompt differently. Merge instead of duplicating; delete disproven bullets.

## Hard API rules
- **Thinking is ON when `thinking` is omitted** (opposite of Opus 4.8). `max_tokens` caps thinking plus reply — re-check routes that never set `thinking`.
- `{type: "disabled"}` is accepted **only at effort `high` or below**; it can leak tool calls into visible text or `<thinking>` tags. Prefer adaptive at `low` effort.
- `budget_tokens`, sampling params, assistant prefill → 400. Forced `tool_choice` still works here (it does not on Opus 5.5 / Fable 5.1).
- Classifiers can decline (HTTP 200, `stop_reason: "refusal"`) — check before reading `content`. Ship `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Mid-conversation system messages (no beta) and tool changes (beta `mid-conversation-tool-changes-2026-07-01`) keep the cache warm. No Priority Tier. Separate rate-limit pool from Opus 4.8.

## Prompting patterns that matter on Opus 5
- **Longer responses:** effort doesn't shorten visible output — prompt for it: "Keep responses focused, brief, and concise; disclaimers brief, most of the response on the main answer." Match deliverable length to what the task needs, no filler sections.
- **Delete verification scaffolding.** It verifies unprompted; "double-check your answer" and "add a final verification step" now cause over-verification. Same for "use a subagent to verify".
- **Scope discipline:** add "Deliver what was asked at the scope intended; make routine judgment calls yourself; if a better approach exists, say so in a sentence and continue as asked; finish the whole task before reporting done."
- **Subagents — direction reversed from 4.8:** it delegates freely, multiplying cost. Remove any "delegate more" guidance; cap spawns; no subagents for verification or work finishable in a few tool calls.
- **Self-corrections:** it narrates them at length — instruct it to correct only errors that change the user's outcome, plainly and briefly.
- **TTFT:** on user-facing latency-sensitive routes add "Latency-sensitive; begin your visible answer immediately."
- **Effort:** `low`/`medium` are unusually strong — sweep them first. Code review: report everything with confidence + severity.
