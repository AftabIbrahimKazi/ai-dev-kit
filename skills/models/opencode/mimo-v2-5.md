---
name: mimo-v2-5
description: MiMo-V2.5 protocol — Xiaomi's open model, strong SWE-bench Pro and long-horizon agent scores, 1M context, DeepSeek-tier pricing; free tier on Zen. Trigger when working with, routing to, or configuring MiMo-V2.5 (Pro/Free).
---

# MiMo-V2.5 — Dark-Horse Agent Protocol

Xiaomi · open weights · 1M context / 128K max output · ~$0.435 in / $0.87 out per MTok (Pro). Top rankings on SWE-bench Pro, ClawEval, and GDPVal — a long-horizon agentic performer at DeepSeek prices, less battle-tested in the community than the GLM/Qwen/Kimi cluster.

## Staleness guard
Facts verified 2026-07 (web). Newer entrant — reputation and pricing are both still settling; re-verify against the provider / models.dev before load-bearing decisions and log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — where it beat or trailed the established cluster, tool-calling quirks, cost surprises. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Long-horizon agent tasks at low cost: 1M context + strong SWE-bench Pro at DeepSeek-tier pricing — the value alternative to GLM-5.2 for extended agent runs.
- General agentic capability (ClawEval/GDPVal) — broader than the pure coding specialists; suits mixed research + code tasks.
- A free tier (`MiMo-V2.5 Free`) periodically appears on OpenCode Zen — the cheapest way to evaluate it on your real workload.

## Driving discipline
- **Trust but verify:** benchmark scores are strong but community track record is thinner than GLM/Qwen/Kimi — pilot it on non-critical tasks first and log results in `learnings.md` before making it a default gear.
- **Free-tier data caveat:** during free periods collected data may be used to improve the model — never send confidential repos through the free tier; pay for Pro on private work.
- Same 1M-window discipline as GLM-5.2: route by request shape, send only needed context, keep prompts byte-stable for caching.
- Two failures with feedback → escalate to GLM-5.2 with failure context attached.
