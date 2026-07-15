---
name: glm-5-2
description: GLM-5.2 protocol — open-weight SWE-bench leader, 1M context, long-horizon agents; latency/caching discipline. Trigger when working with, routing to, or configuring GLM-5.2 (in OpenCode or any harness).
---

# GLM-5.2 — Open-Weight Flagship Protocol

MIT license · MoE 753B total / 40B active · 1M context / 128K max output · ~$1.40 in / $4.40 out per MTok at Z.ai ($0.26 cached input; cheaper via aggregators). The open-weight SWE-bench leader and the default gear for hard, long-horizon engineering agents.

## Staleness guard
Facts verified 2026-07 (web). Open-model pricing and rankings churn — before load-bearing decisions, re-verify against the provider / models.dev and log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens or time, what you'd configure differently. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Long-running, multi-step engineering tasks: it maintains context and follows standards consistently through a full workflow — the open model to trust with a whole feature, not just a function.
- Long-context coding: the 1M window is real, but route by request shape — short queries belong on a cheaper model, not here.

## Driving discipline
- **Latency tax on big contexts:** first-token latency on large-context calls runs 30–90 s. Don't put GLM-5.2 on interactive short-turn paths; use it where the turn does a lot of work.
- **Cache or overpay:** cached input is ~5× cheaper than fresh. Keep system prompts / agent instructions byte-stable across turns; a poor cache hit rate shifts effective input cost 60–70%.
- **Output is the expensive side** ($4.40/MTok) — constrain output verbosity in agent loops; don't let it narrate.
- **Fallback path:** provider queues happen; configure a fallback model (DeepSeek V4 or Kimi K2.6) rather than letting the loop stall.
- MIT license: fine-tuning and commercial shipping are safe, but confirm the shipped license text per release.
