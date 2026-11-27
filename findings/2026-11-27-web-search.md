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
