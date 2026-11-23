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
