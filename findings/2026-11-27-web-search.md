# web-search A/B, 2026-11-27

Question: does answering WebSearch from a script (router `/v1/search`, code trim, no model) cost less than Claude's own WebSearch, at the same answer quality?

Setup: `claude -p --model haiku --allowedTools WebSearch --max-turns 5`, scratch project with `.claude/skills/web-search/cli.js`, arm "mod" adds `--plugin-dir mods/web-search`. Three fact questions, two runs per arm, cost from the JSON `total_cost_usd`. The router answers `POST /v1/search` in about 1 s (provider `parallel` in these runs), 5 hits of about 1,500 characters each, cut by the script to 360 characters each.

| question | base cost (2 runs) | mod cost (2 runs) |
| --- | --- | --- |
| Node.js 24 release date | 0.03180 | 0.00868 |
| latest TypeScript version | 0.04430 | 0.01087 |
| Rust founder and 1.0 year | 0.03281 | 0.00888 |
| total | 0.1089 | 0.0284 (-74%) |

Quality: the expected fact was in the answer in 6 of 6 runs on both arms. The TypeScript question has a moving answer; both arms reported 7.0.x.

Time: 93 s base against 79 s with the mod (-15%). Turns: 16 against 20, the model searched or followed up a little more often with the short snippets.

Limits: n = 2 per cell, Haiku only, three questions, one machine, one provider seen. Native WebSearch's cost includes its server-side search pass, which is what is replaced. Snippets are shorter than native results, so questions that need page detail will cost an extra fetch.

Verdict: ships as opt-in (`install-kit mods --web-search on`).

## Context-size check (same day, stream-json, Haiku, 2 runs per arm)

Task: a research question that needed 6 searches (Deno, Bun and Node.js latest major and 1.0 year). Averages per run.

| | native | with the mod |
| --- | --- | --- |
| tool result per search | 2,836 chars | 2,571 chars (-9%) |
| input tokens, last turn | 49,087 | 48,263 (-2%) |
| input tokens, all turns summed | 415,951 | 455,332 (+9%) |
| turns | 10 | 11 |
| cost | 0.0772 | 0.0060 (-92%) |

Finding: the mod does not shrink the context window. Hits are about 9% smaller, but one mod run took 2 more turns, so summed input tokens rose. The cost drop is billing, not context; the likely cause (inferred, not verified) is the per-search charge of native search that the router path does not have. Both arms found the same facts.

To shrink context, lower the snippet size (now 360 characters per hit); that trades detail and needs its own test.

## Shaping variants (offline lab, then end to end)

Question: can a cleverer script, or a filter model, put less text into the context without losing the answer?

Offline lab (no Claude spend): 15 stable-fact questions, 8 raw router hits each, answer = a regex that every raw result set contains (ceiling 15/15).

| variant | answer kept | avg chars sent | time |
| --- | --- | --- | --- |
| full 5 hits | 15/15 | 7,269 | 0 |
| 360-char window (first version) | 15/15 | 2,351 | 0 |
| 200-char window | 12/15 | 1,549 | 0 |
| top 3 hits only | 14/15 | 1,391 | 0 |
| sentence scoring (script) | 15/15 | 2,085 | 1 ms |
| Laya sentence scoring | 14/15 | 1,998 | 8.7 s |
| router-model sift | 15/15 | 528 | 5.1 s |

Naive shrinking (smaller window, fewer hits) loses answers. Laya was slower and no better than the script, so it is rejected. n = 15, single-fact questions, one regex each: an easy test.

End to end (Haiku, the 6-search research task, 2 runs per arm, averages):

| | native | window | sentence | sift |
| --- | --- | --- | --- | --- |
| tool result per search | 2,937 chars | 2,570 | 2,142 (-27%) | 867 (-70%) |
| last-turn input tokens | 49,268 | 48,010 | 47,281 (-4%) | 43,840 (-11%) |
| cost per task | 0.0773 | 0.0060 | 0.0060 | 0.0053 |
| time per task | 18 s | 14 s | 15 s | 45 s |
| turns | 10 | 10 | 10 | 11 |

All four arms found the same facts. Verdict: sentence scoring is the default (free, no latency, 27% smaller results). Sift shrinks context most but is about 3 times slower and one run needed 8 searches and 13 turns (summed input tokens +8% there), so it stays an advanced opt-in (`WEB_SEARCH_MODE=sift`). In this task the system prompt dominates the context (about 48k), so even sift saves only about 3k tokens per 6 searches.
