# Handover — ai-dev-kit

Updated: 2026-10-27 · Branch: main · `origin/main` is current as of this note.

## Current state

`main` = GitHub plus a session's audit work, rebased onto six commits that a cloud Claude session had pushed on 2026-10-18 (`output-compact` mod, `misfire-log`, `install-kit.verify.js`, stack presets, a Windows `git.exe` fix in `pre-commit.check.js`, README catch-up). All 10 script test files and all 7 mods (81 tests) pass; the mods marketplace validates. Mods installed at user scope on this machine: `budget-ledger`, `precommit-gate`, `edit-check` (the other mods are installed per project only). OpenCode is wired globally; the user's own real-OpenCode test of the MCP tools is still pending.

## Last session (2026-10-27)

- **New features audited, merged and pushed.** The untested feature branch was merged with the live `main`, tested in a scratch project, and pushed: 14 of 14 script test files pass, 9 of 9 mods pass `claude plugin test` (104 tests), the git hook blocks a staged key and a `.env`, all 16 commands ran live, 11 of 11 skill prompts triggered on Sonnet. Report and raw data: `findings/2026-10-27-new-features-audit.md` and `findings/data/`; harness: `findings/harness/`.
- **Fixed:** `/resume` and `/hooks` collided with Claude Code built-ins and are now `/pickup` and `/githooks`; `standards-chain` skips `project-context/`; `/eta` mapped in `install-kit`.
- **Built:** connector-free `/figma` (`skills/addons/project-context.figma.js`, 7 tests); `debug-nudge` early reminder.
- **Token cost:** always-on about 2,500 to about 1,950 per session (`disable-model-invocation` on commands, leaner `CLAUDE.md` from `install-kit`, shorter model descriptions). `ai-standards.md` examples left alone on purpose.
- **`debug-nudge` fixed:** it never fired when a pipe (`npm test | tail`) hid the exit code; it now reads failure text too (commit `919cd56`, 12 tests). Live: on an unclear-cause bug `debug-protocol` loaded 3 of 6 with the mod and 0 of 6 without (small sample). The earlier "no effect" result was invalid because the mod could not fire. `pre-commit` still misses about half the time on haiku.
- **Branches:** the temporary branches were deleted locally and on GitHub; `kit-audit-2026-10-20` is kept locally.
- **Later checks:** `[CX]` marker 24 of 24 and AI-18 yes/no short on Sonnet and Opus; OpenCode loads skills 3 of 3 on a clean install; no repro of "pending tasks" in headless tests (details in the findings file, fifth pass).

## Earlier session (2026-10-21)

- **Audit of what fires.** Mods fire deterministically (standards-chain, edit-check, guard, precommit-gate, debug-nudge live-tested headless; budget-ledger writes real rows). Skills load unreliably: about 9 of 21 right loads, unchanged by wording; the prompts that never loaded one are debug, multi-file and vague requests. Anything that must always happen belongs in a mod or git hook, not a skill.
- **Skill descriptions** (27 of them) now open "Use whenever ... Load this BEFORE ...". Neutral in a 28-skill A/B (tokens -1%, loads 9 vs 12 of 30, within noise). `handover`'s description was reverted to the original: the rewrite lost the "where were we?" trigger in two experiments. `skill-writer` records the measurements.
- **Slash commands** (`skills/commands/`, opt-in, installed by `install-kit` on request): `/audit`, `/commit-check`, `/token-report`, `/quiet`, `/stale`, `/hooks`, `/kit`. Measured vs asking in prose: 51-74% fewer tokens, 17-56% lower cost, correct 3/3, one turn instead of two to five. They only help when the user types them. README has a "Slash commands" section (most useful + full reference tables).
- **New scripts:** `pre-commit.install-hook.js` (installs `check.js` as real git hooks, for humans and for tools with no mods; 10 tests), `memory-gardener.stale.js` (report-only list of memory bullets naming deleted files). `--no-fail` (check.js, audit.js) and `--report-exit` (compact.js) exist because a slash command aborts, without calling the model, when its script exits non-zero.
- **Shelved, not shipped:** a Merkle-tree symbol index (`code-map`). On three.js it cost 2.3x the tokens of plain grep (5.7 vs 2.4 turns) with no accuracy gain; it lives in the git-ignored `shelved/` folder with its own README. A proposal doc suggesting a budget-gate script and auto-pruning was reviewed: its code called a nonexistent audit file and flags (its git hook would have rejected every commit), so only the working ideas were built.
- **Fixed:** log fixtures were converted to CRLF on Windows clones and failed `session-budget.compact.test.js`; `.gitattributes` now marks `tests/fixtures/**` as `-text`.

## Decisions & why

