# Usage mine report

37 session(s), 562 prompt(s), 10 retry(ies), 193 tool error(s). feature-usage logs: none found (transcripts only).

| skill | loads | sessions with retry after load | retry rate | median session tokens |
|---|---:|---:|---:|---:|
| plugin-authoring | 4 | 2 | 50% | 580763 |
| cli-writer | 1 | 0 | 0% | 303124 |
| kassandra | 1 | 0 | 0% | 680063 |

Reading it: a retry follows a negative reply or a repeated prompt after the skill loaded. It is a hint, not proof the skill caused it. Low loads with zero retries make an unpin candidate only after an ablation run (skills/meta/ab-gate.js).

## Verdicts (efficiency plan, 2026-11-16)

- Stage 1 done: `skills/meta/usage-mine.js` runs on the 37 local transcripts at zero model cost. The feature-usage log folder holds no rows (the mod is not enabled in the user's settings), so this report is transcripts only.
- The data is too thin to flag anything. Only 3 skills loaded through the Skill tool in 37 sessions (plugin-authoring 4, cli-writer 1, kassandra 1). Reads of kit files in these sessions are authoring work on the kit itself, not skill use. 10 retries in 562 prompts.
- Stage 4 (unpin): no pinned skill has usage data. Verdict unchanged: none safe to unpin. Re-run after two weeks with feature-usage enabled in a project that installs the kit.
- Stage 2 (script-first): no skill body is flagged by the data, so no A/B arms were run (they would spend tokens with no target). Standing candidates: `install-kit`, `skill-scope`, `teardown`, `code-audit`, `narrate`.
- Stage 3 (split): one zero-behaviour move shipped. Four paragraphs describing the installer CLI's own internals (4,614 bytes, about 1,150 tokens) moved from `install-kit.md` to a new "Terminal fallback internals" section of `install-kit.extras.md`, verbatim, with a pointer. No instruction the model acts on was removed. `install-kit.md` went from 35,254 to 30,855 bytes (-12.5%). No A/B arm was run: a verbatim move of non-actionable text cannot change behaviour. All tests and kit-lint pass.
