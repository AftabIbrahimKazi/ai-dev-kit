---
name: fable-5-1
description: Claude Fable 5.1 (claude-fable-5-1) protocol — selection, always-on thinking, preserved-thinking rules, progress updates, autonomy and scope prompts. Trigger when working with, routing to, or writing code that calls Fable 5.1 (or Mythos 5.1).
---

# Fable 5.1 — Maximum-Capability Protocol

Model ID: `claude-fable-5-1` · 1M context (default and max) · 128K max output · $10 in / $50 out per MTok (cache reads $0.25). Same tier and price as Fable 5, with three breaking changes. `claude-mythos-5-1` (Project Glasswing only) is the same model minus the history-editing check. Every rule exists to convert this price into results a cheaper model can't produce.

## Staleness guard
Model facts here (ID, pricing, limits, API rules) were verified 2026-09-25. If a newer Claude generation exists or the API contradicts this file: verify against current docs (Models API / platform.claude.com or the claude-api skill), follow the live source, and log the correction in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply every relevant lesson.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd prompt differently. Merge instead of duplicating; delete disproven bullets.

## When to route work here
Only the top of the difficulty range: long-horizon autonomous runs, hard architecture/debugging other models failed, first-shot builds of well-specified systems. At `low` effort it is often competitive with Opus/Sonnet on cost per task — evaluate that before defaulting down a gear. Routine work belongs on Opus 5.5.

## Hard API rules (each is a 400 if violated)
- **Omit `thinking`** (or `{type: "adaptive"}`); thinking is always on. `disabled` and `budget_tokens` are rejected. No sampling params, no prefill.
- **Forced `tool_choice` (`any` / `tool`) is rejected** — new vs Fable 5. Use `auto` + `strict: true` + a prompt, or structured outputs.
- **Thinking blocks are bound to the producing model** (other models drop them unbilled) **and to the conversation** (preserved thinking): truncating old turns, rebuilding earlier messages, or refreshing `system` per request invalidates them. Keep histories append-only; accounts created on/after 2026-08-31 get a 400 on edited history. Use per-turn `clear_at: "next_user_message"` system messages instead of inject-then-delete.
- Raw chain of thought is never returned; text between tool calls returns as progress `thinking` blocks (empty by default) — set `thinking: {type: "adaptive", display: "updates"}` (beta `thinking-display-updates-2026-08-18`).
- Handle `stop_reason: "refusal"` before reading content; ship `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Requires 30-day data retention (ZDR orgs get 400). No Priority Tier.
- Per-message effort: beta `mid-conversation-output-config-2026-07-01` (keeps the cache; a top-level change does not).

## Getting the most out of it
- **Full spec up front, one turn**, with the reason behind the request. De-prescribe: goal + constraints, not steps; "CRITICAL: YOU MUST" scaffolding hurts.
- **Effort:** start `high` and re-run your sweep — levels don't map from Fable 5. `medium` roughly matches Fable 5 at lower cost. At `xhigh`/`max` set large `max_tokens`; long deliverables may be drafted twice (thinking + reply) — run those at `high`.
- **Autonomy:** for unattended runs say the user isn't watching, proceed on reversible steps, end the turn only when done or blocked — and check the last paragraph isn't a plan or promise.
- **Scope:** "Don't fix, optimize, or extend beyond the request; report follow-ups in the summary; commit tests only where the task or repo convention calls for them."
- **Fewer updates than Fable 5:** request `display: "updates"`, remove old "don't narrate" text, then add a short before/after cadence line if wanted. If the harness hides tool output, tell the model.
- **Edits:** it over-rewrites files — "minimize tokens used editing files; surgically edit rather than rewrite when the result is the same."
- **Batching:** implied independent reads may be one-per-turn in agent loops; measure the multi-call share before adding a batching nudge.
- **Low effort:** searches less and answers from memory on fast-moving names — raise effort for those turns or instruct search-first.
- Plan for multi-minute turns: stream, generous timeouts, non-blocking subagents.
