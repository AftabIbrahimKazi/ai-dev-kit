---
name: claude-all-models
description: Route tasks across the Claude lineup — model selection, delegation, cost/speed trade-offs, cache discipline. Trigger for any model-selection, routing, multi-model, or cost-optimization decision.
---

# All Models — Fleet Protocol

Treat the lineup as one machine with four gears. The single biggest lever for correctness AND cost is routing each task to the cheapest model that reliably does it — then never re-doing work on a bigger model that a smaller one already finished.

## Staleness guard
The lineup table below was verified 2026-09-25. Model lineups change: before load-bearing routing/cost decisions, confirm the current lineup (Models API / platform.claude.com or the claude-api skill). New models slot into the same gear logic; update the table and log the change in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — routing decisions that paid off or backfired, cost surprises, delegation patterns that worked. Merge instead of duplicating; delete disproven bullets.

## The lineup (current, verified)

| Model | ID | Context / Max out | $/MTok in–out | Role |
|---|---|---|---|---|
| Fable 5.1 | `claude-fable-5-1` | 1M / 128K | 10 – 50 | Hardest problems only; long-horizon autonomy |
| Opus 5.5 | `claude-opus-5-5` | 1M / 128K | 4 – 20 | Default flagship: serious coding, agents, review |
| Sonnet 5.5 | `claude-sonnet-5-5` | 1M / 128K | 2 – 10 | Near-Opus coding at volume; interactive work |
| Haiku 4.5 | `claude-haiku-4-5` | 200K / 64K | 1 – 5 | Fan-out, classification, latency paths |

Previous generation, still served (pinned projects, fallback targets): Fable 5 (`claude-fable-5`, 10 – 50), Opus 5 (`claude-opus-5`, 5 – 25), Opus 4.8 (`claude-opus-4-8`, 5 – 25), Sonnet 5 (`claude-sonnet-5`, 2 – 10). New work targets the four rows above.

Per-model depth lives in the sibling skills: `fable-5-1`, `opus-5-5`, `sonnet-5-5`, `haiku-4-5` (previous generation: `fable-5`, `opus-5`, `opus-4-8`, `sonnet-5`) — load the one matching the model you're actually driving.

## Routing rules
1. **Start one gear lower than instinct says.** Escalate on demonstrated failure, not anticipated difficulty. Sonnet 5.5 at `medium`/`high` handles most of what people reflexively send to Opus.
2. **Never retry a failure on the same gear more than once.** Two failures → escalate with the failure context attached ("Sonnet tried X, output was wrong because Y").
3. **Never send finished work back up.** If Haiku classified 500 items, have the bigger model spot-check a sample, not redo them.
4. **Orchestrator high, workers low.** One Opus/Fable orchestrator delegating to Haiku/Sonnet subagents beats one giant model doing everything serially — cheaper and faster.
5. **Match effort before matching model.** Bumping Sonnet `medium → high → xhigh` is cheaper than switching to Opus; try it first. Effort levels are recalibrated per model (Opus 5.5 `medium` ≈ Opus 5 `high`) — re-sweep after every model change, never carry a level over.

## API-surface differences that bite when switching models
- Thinking: Fable 5/5.1 and Opus 5.5 = always on (omit param; `disabled` 400s) · Sonnet 5.5 = adaptive when omitted, `disabled` 400s, off only via `{type:"between_tools"}` at `high` or below · Opus 5 / Sonnet 5 = adaptive when omitted, `disabled` allowed (Opus 5: `high` or below) · Opus 4.8 = off unless `{type:"adaptive"}` set · Haiku = legacy `budget_tokens` only.
- **Forced `tool_choice` (`any`/`tool`) 400s on Fable 5.1, Opus 5.5, Sonnet 5.5** — use `auto` + `strict: true` + a prompt naming the tool. Still allowed on older rows.
- `effort`: supported Fable/Opus/Sonnet (`low`→`max`); errors on Haiku 4.5. Default is `medium` on Opus 5.5, `high` elsewhere — set it explicitly.
- Sampling params: rejected on Fable/Opus/Sonnet 5+; allowed on Haiku.
- Thinking blocks are bound to their producing model and conversation on the 5.5 / Fable 5.1 tier: keep histories append-only, and expect a fallback model to run without them.
- **Switching models mid-conversation invalidates the prompt cache** — spawn a subagent on the other model instead of swapping the main loop.
- Tokenizers differ — re-baseline `max_tokens` with `count_tokens` per model, never reuse counts.

## Cost discipline
- Prompt caching first: stable prefix (tools → system) frozen, volatile content last; verify `cache_read_input_tokens` > 0.
- Batches API = 50% off anything non-latency-sensitive; pair with Haiku for the cheapest possible per-item cost.
- Refusal fallback (Fable 5.1, Opus 5.5, Opus 5, Sonnet 5.5): ship `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"` so classifier declines degrade instead of failing (Claude API only for Sonnet 5.5; other platforms use SDK middleware). `reasoning_extraction` declines are never retried. Older array form: `fallbacks: [{"model": "claude-opus-4-8"}]`.
- Log which model produced what; when reviewing costs, cut by moving traffic down-gear before cutting features.

## Regression eval — not yet built
No harness exists to catch a skill or routing change regressing across the lineup. Not worth building speculatively. **Build it when:** the same skill shows behavior drift after 2+ routing/model changes to it — that's the signal a fixed prompt-set eval would have caught earlier and cheaper than debugging it live.
