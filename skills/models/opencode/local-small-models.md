---
name: local-small-models
description: Local small-model protocol — running ≤32B coding models (qwen2.5-coder, gpt-oss-20b, small Ollama tags) as OpenCode agents on consumer hardware; context floor, tool-call smoke test, task ceiling. Trigger for any Ollama/LM Studio/local model setup or "run a model locally" request.
---

# Local Small Models — Consumer-Hardware Protocol

The ≤32B tier that runs on ordinary machines via Ollama / LM Studio / any OpenAI-compatible server. Reference picks (verified 2026-07): `qwen2.5-coder:7b` (Apache-2.0, strong tool calling, 8 GB RAM) as the floor; `gpt-oss-20b` (16 GB, best local reasoning — see the `gpt-oss` skill); larger Qwen3-Coder quants as VRAM allows. This tier trades capability for privacy and zero token cost — the protocol is about not pretending otherwise.

## Staleness guard
Facts verified 2026-07 (web). Local-model best-picks churn constantly — re-verify against Ollama's library / models.dev before recommending a tag; log corrections in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a tag that worked/failed, a quant or context config that mattered, a task class this tier can't handle. Merge instead of duplicating; delete disproven bullets.

## Where this tier shines
- Confidential repos and offline work — nothing leaves the machine.
- Zero-marginal-cost iteration: scaffolding, boilerplate, single-file edits, commit messages, grunt transformations.
- As the local worker under a hosted orchestrator when only some content is sensitive.

## Setup rules (the three that decide success)
1. **Context floor: OpenCode needs ≥64K.** Ollama tags default much lower (often 4–16K) and truncate *silently* — set `num_ctx`/serving context explicitly ≥64K, or the agent degrades with no error. This is the #1 local-setup failure.
2. **Tool-call smoke test before real work:** one trivial file-edit task. A model (or quant) that can't emit well-formed tool calls is useless in an agent loop regardless of code quality — quantization can break tool-call formatting even when chat works.
3. **VRAM before pulling:** check the tag's memory need against your GPU; a model swapping to CPU is unusably slow in an agent loop. Prefer MoE small-active-param builds; raising context length also raises memory — budget both together.

Endpoint wiring: expose `http://localhost:11434/v1` (Ollama) or your server's OpenAI-compatible URL, point `opencode.json(c)` at it via `@ai-sdk/openai-compatible` + `options.baseURL`.

## Task ceiling (route honestly)
- In scope: single-file edits, tests for existing code, renames, boilerplate, formatting, simple bugs.
- Out of scope: multi-file refactors, architecture, subtle debugging — two failures with feedback → route up to a hosted open model (see `opencode-all-models`); don't grind a 7B against a frontier-class task.
- Never let a small model review its own nontrivial output — verify with tests or a bigger model's spot-check.
