# Pinned to unpinned candidates, 2026-11-15

Safe-to-unpin test, all three must hold: (a) a mod, hook or `skill-hint` route loads the skill when its situation arrives; (b) an A/B or ablation shows no compliance drop; (c) unpinning keeps or lowers session token cost. Any unproven condition means the skill stays pinned.

Tokens = chars / 4 x 1.5 (real-token estimate). A pinned skill's description is always on; its body loads only when the skill fires, so the only steady cost of pinning is the description (about 20 to 35 words, 30 to 55 tokens).

| Skill | Body tokens | Fired automatically by | Usage evidence | Ablation evidence | Verdict |
|---|---|---|---|---|---|
| skill-scope | 3811 | feature-usage, skill-hint (structural: install-kit and handover name it at runtime) | none | none | stay pinned (structural) |
| handover | 2394 | session-journal, precommit-gate, guards read it | none | none | stay pinned |
| coding-standards | 1834 | standards-chain mod | none | none | stay pinned |
| comment-style | 1167 | no mod | none | none | stay pinned |
| session-budget | 1786 | budget-ledger, output-compact, skill-hint | none | none | stay pinned |
| agent-usage | 1702 | no mod | none | none | stay pinned |
| mode-kernel | 1473 | no mod | none | none | stay pinned |
| pre-merge-gate | 1147 | edit-check mod (checks, does not load the skill) | none | none | stay pinned |
| pre-commit | 1510 | precommit-gate mod and skill-hint route | none | none | stay pinned (a holds, b unproven) |
| debug-protocol | 1261 | debug-nudge mod and skill-hint route | none | none | stay pinned (a holds, b unproven) |
| intent-capture | 780 | skill-hint route | none | none | stay pinned |
| plan-first | 1764 | eta-nudge mod and skill-hint route | none | none | stay pinned |
| interpretation-checkpoint | 789 | no mod | none | none | stay pinned |

## Verdict

No skill is safe to unpin today. Condition (b) is unproven for all 13: `~/.ai-dev-kit/usage/log` is empty (the `feature-usage` mod is not enabled in the real settings, so nothing was recorded), and no ablation of a pinned skill has been run. Condition (c) is also weak: unpinning saves one description each (about 40 tokens), and earlier gates measured static trims of that size as invisible (memory `project_kit_audit_2026_11_10`).

Closest candidates, in order: `pre-commit`, `debug-protocol` (a mod and a skill-hint route cover each), then `plan-first` and `intent-capture`.

## To prove a candidate

1. Enable `"feature-usage@ai-dev-kit-mods": true` and collect two weeks of `/kit-usage report` data: a candidate is only worth unpinning if it fires rarely.
2. Run `skill-ablation` on the candidate (archive it, replay 5 prompts that should trigger it, 3 runs per arm, Haiku), and compare rule compliance with the skill present versus archived.
3. Unpin only if the compliance gap is 0 and the hint or mod loaded it in every replay.

No `skill-scope.md`, triggers or install-kit change was made.