- **Priority order is binding: correctness, then tokens, then speed.** A mod or script ships only if the pass rate is equal or better, then measured tokens show a net saving.
- **Scripts first, mods second; mods for guarantees, skills for judgment.** Measured skill loading is too unreliable to carry a must-happen rule.
- **No skill/mod was removed in the redundancy review.** `comment-style`, `mod-writer`, `hooks-enforcement`, `models/claude`, `plan-first`, `memory-bank`, `guard`, `session-budget`, `intent-capture`, `interpretation-checkpoint` all stay. `intent-capture` and `interpretation-checkpoint` fire in about 1 of 15 runs, but removing them changed nothing measurable and the user chose to keep them.
- **`output-compact` (upstream) is kept, but showed no measurable saving in our one noisy-test run (97k vs 98k tokens).** `/quiet` is the manual version for OpenCode/Codex. Re-measure with the ledger on real sessions before relying on it.
- **`/budget` belongs to the `budget-ledger` mod; the kit's template is named `/token-report`** to avoid a clash.
- **`handover/` rule:** hooks never write under `handover/` and never read or gate on `handover/locks.d/`. Hooks and mods skip `handover/` entirely.
- **`precommit-gate` has no declaration marker.** BLOCK denies every attempt; warnings deny once per staged change set. It also denies chained `git add && git commit` and `commit && push`: run staging, commit and push as separate commands.
- **G-08: the 50-character limit is the whole header line.** Fail open for observers; deliberate denies only in `guard` and `precommit-gate`; `protectedBranches` in `guard` is empty by default.
- **Older, still binding:** global-first for local tools; image generation is hosted only; Laya `english` checkpoint; limit policy 80/90/pause; `opus-as-fable` untouched.

## Known issues

- Mods are verified through `claude -p` only; the VS Code chat panel is not covered. `php -l` in `edit-check` is untested (php is not on PATH).
- The merged result was not re-run through the live-vs-local A/B after the `handover` description was restored; the last full A/B predates the merge. No end-to-end `install-kit` run against the merged tree either.
- Whether OpenCode exposes skills as `/skill-name` is unconfirmed; `/audit` as an OpenCode command was verified, the other commands only in Claude Code.
- `Compression\ai-dev-kit` is a second clone still on the Oct 10 commit, and the user-scope marketplace points at it, so installed mods lag this repo until it is pulled or the marketplace is repointed to this repo.
- Cloud (IDE/web) Claude sessions push straight to GitHub as author `Claude`; a local clone does not learn about it. Run `git fetch && git status` before starting local work.
- The earlier Cloudflare token note is stale (it expired 2026-10-11); nothing depends on it now. `_sandbox/` is git-excluded and can be deleted when no longer needed.

## Next steps

0. **Newest first:** test `/figma` on a real Figma SVG and PNG export; design a harder `debug-protocol` test (unclear cause) with a marker file to prove the reminder arrives; a Codex run; GitHub homepage and topics; a real example of a "pending task" if it keeps happening.
1. **Use the kit as it is for a while, then decide.** Install `/audit`, `/commit-check`, `/quiet` and the git hooks in one real project; read `/token-report` (needs `budget-ledger`) after a week.
2. Repoint the user-scope marketplace to this repo, or `git pull` in `Compression\ai-dev-kit`, then `claude plugin update` the mods.
3. Version-bump script (needs the user's convention); this was already first on the earlier list.
4. Optional: an opt-in hard-stop mod that denies edits after N failed fixes of the same command (the idea from the proposal doc; `debug-nudge` only reminds); a ratchet mod for `code-audit`.
5. Real-OpenCode test of the earlier MCP tools; write `~/.claude/CLAUDE.md` global rules.
6. Revisit skill loading only with a mod or `CLAUDE.md` rule per must-have skill; description wording alone is not the lever.
7. Author Next.js and/or Laravel coding-standards layers if asked (no framework-specific layer exists for either yet; stack presets install the universal set only and say so) — scope as its own piece of work.
8. The `claude/festive-tesla-nl5y59` branch (merged into `main` 2026-10-18) still exists on GitHub; a cloud session's scoped token couldn't delete it (403) — delete manually if not already done.

## Don't touch / gotchas

- **`ai-standards.md` RULE AI-01-AI-16 body text stays byte-identical** unless a rule truly changes.
- **`hooks-enforcement.md`'s hard rule applies to mods too:** never write under `handover/`, never read or gate on `handover/locks.d/`.
- No `.claude/skills/` in this repo on purpose; skill files live at `skills/<category>/<name>.md`; companions are `<skill>.<name>.js`; command templates are in `skills/commands/` and are not skills.
- **Catalogs to update together:** `skills/README.md`, root `README.md`, `skill-scope.md`, `CREDITS.md` for third-party, `mods/.claude-plugin/marketplace.json` for mods.
- **Run the tests:** `node tests/<name>.test.js`; for a mod, `claude plugin test` inside `mods/<name>/` and `claude plugin validate`. The binary is `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe` (not on PATH).
- **Headless test quirks on Windows:** pass multi-line prompts on stdin (arguments get truncated); PowerShell `>` writes UTF-16 files; `rm -rf` with shell variables is blocked (use `${VAR:?}`); a slash-command script that exits non-zero aborts the command.
- **Editing JS/TS with regexes:** backslashes are mangled by shell heredocs and Python strings. Use the Edit tool or `String.fromCharCode(92)`.
- **Node on Windows:** `process.exitCode = n`, not `process.exit()`, after a `fetch`.
- PowerShell tool: a failed `Set-Location` leaves you in the wrong repo; check `Get-Location` before running anything that edits or commits.
- Global script copies drift (`~/.ai-dev-kit/mcp/*.js` are copies of the skill companions); re-copy after editing.
