# Handover — ai-dev-kit

Updated: 2026-10-28 · Branch: main · **uncommitted work on top of `c8fe6fa`** (nothing from 2026-10-28 is committed or pushed).

## Current state

17 script test files pass (288 tests) and 9 mods pass `claude plugin test` (107 tests). `main` is GitHub plus all of the 2026-10-27 work; on top of that, uncommitted: the `narrate` and `personality` add-ons, `/narration` and `/persona`, README, CREDITS, CHANGELOG, `skills/README.md`, `install-kit.md` and `.gitignore` edits. Review with `git status` and commit when ready. Mods installed at user scope on this machine: `budget-ledger`, `precommit-gate`, `edit-check`. OpenCode is wired globally; the user's own real-OpenCode test of the MCP tools is still pending.

**State on this machine (outside the repo):** the `narrate` Stop hook is wired in `~/.claude/settings.json` (points at the kit's `skills/addons/narrate.speak.js`); Piper (`piper-tts`) and the voice-mode packages are installed under Python 3.11; voices live in `~/.claude/voices/` (`ljspeech`, `joe` are the defaults; `lessac` and `ryan` are unused leftovers, Ryan is non-commercial); `~/.claude/narrate.json` selects Piper with the female voice. No persona is chosen and the `personality` SessionStart hook is not wired.

## Last session (2026-10-28)

- **Built `narrate`** (opt-in): Stop hook reads each reply aloud with Piper; male and female voices; mute, volume, speed, pitch (pitch by resampling, speed by Piper length scale); queue so parallel sessions never cut each other off; default output device via WPF MediaPlayer; `command` engine for cloned voices; `--add-voice` for custom Piper voices; installer asks commands, hotkeys or both; `listen.py` has `Ctrl+Alt` hotkeys and offline Whisper dictation (`Ctrl+Alt+D`). Cross-platform player choice (mac, Linux, Termux) is unit-tested only.
- **Built `personality`** (opt-in): six original personas (female/male x novice/mid/pro), SessionStart injector, install asks one of eight choices (six, none, custom) and copies only that persona. Trimmed from about 340 to 130-160 tokens; Haiku test (6 runs per persona) gave 41-58% shorter replies than no persona.
- **Audit of the whole kit (the four-step request):** all tests green; no hook, command or skill-name collisions except `/narrate` vs the `narrate` skill (renamed the command `/narration`); no redundancy found beyond the documented overlap between `narrate` voice mode and Claude Code's native dictation. Misfires: `narrate` loaded 6 of 6, `personality` 5 of 6 on setup prompts, no false trigger in 10 control runs; the misfire log is empty.
- **Fixed after a user report:** long replies stopped mid-way because narration read only the first 1,200 characters; now chunked, limit is `maxSeconds` (default 300, scales with speed) (checked live: a 2,336-character reply was synthesized and played as 7 pieces).
- **Fixed after a second user report (repeats):** a Stop with no new reply text re-read the previous reply. Each reply is now spoken once (state in `~/.claude/narrate-last.json`, keyed by transcript and entry id); `replay` (`/narration replay`, `Ctrl+Alt+R`) is the only way to hear it again. `NARRATE_TMP` moves the lock and queue so tests never touch a live narration.
- **Fixed from the audit:** `F9` and `Ctrl+Alt+Left/Right` collide with VS Code shortcuts (hotkeys now consumed, dictation on `Ctrl+Alt+D`); code-only replies were silent (now announced); command templates and persona folder did not match install-kit's renamed companion layout; README listed `/githooks-enforcement` (skill is `hooks-enforcement`); README FAQ said the installer never installs packages (now true only for the core installer).
- **Token review:** nothing new is always-on: both add-ons are opt-in, commands use `disable-model-invocation`. No further safe cut found in the existing descriptions (largest are OpenCode model skills, installed only for OpenCode).
- **Docs:** README (new section, command tables, FAQ, SEO tagline, layout), `skills/README.md`, `CREDITS.md` (Piper GPL-3.0 as a separate program, voice licences), `CHANGELOG.md`, `/kit` cheat sheet.
- **Not verified:** the narration hotkeys by a real key press, microphone capture, macOS/Linux/Android audio, the personas on Sonnet or inside a real SessionStart hook.

## Earlier session (2026-10-27)

- **New features audited, merged and pushed.** The untested feature branch was merged with the live `main`, tested in a scratch project, and pushed: 14 of 14 script test files pass, 9 of 9 mods pass `claude plugin test` (104 tests), the git hook blocks a staged key and a `.env`, all 16 commands ran live, 11 of 11 skill prompts triggered on Sonnet. Report and raw data: `findings/2026-10-27-new-features-audit.md` and `findings/data/`; harness: `findings/harness/`.
- **Fixed:** `/resume` and `/hooks` collided with Claude Code built-ins and are now `/pickup` and `/githooks`; `standards-chain` skips `project-context/`; `/eta` mapped in `install-kit`.
- **Built:** connector-free `/figma` (`skills/addons/project-context.figma.js`, 8 tests; handles Figma-style SVGs: named white/black, a note that Figma outlines text by default); `debug-nudge` early reminder.
- **Token cost:** always-on about 2,500 to about 1,950 per session (`disable-model-invocation` on commands, leaner `CLAUDE.md` from `install-kit`, shorter model descriptions). `ai-standards.md` examples left alone on purpose.
- **`debug-nudge` fixed:** it never fired when a pipe (`npm test | tail`) hid the exit code; it now reads failure text too (commit `919cd56`, 12 tests). Live: on an unclear-cause bug `debug-protocol` loaded 3 of 6 with the mod and 0 of 6 without (small sample). The earlier "no effect" result was invalid because the mod could not fire. `pre-commit` is not a problem: it loaded before `git commit` in 30 of 30 haiku runs with something to commit (5 phrasings); on a clean tree it loaded only in the runs where the model went on to commit, which is correct. The earlier misses were a clean-tree artifact of the first scratch project.
- **Not problems after all:** `pre-commit` triggering (30 of 30 with something to commit; the earlier misses were a clean-tree artifact), the `[CX]` marker (24 of 24 on Sonnet and Opus) and AI-18 yes/no length. "Pending tasks": not reproduced headless; the preference to decide and proceed is in memory.
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

- **Voice and persona are opt-in add-ons, never default.** Voices are downloaded at install, never shipped (licences: only public-domain or CC0 defaults). A cloned or character voice is the user's own and stays out of the repo.
- **Persona and narration are wording and playback only.** A persona never changes facts, code or verification; narration never talks to Claude and costs no tokens.
- **Command names must differ from skill names** (`/narration` vs skill `narrate`), as with `/ctx` and `project-context`.
- **Testing slash commands headless from Git Bash needs `MSYS_NO_PATHCONV=1`,** otherwise `/cmd` becomes `C:/Program Files/Git/cmd`.

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
- OpenCode 1.18 with a free model loaded skills 3 of 3 on a clean kit install; its slash-command behaviour beyond `/audit` is unconfirmed. Codex was not run (not installed here). A scratch project with extra files hung OpenCode for an unknown reason (a copy with no kit files hung too), so it is not a kit problem.
- `Compression\ai-dev-kit` is a second clone still on the Oct 10 commit, and the user-scope marketplace points at it, so installed mods lag this repo until it is pulled or the marketplace is repointed to this repo.
- Cloud (IDE/web) Claude sessions push straight to GitHub as author `Claude`; a local clone does not learn about it. Run `git fetch && git status` before starting local work.
- The earlier Cloudflare token note is stale (it expired 2026-10-11); nothing depends on it now. `_sandbox/` is git-excluded and can be deleted when no longer needed.

## Next steps

0. **Newest first:** try `/figma` on a real Figma SVG export (only a hand-made Figma-style file was tested); set the GitHub homepage URL and topics (topics are at the 20 limit); a real example of a "pending task" if it keeps happening; `debug-protocol` still loads only about half the time even with the mod (3 of 6).
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
