---
name: qwen3-coder
description: Qwen3-Coder protocol — 480B flagship and Next 80B-A3B for self-hosting; Apache-2.0, cheapest frontier coding tokens. Trigger when working with, routing to, self-hosting, or configuring any Qwen3-Coder variant (incl. via Ollama).
---

# Qwen3-Coder — Apache Workhorse Protocol

Apache-2.0 · two tiers, one family:
- **480B-A35B** — 69.6% SWE-bench Verified · 262K context · ~$0.22 in / $0.90 out per MTok. The license-clean frontier coder.
- **Next (80B total / 3B active, 2026-02)** — 70.6% SWE-bench Verified · 262K context · ~$0.11 in / $0.80 out per MTok. Hybrid attention + MoE, RL-trained for agentic tasks; matches its big sibling at a fraction of the compute — the self-hosting pick.

## Staleness guard
Facts verified 2026-07 (web). Qwen releases iterate fast — re-verify variants/pricing against the provider / models.dev before load-bearing decisions; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, hosting configs that mattered. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Cheapest frontier-grade coding tokens on the market — the default for high-volume coding pipelines.
- Anything that ships or gets fine-tuned: Apache-2.0 is the most permissive license at this capability level.
- Self-hosting: Next's 3B active params make frontier coding feasible on constrained GPUs where dense 70B-class models don't fit.

## Driving discipline
- **Prefer Next unless proven otherwise** — it slightly outscores the 480B on SWE-bench at half the price; use the 480B only where Next demonstrably fails.
- **Self-hosted context floor:** OpenCode needs ≥64K context — set the serving context explicitly (Ollama tags often default lower and truncate silently).
- **Verify tool-calling on your own harness** before real work: quantized/self-hosted builds can degrade tool-call formatting even when code quality holds. One trivial file-edit task is the smoke test.
- Coding specialist, not a generalist — route broad reasoning/product-thinking tasks to GLM-5.2 or DeepSeek V4 instead.
- Two failures with feedback → escalate to GLM-5.2, don't grind.
