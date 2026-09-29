---
name: sonnet-5-5
description: Claude Sonnet 5.5 (claude-sonnet-5-5) protocol — recalibrated effort, between_tools instead of disabled thinking, forced-tool-use ban, verification at low effort. Trigger when working with, routing to, or writing code that calls Sonnet 5.5.
---

# Sonnet 5.5 — Speed-Value Protocol

Model ID: `claude-sonnet-5-5` · 1M context · 128K max output · $2 in / $10 out per MTok (cache reads $0.20) · same tokenizer and prices as Sonnet 5. The current Sonnet: strongest at multistep agentic coding in a real repo, tool use in agent loops, and computer use. For the hardest long-horizon work, route up to Opus 5.5.

## Staleness guard
Model facts here (ID, pricing, limits, API rules) were verified 2026-09-25. If a newer Claude generation exists or the API contradicts this file: verify against current docs (Models API / platform.claude.com or the claude-api skill), follow the live source, and log the correction in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd prompt differently. Merge instead of duplicating; delete disproven bullets.

## Hard API rules (each is a 400 if violated)
- **`thinking: {type: "disabled"}` is rejected.** Omit `thinking` (adaptive, the default). To turn thinking off use `{type: "between_tools"}` — effort `high` or below only, no other field inside `thinking`, no per-message effort changes, Sonnet 5.5 only (drop it before re-sending to any other model). Try adaptive at `effort: "low"` first.
- **Forced `tool_choice` (`any` / `tool`) is rejected.** Use `auto` + `strict: true` + a prompt naming the tool, or structured outputs; verify a call happened and retry if not.
- No `budget_tokens`, non-default `temperature`/`top_p`/`top_k`, or assistant prefill.
- **Thinking blocks are bound to the model and conversation.** Pass them back unchanged; editing earlier turns invalidates later blocks, so keep histories append-only. Other models can't read them.
- **Computer use** on the Claude API / Google Cloud needs `computer_toolset_20260801`; `computer_20251124` 400s there.
- **Advisor tool** rejects Opus 4.8, Opus 4.7, and Sonnet 5 as advisors — pair with Opus 5.5.
- `thinking.display` defaults to `"omitted"`; `"updates"` (beta `thinking-display-updates-2026-08-18`) returns between-tool progress notes as `thinking` blocks — render any non-empty one as a status line.
- Refusals are HTTP 200 with `stop_reason: "refusal"` (categories `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms`) — check before reading `content`. Ship `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"` (Claude API only; it retries only `cyber`/`frontier_llm`).
- No Priority Tier. Rate limits are their own pool — re-check before moving volume.

## Effort — recalibrated, set it explicitly
Levels `low`→`max`, default `high`, but a level no longer means what it did on Sonnet 5. Start `medium` for agentic coding and multistep tool use, `low` for chat/classification/extraction/search; `xhigh`/`max` only with a measured gain. Judge cost per completed task, not per token — it often beats Sonnet 5 at `high` while running at `medium`. **To get less thinking, lower effort** — from `medium` up it thinks briefly before nearly every reply, and "think less" prompts barely work. Vary effort mid-conversation with per-message effort (beta `mid-conversation-output-config-2026-07-01`, adaptive thinking only), not a top-level change (which busts the cache).

## Prompting patterns that matter on Sonnet 5.5
- **Delete workarounds for what got better:** refusal steering, tool-call retry shims, "don't be lazy".
- **Verification at `low` effort:** it may report code changes done with no real check. Add: "When you change code that can be run, built, or type-checked, run a real check that exercises the change before reporting it done. If none can run, say which one you did not run and why."
- **Tool use in chat/knowledge work:** it can answer from memory when a connected tool would serve better and follows "minimize tool calls" literally — remove discouraging language; say when connected sources are preferred.
- **Mid-turn user input:** text placed right after a tool result as a system message (or inside `tool_result`) can read as prompt injection. Deliver user words as a user-turn text block after the last `tool_result`. Skip task budgets on interactive sessions.
- **Tolerant tool handling:** accept a tool name differing only in case, or return `is_error: true` naming the expected name.
- Very literal on scope — state it explicitly. Size `max_tokens` for thinking plus reply (64K for long agentic turns).
