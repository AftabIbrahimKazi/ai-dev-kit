# Changelog

## 2026-11-01

### Added
- `security-audit` skill and `QA-SEC-14` to `QA-SEC-20` in `coding-standards/qa/security-checks.md`: authorization per resource, sinks, fail-closed, enumeration, gated debug access, atomic check-then-act, fix plus regression test. Adapted from Cloudflare's MIT `security-audit-skill`.
- `ui-design` skill and `coding-standards/design-standards.md` (`DES-01` to `DES-15`): says what to build, not only how to write it, in Floor/Reflex/Finish tiers. Adapted from Hallmark (MIT). Both skills are archivable.
- `design-audit-offer` mod: after the second UI file edit in a project with a design source, adds one line so the model offers a UI/UX audit once. Added because the same instruction in `CLAUDE.md` was ignored in headless runs; live run showed the offer line. Reminder only.
- Skill-list trims measured with `/context` on the full kit: 2,980 -> about 1,940 tokens. 11 skills are manual-only (`disable-model-invocation: true`: the four writers, `skill-ablation`, previous-generation model protocols); the ten OpenCode model protocols are now read-on-demand files in `opencode-all-models/models/` (rename ledger rows added; migrations keep every old `learnings.md`); 29 descriptions shortened.
- Every skill's `learnings.md` step is now conditional: read only when the `learnings-inject` mod supplied it, append only for a new non-obvious lesson. In test runs 21% of tool calls only touched that file.
- `comment-style`, `intent-capture` and `interpretation-checkpoint` bodies trimmed; the protocol template got a one-line comment rule.
- File naming convention in `CONTRIBUTING.md` (skill names 24 characters or fewer, file names 30 or fewer, 3+ `.md` companions in a folder) with `tests/naming.test.js` enforcing it.
- Token trims: 30 skill descriptions shortened (triggers kept); `CLAUDE.example.md` lost a duplicated section; `handover` and `plan-first` now keep their rarely used parts in companion files (`handover/extras.md`, `plan-first/delegated.md`) that load only when needed, cutting about 1,000 tokens from each `handover` load and about 800 from each `plan-first` load.
- `marker-guard` mod: enforces AI-01. When a main-loop reply lacks the `[CX]` marker (or its Context code), shows one warning line beneath it. It never writes the marker itself, since that would fake the signal. `ai-standards.md` and `CLAUDE.example.md` now state the purpose: the marker lets the user see the AI has not forgotten the project context.

## 2026-10-31

