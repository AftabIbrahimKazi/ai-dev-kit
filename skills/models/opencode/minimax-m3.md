---
name: minimax-m3
description: MiniMax M3 protocol — cheapest frontier-cluster tokens, 1M context, 512K output, video input; fan-out and bulk-edit workhorse. Trigger when working with, routing to, or configuring MiniMax M3 in OpenCode or any harness.
---

# MiniMax M3 — Volume Gear Protocol

Open weights · 1M context / 512K max output · video input · ~$0.60 in / $2.40 out per MTok (~40% under Kimi K2.6). Frontier-cluster coding (69.4% SWE-bench Verified) at the lowest price in the cluster — the open fleet's Haiku: fan-out, bulk work, and huge-context/huge-output jobs.

## Staleness guard
Facts verified 2026-07 (web). Re-verify pricing/limits against the provider / models.dev before load-bearing decisions; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, jobs it handled above/below its weight. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Fan-out and bulk edits: many parallel workers, repetitive multi-file changes, classification/triage over large sets — cost per item is the whole game and M3 wins it.
- Huge single outputs: 512K max output is unique in the cluster — generated scaffolding, large migrations, long structured dumps that would truncate elsewhere.
- Whole-repo context on a budget: 1M window at the cheapest rate — the value option when GLM-5.2's price or latency doesn't pay.
- Video input: the only open-cluster option for video-involved tasks (walkthrough analysis, UI recordings).

## Driving discipline
- **Worker, not orchestrator.** Pair it under a GLM-5.2 or Kimi K2.6 orchestrator; don't hand it the long-horizon plan.
- **Never redo its finished bulk work on a bigger model** — spot-check a sample instead.
- Two failures on the same item → escalate that item with failure context; keep the rest of the batch on M3.
- Big window ≠ free: 1M-context calls still cost real money and latency — send the context the task needs, not the whole repo by default.
