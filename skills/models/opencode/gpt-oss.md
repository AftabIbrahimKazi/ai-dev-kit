---
name: gpt-oss
description: gpt-oss protocol — OpenAI's Apache-2.0 open-weight pair (120b on one 80GB GPU, 20b on 16GB); harmony format requirement, tool-calling strengths. Trigger when working with, routing to, or self-hosting gpt-oss-120b/20b.
---

# gpt-oss — OpenAI Open-Weight Protocol

Apache-2.0 · MoE, MXFP4-quantized at training time · two sizes:
- **120b** — o4-mini-class reasoning/tool use; fits a **single 80 GB GPU** (H100/MI300X).
- **20b** — o3-mini-class; runs in **16 GB memory** — the strongest reasoning that fits a laptop.

Reasoning-and-agentic generalists with strong tool calling (Tau-Bench), not coding specialists.

## Staleness guard
Facts verified 2026-07 (web). Re-verify against OpenAI's model card / models.dev before load-bearing decisions; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what worked, serving configs that mattered, harmony-format gotchas. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Self-hosted agent loops on modest hardware: 20b is the best local option for reasoning + reliable tool calls on a 16 GB machine — above the qwen2.5-coder tier, below datacenter models.
- Single-GPU deployment: 120b on one 80 GB card is the cheapest self-hosted frontier-adjacent reasoner.
- Tool-call-heavy, reasoning-heavy tasks; native structured outputs and code execution.

## Driving discipline
- **Harmony format is mandatory.** The models were trained on OpenAI's harmony response format and malfunction without it. Standard serving stacks (Transformers chat template, Ollama, vLLM) apply it automatically — but if tool calls come out garbled on a custom stack, check harmony first, it's the #1 failure cause.
- **Not a coding specialist:** for pure SWE-bench-style repo work, Qwen3-Coder or Devstral 2 outscore it — pick gpt-oss when reasoning/tool-use matters more than raw code quality, or when hardware dictates.
- Adjustable reasoning effort (low/medium/high) — set it per task like Claude's `effort`; high effort on simple edits burns tokens for nothing.
- OpenCode's ≥64K context floor applies when self-hosting — set serving context explicitly.
- Two failures with feedback → escalate to a hosted frontier open model rather than grinding locally.
