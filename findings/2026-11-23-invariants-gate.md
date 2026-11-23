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
