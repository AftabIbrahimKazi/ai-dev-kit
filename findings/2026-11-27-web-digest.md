# web-digest A/B, 2026-11-27

Question: does answering WebFetch from a script (Obscura text dump, code trim, one free-router call) cost less than Claude's own WebFetch, at the same answer quality?

Setup: `claude -p --model haiku --allowedTools WebFetch --max-turns 5`, scratch project with `.claude/skills/web-digest/cli.js`, arm "mod" adds `--plugin-dir mods/web-digest`. Three real pages, two runs per arm, cost from the JSON `total_cost_usd`. The main-session input tokens (about 80k) are the same in both arms: they are the system prompt, not the page.

| page | base cost (2 runs) | mod cost (2 runs) | change |
| --- | --- | --- | --- |
| Wikipedia, Node.js (long) | 0.02049 | 0.00922 | -55% |
| MDN, Fetch API | 0.01088 | 0.00858 | -21% |
| nodejs.org/en/about (short) | 0.00982 | 0.00963 | -2% |
| total | 0.0412 | 0.0274 | -33% |

Quality: the expected fact was in the answer in 6 of 6 runs on both arms.

Time: 93 s base against 157 s with the mod for the six runs (one 49 s outlier on the short page). The script path adds a browser fetch (0.6-10 s) and a router call (0.4-11 s, `auto` picks a different model each time).

Limits: n = 2 per cell, Haiku only, three pages, one machine. Short pages show no saving; the gain comes from long pages. Native WebFetch's own small-model pass is what is being replaced, so the saving appears in the cost, not in the main-session token count.

Verdict: ships as opt-in (`install-kit mods --web-digest on`). Not a default: latency is worse and short pages gain nothing.
