---
name: opus-5-5
description: Claude Opus 5.5 (claude-opus-5-5) protocol — always-on thinking, medium default effort, forced-tool-use ban, cheaper-than-Opus-5 flagship. Trigger when working with, routing to, or writing code that calls Opus 5.5.
---

# Opus 5.5 — Flagship Protocol

Model ID: `claude-opus-5-5` · 1M context · 128K max output · $4 in / $20 out per MTok (cache reads $0.20, fast mode $8/$40) · knowledge cutoff June 2026. The current Opus and the default flagship: long-running agentic coding, code review, knowledge work, and visual reading — at a lower price than Opus 5, typically using fewer tokens per solved task.

## Staleness guard
Model facts here (ID, pricing, limits, API rules) were verified 2026-09-25. If a newer Claude generation exists or the API contradicts this file: verify against current docs (Models API / platform.claude.com or the claude-api skill), follow the live source, and log the correction in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd prompt differently. Merge instead of duplicating; delete disproven bullets.

## Hard API rules (each is a 400 if violated)
- **Thinking is always on.** `{type: "disabled"}` and `budget_tokens` 400 at every effort level. Omit `thinking`; control depth and latency with `effort` (use `low` where TTFT matters).
- **Forced `tool_choice` (`any` / `tool`) is rejected.** Use `auto` + `strict: true` + a prompt naming the tool, or structured outputs; verify a call happened and retry if not.
- No `temperature`/`top_p`/`top_k`, no assistant prefill.
- **Thinking blocks are bound to the model and conversation** (preserved thinking). Keep histories append-only; a fallback to Opus 5 runs without them. Accounts created on/after 2026-08-31 are enforced on history edits.
- **Computer use** on the Claude API / Google Cloud needs `computer_toolset_20260801`.
- Text between tool calls returns as progress-update `thinking` blocks, empty by default — set `display: "updates"` (beta `thinking-display-updates-2026-08-18`) or `"summarized"` if you render them. Read responses by block `type`, not position.
- Classifiers: `cyber`, `bio`, and `reasoning_extraction` decline as HTTP 200 + `stop_reason: "refusal"`. Ship `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`; `reasoning_extraction` declines are not retried. Remove any prompt that asks it to write out its own reasoning.
- No Priority Tier. Fast mode is Claude API only (`speed: "fast"`, beta `fast-mode-2026-02-01`). Separate rate-limit pool.

## Effort — default is `medium`, set it explicitly
Default dropped from `high` (Opus 5) to `medium`. In testing `medium` matches or beats Opus 5 at `high` on coding and knowledge work; `low` is often close at far lower cost. Start `medium`, test neighbors, reserve `xhigh`/`max` for measured gains. At a given level it thinks *more* than Opus 5, especially at `xhigh`/`max` — lower effort before adding "think less" prose. Size `max_tokens` for thinking plus reply (64K for long agentic turns). Vary per turn with per-message effort (beta `mid-conversation-output-config-2026-07-01`) to keep the cache warm.

## Prompting patterns that matter on Opus 5.5
- **Re-test Opus 5 instructions** (conciseness, anti-over-verification, scope) — keep as starting points, drop what evals show is no longer needed.
- **Frontend design:** general "avoid a generic AI look" just swaps defaults; name specific patterns to avoid, then iterate.
- **Visual inputs:** it reads charts, diagrams, and screenshots precisely out of the box — re-test old scaffolding. For the densest inputs, give it a crop/zoom tool.
- **Code review:** report everything with confidence + severity, filter downstream.
- **Long turns** at `xhigh`/`max`: plan timeouts, stream, show progress.

## Token discipline
- Cache-first layout; cache reads are 0.05× input, so a miss costs relatively more — append-only histories, stable prefix. Verify `cache_read_input_tokens`.
- Fan cheap sweeps down to Haiku 4.5 or Sonnet 5.5; keep Opus 5.5 as orchestrator.
