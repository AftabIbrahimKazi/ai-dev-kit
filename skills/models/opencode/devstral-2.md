---
name: devstral-2
description: Devstral 2 protocol — Mistral's agentic coding specialist, 72.2% SWE-bench Verified, 123B dense, 256K context. Trigger when working with, routing to, or configuring Devstral 2 (2512) in OpenCode or any harness.
---

# Devstral 2 — Codebase Surgeon Protocol

Mistral AI · modified MIT license · 123B dense · 256K context · ~$0.40 in / $0.90 out per MTok (a free OpenRouter tier exists). 72.2% SWE-bench Verified — top of the open-weight pack, purpose-built for agentic coding: codebase exploration, multi-file changes, failure-detect-and-retry.

## Staleness guard
Facts verified 2026-07 (web). Re-verify pricing/license against the provider / models.dev before load-bearing decisions; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, what wasted tokens, what you'd configure differently. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Repo-level surgery: bug fixing, legacy modernization, multi-file refactors — it tracks architecture-level context and framework dependencies through a change, not just the open file.
- Best SWE-bench-per-dollar in the frontier open cluster at $0.40/$0.90 — a serious rival to Qwen3-Coder for the volume-coding slot.
- Dense (not MoE) — behavior is more uniform across niche languages/domains where MoE routing can be spotty.

## Driving discipline
- **Coding specialist** — route general reasoning, product thinking, or long-document work to GLM-5.2 / DeepSeek V4 instead.
- Dense 123B is heavy to self-host (needs multi-GPU or aggressive quantization) — prefer hosted; for self-hosting under constraint, Qwen3-Coder-Next is the better fit.
- **"Modified MIT"** — read the actual modification before shipping or fine-tuning; don't assume plain MIT.
- 256K context: for whole-repo-in-context tasks route to GLM-5.2 or MiniMax M3 (1M) instead.
- Free-tier endpoints may train on your data — never send confidential repos through them.
- Two failures with feedback → escalate to GLM-5.2 with failure context attached.
