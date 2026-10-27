# Changelog

## 2026-10-28

### Added
- README reference sections: everything at a glance (what runs by itself and what to ask for), the complete skills catalog (65 skills, by category), all nine mods, every script and the git hooks, the full narration, hotkey, dictation and persona reference, and a table of where each piece lives and how to turn it off.
- `narrate` and `personality` add-ons with `/narration` and `/persona` (first listed under 2026-10-27; this entry records the final behavior).

### Fixed
- Narration hotkeys use `Ctrl+Alt` combinations and consume the key, and dictation moved from `F9` to `Ctrl+Alt+D`, so they no longer fire VS Code's own shortcuts (`F9` toggles a breakpoint).
- Replies are read in full. The old 1,200-character cap cut long replies off mid-way; speech is now chunked by sentence (next piece synthesized while the current one plays), the limit is time-based (`maxSeconds`, default 300, converted to characters at the current speed, ceiling 12,000), and past it the rest is announced as on screen.
- A reply is spoken exactly once: a Stop with no new reply text (a turn that ends on a tool call, a notification) used to find the previous reply and read it again. `replay` (`/narration replay`, `Ctrl+Alt+R`) is now the only way to hear it again.
- A reply that is only code or a table is announced ("Code and tables are on screen") instead of being silent.
- Parallel replies queue and play in order instead of cutting each other off; playback uses the current default output device.
- The narration command is `/narration`; `/narrate` collided with the skill of that name. Companion file names follow the installed layout (`<skill-root>/narrate/speak.js`).
- Persona injection cut from about 340 to 130 to 160 tokens per session.
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
