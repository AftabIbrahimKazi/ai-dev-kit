---
name: big-pickle
description: Big Pickle protocol — OpenCode Zen's free stealth coding model (community-identified GLM-4.6, ~Sonnet 4.5/4.6-class), 200K context; free-tier caveats and exit plan. Trigger when working with, routing to, or asked about Big Pickle on OpenCode.
---

# Big Pickle — Free Stealth Workhorse Protocol

OpenCode Zen · stealth (identity undisclosed; community consensus: GLM-4.6 by Zhipu AI) · 200K context / 32K max output · **$0 in/out/cached for a limited time**. Roughly Claude Sonnet 4.5/4.6-class on coding — frontier-adjacent quality at zero token cost, which makes it the default daily gear while the free period lasts.

## Staleness guard
Facts verified 2026-07 (web). A stealth free model is the least stable fact in the fleet: the free period WILL end, and the underlying model can be swapped without notice. Re-verify on Zen before relying on it; log changes in `learnings.md`.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — task classes it handled or fumbled, behavior shifts suggesting a model swap, quirks vs. documented GLM behavior. Merge instead of duplicating; delete disproven bullets.

## Where it shines
- Daily-driver coding at zero cost: features, fixes, refactors that would otherwise burn paid tokens — route here first, escalate only on demonstrated failure.
- 200K context covers most single-feature work; it is NOT the 1M tier — whole-repo context jobs go to GLM-5.2 / MiniMax M3.

## Driving discipline
- **Free = training data.** During the free period, collected data may be used to improve the model. Never send confidential or client repos through it — paid models only for private work. This is the non-negotiable rule of this skill.
- **32K max output is the tightest in the fleet** — chunk large generations (multi-file scaffolds, long migrations) into multiple turns, or route huge-output jobs to MiniMax M3 (512K out).
- **Watch for silent swaps:** stealth models change underneath their codename. If behavior shifts noticeably (tool-call format, verbosity, quality), note the date in `learnings.md` and re-verify what it is before trusting prior lessons.
- **Have the exit plan ready:** when the free period ends, the closest paid equivalents are GLM-5.2 (same family, stronger) or DeepSeek V4 (cheapest comparable) — see `opencode-all-models` for current routing.
- Treat its lessons as GLM-family lessons — prompting patterns that work on it usually transfer to `glm-5-2`.
- Two failures with feedback → escalate to a paid frontier open model; free doesn't justify grinding.
