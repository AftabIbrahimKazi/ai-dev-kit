# Changelog

## 2026-10-27

### Added
- Skills with scripts and commands: `resolve-conflicts`, `responsive-check`, `optimize-assets`.
- `project-context` add-on with `/ctx` and a connector-free `/figma` (exported PNG/SVG, `project-context.figma.js`).
- Commands `/eta`, `/format`, `/pickup`, `/wrap-up`, `/githooks`.
- Rules AI-17 (clickable file references) and AI-18 (response shape follows the data); a Skill Triggers table in the `CLAUDE.md` contract.
- Mods `eta-nudge`, `prefilter-rank`, `output-compact`; pre-commit BLOCK on staged `project-context/` files.
- `install-kit` removes itself after a clean install (`--finish`).
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