### Added
- `.aiignore`: a gitignore-style list of files the AI should leave alone. `code-audit` skips them (`--json` reports the count as `aiIgnored`), and the new `aiignore-guard` mod enforces it in four layers: `.aiignore`, paths that belong to another role (from `conflict-roles.json`: the active role's `out` list, or anything another role lists under `in` that the active role does not; the role is detected from the prompt, `AI_ROLE` or role-session), the current task's scope (`/focus`, else the role's `handover/board.md` Files cell) and folders local Laya is confident the prompt does not need. A first Read, Edit, Write, Grep, Glob or shell command on such a path is denied with the snag protocol (rank names with `prefilter`, retry the exact path once; role, scope and Laya denials unlock the whole top-level folder), and unscoped Grep/Glob results come back without ignored and out-of-role files. `code-audit` also caches its commit and branch findings per ref state (`.claude/code-audit.cache.json`), about 20% faster on repeat runs.
- `enhance_image` and `ai_edit_image` in `image-gen`: `enhance_image` edits existing photos with ImageMagick (presets, brightness/contrast/saturation/warmth/gamma/sharpen/denoise/resize; no AI, no quota, original never overwritten). `ai_edit_image` makes small prompt-driven edits with Gemini, falling back to Cloudflare SD 1.5 img2img, sharing the existing daily caps. Verified against fake servers only; the stored keys returned 401 live.
- `cli-writer` meta skill: the standard for CLI tools and installers (zero dependencies, prompts only on a real terminal, `--dry-run`/`--json`, exit codes, colour rules, Windows path handling, novice-first docs, cold-start and non-TTY tests), distilled from `install-kit`, `narrate.setup` and `local-vision`. Archivable; used only when building the kit.
- `command-writer` meta skill: the quality bar and registration checklist for slash commands in `skills/commands/` (script first, one scoped permission, capped output, no hidden writes, tested on the exact injected line). Archivable like `skill-writer` and `mod-writer`; used only when building the kit.
- `version-bump` skill + `/version-bump` command: bumps a `package.json` version (major/feature/patch/alpha/beta/rc/release per `coding-standards/versioning-standards.md`) and inserts the matching `CHANGELOG.md` entry in place, without reformatting either file. Scope is a path: omitted bumps every `package.json` under the current directory, a folder scopes to a group, a direct `package.json` path scopes to one package — so one command covers the whole project, a frontend/backend split, or a single module.

## 2026-10-29

### Added
- `install-kit.cli.js`: install/update/uninstall/archive/unarchive/merge-hooks run as one deterministic script instead of a narrated file copy, tracked by a `.ai-dev-kit.json` manifest at the target root so later runs only ever touch what the kit itself put there.
- `archive`/`unarchive` commands: move a skill in and out of `<tool-dir>/skills-archive/` without hand-moving files; `handover`'s per-session archive step now calls this instead of a manual move.
- `merge-hooks` command: pulls the `<!-- hook:core -->`-marked sample hook JSON straight out of `hooks-enforcement.md` and merges it into `.claude/settings.json`, deduped, never touching anything else already there.
- A standalone interactive terminal mode in `install-kit.cli.js`, built on Node's own `readline` (no package install required): any command run with a flag left out, on a real terminal, now asks for exactly what's missing as a plain numbered menu ("1) claude  2) opencode  3) codex — type a number"). For OpenCode, Codex, or anyone running the script directly with no multiple-choice chat tool in the loop; Claude Code always passes every flag explicitly, so this path never fires for it.
- `install-kit.md`'s own conversational flow now defaults to multiple-choice clicks (`AskUserQuestion`) at every decision point instead of typed prose, with typing reserved for genuinely open-ended answers (an override's specifics, a hand-picked skill list, a rejected context-code suggestion).

### Changed
- All 27 kit companion scripts ported `.js` → `.ts` (root `package.json` + `tsconfig.json`, `npm run build`). Both are committed: the `.js` is the real shipped artifact (a target project never runs a build), the `.ts` is how it's maintained.

### Removed
- `install-kit`'s self-removal step (`install-kit.verify.js --finish`, added 2026-10-27). `install-kit` is no longer copied into a target project at all, so there is nothing left to remove — every command now runs from the library against `--root <target>`.

### Fixed
- `wavSeconds` (`narrate.speak.ts`) and `readDims` (`optimize-assets.convert.ts`) were missing `export`, left over from the TypeScript port — their own test files were silently failing on the compiled output.

## 2026-10-28

### Removed
- Narration hotkeys and voice dictation: `narrate.listen.py`, the hotkey launcher and the `--controls hotkeys|both`, `--dictate` and `--startup` options. They depended on a global keyboard hook that did not fire reliably and could clash with other shortcuts. Use the `/narration` command or the VS Code controls (`extensions/narrate-buttons`) instead.

### Added
- `extensions/narrate-buttons`: a VS Code extension with one footer button that opens a tray of every control, and an AI Dev Kit sidebar that controls narration and persona without hotkeys (`node extensions/narrate-buttons/install.js`).
- `narrate` modes: `--mode manual|auto`. **Default is now `manual`**: the Stop hook keeps each reply and `--play` (the Play button) reads it, like claude.ai. Set `--mode auto` to speak every reply as before.
- `narrate` default voices are now British: `en_GB-jenny_dioco-medium` (female, Jenny (Dioco), attribution required) and `en_GB-northern_english_male-medium` (male, CC-BY-SA 4.0), easier to listen to in long sessions. Installs that only have the older American voices keep using them until `setup.js --voices` downloads the new ones.
- `prefilter-rank` mod 0.2.0 starts Laya in the background on the first qualifying Grep/Glob when it is set up but not running.
- README reference sections: everything at a glance (what runs by itself and what to ask for), the complete skills catalog (65 skills, by category), all nine mods, every script and the git hooks, the full narration, hotkey, dictation and persona reference, and a table of where each piece lives and how to turn it off.
- `narrate` and `personality` add-ons with `/narration` and `/persona` (first listed under 2026-10-27; this entry records the final behavior).

### Fixed
- Narration hotkeys use `Ctrl+Alt` combinations and consume the key, and dictation moved from `F9` to `Ctrl+Alt+D`, so they no longer fire VS Code's own shortcuts (`F9` toggles a breakpoint).
- Replies are read in full. The old 1,200-character cap cut long replies off mid-way; speech is now chunked by sentence (next piece synthesized while the current one plays), the limit is time-based (`maxSeconds`, default 300, converted to characters at the current speed, ceiling 12,000), and past it the rest is announced as on screen.
- A reply is spoken exactly once: a Stop with no new reply text (a turn that ends on a tool call, a notification) used to find the previous reply and read it again. `replay` (`/narration replay`, `Ctrl+Alt+R`) is now the only way to hear it again.
- A reply that is only code or a table is announced ("Code and tables are on screen") instead of being silent.
- Parallel replies queue and play in order instead of cutting each other off; playback uses the current default output device.
- The narration command is `/narration`; `/narrate` collided with the skill of that name. Companion file names follow the installed layout (`<skill-root>/narrate/speak.js`).
- Persona injection cut from about 340 to 150 to 190 tokens per session, with a rule that completeness beats the word limits. Checked for accuracy on 20 objectively graded questions: same results as no persona on Haiku and Sonnet.
- `README` listed `/githooks-enforcement`; the skill is `hooks-enforcement`.

## 2026-10-27

### Added
- Skills with scripts and commands: `resolve-conflicts`, `responsive-check`, `optimize-assets`.
- `project-context` add-on with `/ctx` and a connector-free `/figma` (exported PNG/SVG, `project-context.figma.js`).
- Commands `/eta`, `/format`, `/pickup`, `/wrap-up`, `/githooks`.
- Rules AI-17 (clickable file references) and AI-18 (response shape follows the data); a Skill Triggers table in the `CLAUDE.md` contract.
- Mods `eta-nudge`, `prefilter-rank`, `output-compact`; pre-commit BLOCK on staged `project-context/` files.
- `install-kit` removes itself after a clean install (`--finish`).
- `narrate` add-on: a Stop hook that reads each reply aloud (Piper male and female voices, Windows fallback, or any command for a personal cloned voice) with mute, volume, speed and pitch, a `/narration` command, `narrate.listen.py` global hotkeys and voice mode (offline dictation typed into the chat box), and `narrate.setup.js`, where the user picks slash commands, hotkeys or both.
- `personality` add-on: six original personas (female and male at novice, mid and pro levels) that change how replies are worded, injected by a SessionStart hook; `/persona` command; the install asks for one of eight choices (six personas, none, or custom) and copies only that persona; users can replace any persona with their own file.
- `findings/`: audit report, raw results and the test harness.

### Changed
- `/resume` renamed `/pickup`, `/hooks` renamed `/githooks` (both collided with Claude Code built-ins).
- `debug-nudge` also reminds at the first failed verification command of a session.
- `standards-chain` skips `project-context/`.
- Token cost: command templates use `disable-model-invocation: true`; `install-kit` writes a leaner `CLAUDE.md`; model-skill, `hooks-enforcement` and `misfire-log` descriptions shortened. Normal-install always-on cost about 2,500 to about 1,950 tokens.
- README intro, command tables and counts brought up to date.

### Known limits
- `debug-protocol` does not always load by judgment (the `debug-nudge` mod raises it; 3 of 6 vs 0 of 6 on an unclear-cause bug); the mods and git hooks are the reliable layer. `pre-commit` loads reliably when there is something to commit.
- Not run end to end: `/figma` against a real Figma export, real image conversions, OpenCode and Codex.
