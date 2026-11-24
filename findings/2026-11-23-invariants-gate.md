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

## Closing survivors in the five weakest scripts (2026-11-23 to 24)

Starting survivors out of 40: install-kit.select 33, diagram.cli 31, skill-scope.device 28, install-kit.cli 27, teardown.cli 25. Re-probed after each round; install-kit.cli was re-probed against all seven install-kit test files, because several of them cover it.

| Script | Start | After | What closed it | Left |
|---|---|---|---|---|
| install-kit.select | 33 | 0 | a hang guard in the test, plus 4 tests (vim and capital keys, Home/End and the cursor marker, Buffer input and raw mode, pick order) | 2 equivalent, ignored |
| diagram.cli | 31 | 3 open | golden files for a rich spec (light, dark, HTML), a cycle spec, stack detection (2 projects) and structure detection (2); validation, tokens and missing-logo tests | 3 layout-geometry edits (lines 135, 139, 328) that no spec tried triggers; 3 ignored (2 equivalent, 1 network call) |
| skill-scope.device | 28 | 0 | a golden over 12 fake machines (JSON and text), 5 tests of the real scan with temp folders for every lookup | 14 ignored: Python-version probing, GPU commands, GB-size cache walking, spawn options |
| install-kit.cli | 27 | 5 open | 6 flag and prompt tests, then 3 more (uninstall keeps the signature, first-answer redo, `--active-standards`) | 5 open in the interactive question flow (lines 955, 1226, 1291, 1692, 1732); 4 ignored: compiled boilerplate, a dead function, an rm option, a display truncation |
| teardown.cli | 25 | 0 | a hang guard, golden for 17 `draftSpec` descriptions and 40 `validateSpec` cases, dry-run build, wildcard package exports, `findModels` depth, invalid-JSON error | 13 ignored: 12 sit in code that needs a live Chrome, plus 1 equivalent edit |

- **Biggest single finding: tests that pass while hanging.** A test whose awaited promise never resolves ends the process with exit code 0, so a broken menu looks green. install-kit.select showed 26 of its 33 survivors from this alone. Fixed by an exit guard in install-kit.select and teardown.cli. Still unguarded: narrate-buttons, optimize-assets.convert, plan-first.goldfish, plan-first.reviewer.
- **Golden files do the heavy lifting on deterministic output.** One snapshot of a rendered SVG or a detected spec kills a whole class of arithmetic and boundary edits at once. Cost: they need `UPDATE_GOLDEN=1` and a read of the diff when the output changes on purpose. Path and line-ending differences are normalized so they pass on any machine.
- **Dead code:** `usageModEnabled()` in install-kit.cli is defined and never called.
- **Test authoring gotchas on this machine:** backslashes are consumed once when code is written inline in a shell command, which silently turned `\x1b` into raw escape bytes in one test. Patch scripts are written to files instead.
- **Honest limits:** the 13 + 14 + 4 + 3 ignore entries hide real but untestable code (live browser, real hardware), and ignored entries are keyed by line number, so they go stale when code moves. Remaining open survivors are listed in the table. Not re-probed after the final tests and ignore entries.

## Kit-wide probe, second sweep (2026-11-24)

Same method as the first sweep: all 51 script and same-named-test pairs, up to 40 mutants each (12 for figma-code), 4 shards on private copies, the test file as the only check, ignore list applied.

