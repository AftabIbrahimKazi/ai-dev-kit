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
