---
name: opencode-all-models
description: Route tasks across open-weight models in OpenCode — GLM, DeepSeek, Kimi, Qwen3-Coder, MiniMax; hosted (Zen/provider) vs. local (Ollama) selection, config gotchas. Trigger for any OpenCode model choice, open-source/open-weight model question, or local-model setup.
---

# OpenCode Open Models — Fleet Protocol

OpenCode is the tool; the open-weight models are its gears. Same principle as the Claude fleet skill (`claude-all-models`): route each task to the cheapest model that reliably does it, and never redo finished work on a bigger one. This skill covers only open-weight models — for Claude models inside OpenCode, use the Claude model skills.

## Staleness guard
The lineup below was verified 2026-07 via web search. Open-weight releases move faster than the Claude lineup — before a load-bearing choice, re-verify against models.dev / OpenCode Zen's tested list, update the table, and log the change in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a routing choice that paid off or backfired, a config gotcha, a model that under/over-performed its benchmark reputation. Merge instead of duplicating; delete disproven bullets.

## The lineup (verified 2026-07)

| Model | License | Context | Strength | Role |
|---|---|---|---|---|
| Big Pickle (Zen) | stealth (≈GLM-4.6) | 200K | ~Sonnet 4.5/4.6-class coding, free for a limited time | Zero-cost daily driver — non-confidential work only |
| GLM-5.2 | MIT | 1M | Open-weight SWE-bench leader; first to beat GPT-5.5 on SWE-Bench Pro | Default for hard, long-horizon engineering agents |
| DeepSeek V4 Pro / V3.2 | MIT | large | Frontier-adjacent reasoning at low cost (~70% SWE-bench Verified) | Cost-efficient deep reasoning and review |
| Kimi K2.6 | open | large | Best agentic multi-attempt coder (71.6% multi-attempt); multimodal, multi-agent | Agentic loops that can retry; multi-agent workflows |
| Qwen3-Coder-480B | Apache-2.0 | large | 69.6% SWE-bench Verified; most permissive license at frontier level | Serious coding when license flexibility matters |
| Qwen3-Coder-Next (80B-A3B) | Apache-2.0 | large | 70.6% SWE-bench Verified at only 3B active params | Self-hosted / GPU-constrained frontier coding |
| MiniMax M3 | open | large | Cheapest of the frontier cluster; high throughput | Fan-out, bulk edits, low-stakes volume work |
| Devstral 2 (123B) | modified MIT | 256K | 72.2% SWE-bench Verified at $0.40/$0.90 | Repo surgery: multi-file fixes, legacy modernization |
| MiMo-V2.5 Pro | open | 1M | Strong SWE-bench Pro / long-horizon agent scores, DeepSeek pricing | Value alternative to GLM-5.2 (less battle-tested) |
| gpt-oss-120b / 20b | Apache-2.0 | large | o4-mini / o3-mini-class reasoning; 1×80GB GPU / 16GB RAM | Self-hosted reasoning + tool-call generalist |
| qwen2.5-coder:7b (Ollama) | Apache-2.0 | set ≥64K | Small, strong tool-calling, runs on 8GB RAM | Local starting point on ordinary hardware |

Per-model depth lives in the sibling skills: `big-pickle`, `glm-5-2`, `deepseek-v4`, `kimi-k2-6`, `qwen3-coder`, `minimax-m3`, `devstral-2`, `mimo-v2-5`, `gpt-oss`, `local-small-models` — load the one matching the model you're actually driving.

## Routing rules
1. **Start one gear lower than instinct.** MiniMax M3 or a mid Qwen handles most of what people reflexively send to GLM-5.2. Escalate on demonstrated failure, not anticipated difficulty; two failures on the same model → escalate with the failure context attached.
2. **Multi-attempt tasks favor Kimi K2.6** — its single-attempt score is midpack but it gains ~6 points when allowed retries; give it retry room instead of escalating after one miss.
3. **License is a routing input.** Anything that ships into a product or gets fine-tuned: prefer Apache-2.0 (Qwen) or MIT (GLM, DeepSeek) and check the actual license text, not the marketing page.
4. **Local vs. hosted:** repo confidentiality or offline → local (Ollama/self-host); otherwise hosted (OpenCode Zen or a provider) — hosted frontier open models beat anything that fits on a workstation GPU.
5. **Never send finished work back up.** Spot-check a sample from the small model; don't redo the batch on the big one.

## OpenCode config gotchas
- Providers come via models.dev (75+); anything OpenAI-compatible works: `@ai-sdk/openai-compatible` + `options.baseURL` in `opencode.json(c)`.
- **OpenCode Zen** is the team's tested-and-verified model list — when a model is on Zen, prefer that route over a raw provider; it's pre-validated for tool-calling in OpenCode.
- **Local context floor: OpenCode needs ≥64K context** to work well. Ollama model tags often default lower — set/pick a ≥64K context variant or the agent silently truncates and degrades.
- Ollama's OpenAI-compatible endpoint is `http://localhost:11434/v1`.
- **Tool-calling support is the local make-or-break** — a model that can't emit tool calls reliably is useless in an agent loop regardless of its code quality. Verify with a trivial file-edit task before trusting a new local model with real work.
- Check VRAM before pulling 70B-class tags; prefer MoE small-active-param models (Qwen3-Coder-Next) for constrained GPUs.

## Cross-tool note
When OpenCode shares a repo with Claude Code under the parallel-session system, model choice changes nothing about coordination: `handover/PROTOCOL.md` and the role-session rules apply identically.