- **Killed: 1,157 of 1,807 = 64.0%** (first sweep 1,068 = 59.1%). Survivors open 610 (was 737), ignored as untestable or equivalent 40. Killed or ignored: 66.2%. Every baseline passed.
- Five scripts changed: install-kit.select 33 to 0, skill-scope.device 28 to 0, teardown.cli 25 to 0, diagram.cli 31 to 3, install-kit.cli 27 to 14. The other 46 scripts are unchanged. 6 scripts now have no open survivors.
- install-kit.cli shows 14 here, not the 5 recorded above, because this sweep checks only tests/install-kit.cli.test.js; the 5 figure ran against all seven install-kit test files, whose siblings cover more of it. The honest read is 5 to 14 depending on how much of the suite counts.
- Weakest now: usage-mine 24, invariants.cli 23 (the new add-on's own probe code, covered only by 16 tests), install-kit.company 22, project-context.figma 22, perf-audit.weigh 20, teardown-film.cli 20, teardown-sound.cli 20, session-budget.compact 20.
- Process note: two of the four shards crashed at start on the first launch (Windows would not delete leftover copy folders from the first sweep) and were relaunched on fresh folder names. A fixed per-shard folder name is fragile; use a unique one per run.
- Next candidates: usage-mine, invariants.cli, install-kit.company, project-context.figma, perf-audit.weigh. The 6 scripts with no same-named test are still untested.

## The next five weakest scripts (2026-11-24)

Same method as before: survivors out of 40 mutants, test file as the only check, ignore list applied, each re-probe on a private copy of the kit (a probe of invariants.cli.js itself must not run against its own live file).

| Script | First sweep | Now | How |
|---|---|---|---|
| usage-mine | 24 | 0 | synthetic transcripts covering every block shape, golden of the miner and the CLI (text, JSON, --days, --out, usage-log merge), median and tie-break cases, malformed records, `--days 0` and negative |
| project-context.figma | 22 | 0 | golden for PNG, three WebP kinds and JPEG edge shapes, SVG sizes, colors and fonts, token parsing, a folder scan and the CLI; boundary tests for a tied nearest token, a JPEG ending at its scan limit, type-size order |
| invariants.cli (the new add-on's own code) | 23 | 0 | exact error text and exit codes for the rules file, a mutation at character 0, exact probe report lines, comment and string handling, the bare command's three sections and exit codes, every option flag |
| install-kit.company | 22 | 0 | golden over scan, routes, overlap, signature and a sync and remove in each defaults mode, title and clip limits, signature threshold, protocol file other than CLAUDE.md, README line, repeat sync |
| perf-audit.weigh | 20 | 0 | golden for a big build, font-display states, html findings, summary caps 1 to 40, heavy chunk and image order |

- Ignored (7 more): equivalent or unreachable edits, each judged by reading the line: a loop bound, a `//` check where the character at that index is a slash, a redundant `endsWith` clause, an empty-list `takeRows` call, a rm option, and a missing-input branch that an earlier error makes unreachable.
- **Kit-wide at the last full measurement: 1,256 of 1,807 killed = 69.5%** (first sweep 59.1%, second 64.0%), 504 open, 47 ignored, 8 scripts clean. After the last few tests the open count should be about 499. That figure was not re-measured as a whole sweep.
- **A weak test fixture can hide a bug class.** perf-audit.weigh's test data was pseudo-random bytes that gzip compressed well, so no test chunk ever crossed the 150 KB limit and the chunk-ordering and heavy-chunk code was never exercised. xorshift bytes fix it. Check that a fixture really reaches the threshold it is meant to test.
- Next weakest: teardown-film.cli 20, teardown-sound.cli 20, session-budget.compact 20, skill-writer.lint 19, astro-page.conventions 19, responsive-check.probes 19.

## Round four, and a read of the snapshots (2026-11-24, ON HOLD)

Tests written for teardown-film.cli, teardown-sound.cli, session-budget.compact, skill-writer.lint and astro-page.conventions (snapshots of plans, DSP output, compaction, lint rules over a synthetic kit, scan and check over six project shapes, plus CLI paths). Survivors out of 40 at the first reprobe, before the review fixes and the extra tests below: film 20 to 15, sound 20 to 5, compact 20 to 5, lint 19 to 1, astro 19 to 5. A second reprobe was stopped before it finished, so the final numbers for these five are not measured. Ignore entries were added for live-recording code, equivalent loop bounds and an unreachable spawn-error branch.

Reading the snapshot outputs for correctness found these small defects in the scripts (none fixed; the snapshots pin today's behavior):
- skill-writer.lint `sk-desc-load` accepts any description containing the word "before": the "load ... before" test is subsumed by the plain "before" test, so "Use whenever a form fails, before release." passes with no Load instruction.
- astro-page.conventions `inline-script` reports the line of the first `<script`, not the inline one; one `is:inline` script anywhere hides every other inline script.
- astro-page.conventions colour check is case-sensitive (`HSL(...)` missed); a one-line `:root{--x:#fff}` counts as a hardcoded colour; a one-line `<style>` that also contains `var()` hides its other hardcoded colours and foreign tokens; `.min.css` files and `url(a.png)` inside CSS pollute prefix detection (the selector prefix came out null in the fixture).
- teardown-film `--sound FILE` is not checked for existence in the plan (the automatic score is). From reading the code, a typo fails only after rendering starts and a write to the closed ffmpeg pipe may hang; not run.
- teardown-film `status --json` exits 0 when ffmpeg is missing, while the text form exits 3.
- teardown-sound `--seed abc` silently becomes seed 1.
- Verified correct: compaction kept all 525 failure lines across the cases, mastering hit -14 LUFS and the -2 dBFS peak in 15 of 15 cases, loudness gating ignores silence and an -80 dB passage identically, perf-audit.weigh thresholds, the device presets, the company sync in all three modes.

Mistakes in my own snapshots found and fixed in the same read: lint 50- and 51-word cases both under the cap, a `.claude/` path case that contained `{{skill-root}}`, two compact CLI snapshots that depended on this machine's shell and a space in the Node path, an astro selector check that never ran (selector prefix came out null), and a loudness tolerance that was tighter than a straddling block allows.

Resume: see "Invariants add-on" in the local handover and `invariants/sweep.js` (a documented driver that sweeps a private copy of the kit, optionally one script or one shard at a time).
