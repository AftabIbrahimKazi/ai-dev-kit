---
name: kimi-k2-6
description: Kimi K2.6 protocol — best multi-attempt agentic coder, 95.9% tool-use accuracy, multimodal UI generation, agent swarms. Trigger when working with, routing to, or configuring Kimi K2.6 in OpenCode or any harness.
---

# Kimi K2.6 — Retry-Native Agent Protocol

Moonshot AI · open weights · 256K context · ~$0.95 in / $4 out per MTok · multimodal. Midpack single-attempt coder (65.8% SWE-bench Verified) that becomes the best open agentic coder when allowed retries (71.6% multi-attempt) — near-perfect tool calling (95.9% Tau-2).

## Staleness guard
Facts verified 2026-07 (web). Re-verify pricing/limits against the provider / models.dev before load-bearing decisions; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd configure differently. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Agentic loops with verification: give it a test suite or checkable criterion and room to retry — its ~6-point multi-attempt gain is the whole reason to pick it.
- Tool-heavy workflows: the 95.9% tool-use accuracy makes it the safest open model for long tool-call chains.
- Vision-to-UI: converts prompts and screenshots/mockups into working interfaces — the open pick for design-to-code.
- Multi-agent orchestration: built for agent-swarm decomposition; suits orchestrator-worker patterns.

## Driving discipline
- **Budget for retries up front.** One K2.6 attempt is not its real capability; configure the loop for 2–3 verified attempts before judging output or escalating.
- **Don't escalate after a single miss** — that forfeits its main edge. Escalate to GLM-5.2 only after retries with feedback still fail.
- 256K context is the smallest of the frontier open cluster — for whole-repo context tasks, route to GLM-5.2 or MiniMax M3 (1M) instead.
- Output side ($4/MTok) is the cost driver in retry loops — keep verification feedback terse so retries stay cheap.
