# Invariants add-on, script-only gate (2026-11-23)

Scratch payments module, 7 planted real bugs plus 1 harmless edit. "Tests" = 5 happy-path asserts. "Invariants" = 3 seeded stress checks (retry idempotency, conservation incl. self-transfer, refund boundary). No model calls, zero tokens.

| Arm | Real bugs caught | False alarm on harmless edit |
|---|---|---|
| Happy-path tests | 1 of 7 (overdraft) | none |
| Invariant checks | 7 of 7 | none |

- `skills/addons/invariants.cli.js run` proves each check able to fail by mutation; `VACUOUS` flags a check that stays green when broken; `stale` flags covered files changed since `verified`.
- Caveat: one author wrote both arms and knew the bugs, and the tests were deliberately thin. This shows the mechanism works, not the size of the gain on a real project. Next test: one real kit path (batch mod or budget ledger) with rules written without looking at a bug list.
- Not done: wiring into install-kit, README and a `/invariants` command. Waiting for the real-path run.
- Model-assisted authoring and TLA+/Kani backends not built; only revisit if the script version misses bugs a model would catch.

## Real path: skills/meta/ab-gate.js (same day)

9 rules written from the file's header comment, each with its own mutation; then 12 fresh mutants (not the rules' own) run against the existing `tests/ab-gate.test.js` and the rule checks, in a temp copy.

| Pass | Existing tests | Invariant checks |
|---|---|---|
| First pass, 7 rules | 5 of 8 real mutants | 4 of 8 (worse) |
| After adding R8 (verdict equals the definition) and R9 (CLI flags) | 5 of 8 | 8 of 8 |

- The first-pass misses were gaps in my rules, not the tool: R1-R7 only checked "never wrongly accept", so over-rejection (equal score counted as regress), a changed default tolerance, and ignored `--tolerance` / `--min-gain` flags all slipped through.
- `VACUOUS` fired twice on my own mutations (R2, R9): the mutation made the gate stricter, which the rule could not see. The tool caught a bad mutation, which is the point.
- One mutant (drop the base type check) is equivalent, because `Number.isFinite` already rejects non-numbers. The empty-baseline guard is also equivalent (0 gain rejects anyway). No false alarms on either, or on the two cosmetic edits.
- The second row is not independent: R8 and R9 were added after seeing the misses. Fair claim: the loop (run, read the misses, close the rule gaps) works, and a first draft of rules from a header comment is not enough on its own.
- Cost: zero tokens in every run. Rule authoring was the only model work, and it took one extra round.
- Rules live in `invariants/` at the repo root (`invariants.json`, `ab-gate.check.js`); run with `node skills/addons/invariants.cli.js run`.

## probe on more kit scripts (same day)

`probe` auto-generates mutants of a covered file (flipped comparisons, `&&`/`||`, defaults, exit codes) and reports the ones every rule lets through. No model, no tokens. For these scripts the "rules" are their existing test files, so a survivor is a gap in today's tests.

| Script | Mutants | Killed | Survived | Real gaps | Noise |
|---|---|---|---|---|---|
| skills/meta/ab-gate.js (11 rules) | 31 | 29 | 2 | 0 | 2 equivalent, now in probe-ignore.json |
| skills/workflow/handover.size.js | 33 | 29 | 4 | 4 | 0 |
| skills/memory/memory-gardener.stale.js | 25 | 19 | 6 | 6 | 0 |
| skills/meta/install-kit.signature.js | 7 | 3 | 4 | 4 | 0 |

- First `probe` on ab-gate (7 of my earlier rules plus R8, R9) listed 9 survivors: 7 real (the `improved` list, `--json`, one missing flag), 2 equivalent. Rules R10 and R11 killed the 7.
- First version on the other three listed 20 survivors, 6 of them noise (5 from tsc's emitted `__createBinding`-style helper code, 1 from an operator inside a regex literal). Both are now filtered; the remaining 14 all read as real gaps by hand triage (boundary `>` vs `>=` on `maxBullets`/`maxLines`, `json: false` default, `.md` file filter, skipped-directory list, `protocolFile || 'CLAUDE.md'`). Triage was by me, one pass, not independently checked.
- Noise rate after filtering: 2 equivalent of 16 survivors, 12%. Small sample, three scripts plus one.
- Speed: about 23 s for 31 mutants against 11 rule checks; tests of 100 ms each run in seconds.
- The 14 gaps in handover.size, memory-gardener.stale and install-kit.signature are not closed. They are a to-do list for those tests.
- Laya triage of equivalent mutants: not worth building at a 12% noise rate.
- Wired in: bare `invariants` (or `/invariants`) runs rules, probe and stale in one report; command template `skills/commands/invariants.md`; install-kit tests still pass (no change needed, the command installs with its skill).

- Closed the 4 install-kit.signature gaps (protocolFile, missing-row note, remove with no stored row, remove with no file): 5 new tests (54 total), probe now 7 of 7 killed. Still open: 6 in memory-gardener.stale, 4 in handover.size.

## Kit-wide probe (same day)

All 51 kit scripts that have a same-named test (`skills/**/X.js` + `tests/X.test.js`), up to 40 mutants each (12 for figma-code, whose test is slow), the test file as the only check. No model, no tokens. Run in 4 parallel shards, each on a private copy of the kit (parallel runs on one tree are unsafe: tests load other scripts and see each other's mutations).

- **1,807 mutants, 1,068 killed, 737 survived: mutation score 59%.** Every baseline passed; no timeouts.
- Weakest: install-kit.select 33 of 40 survived, diagram.cli 31, skill-scope.device 28, install-kit.cli 27, teardown.cli 25, usage-mine 24, invariants.cli 23 (my own new tool's tests), install-kit.company 22, project-context.figma 22, perf-audit.weigh 20.
- Clean (0 survivors): handover.size, memory-gardener.stale, install-kit.signature, the three closed in this session.
- Triage of a random 20 survivors (one pass, mine): about 13 real behavior gaps (an exit-code check, a default value, plugin detection, input validation, a `> 0` flag), 5 display-only or cosmetic (message text, a line number in a warning), 2 harmless. So most of the 737 are real but many are boundary edits (`>` vs `>=`) of low consequence. Not every one needs a test.
- 30 scripts have no same-named test: 10 are teardown template assets, 14 are named by some other test, 6 are named by none: system1-prefilter.ladder, strata-css.coverage, mcp-manager.image-gen, mcp-manager.local-vision, skill-scope.move (exercised indirectly through install-kit), hooks-enforcement.cx-check.
- Mods (`mods/*`) are TypeScript against the host's test harness and were not probed.
- Tool bug found and fixed during the run: a forced kill (a timeout) left figma-code.cli.js mutated, because Windows skips signal handlers. The tool now writes `<file>.invariants-bak` before each mutation and the next run restores it; it did so for install-kit.company.js when I stopped a run by hand. Restored by hand once, by the tool once.
- Open: the 737 survivors are not closed. The 6 untested scripts and the weakest 5 are the place to start. Raw per-script numbers are not committed (scratch output only).
