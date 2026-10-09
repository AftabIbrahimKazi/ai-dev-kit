---
name: mod-writer
description: Write Claude Code mods (function-hook plugins) to the kit's bar — mod vs script vs hook choice, safety rules, validate/test loop. Trigger when creating, reviewing, or improving a mod or anything in mods/.
compat: claude-code-only
---

# Mod Writer — Meta-Skill

**This is Claude Code-only: it needs Claude Code mods (v2.1.287 or later), JS/TS function hooks inside a plugin.** Any rule a mod assists must still work without it.

A mod is unsandboxed code that runs with the user's permissions inside every session. A careless mod breaks sessions silently. This is the bar every kit mod meets. For API details, load the built-in `plugin-authoring` skill; do not copy its API tables here (they change between releases).

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — an API trap, a test-kit quirk, a rule that blocked a bad mod. Merge instead of duplicating; delete disproven bullets.

## Step 0 — Choose the tool
| Need | Use |
|---|---|
| A rule a script can check, in any tool | Script first (a skill companion `<skill>.<name>.js`). A mod is only a trigger wrapper. |
| Judgment, knowledge, style | Skill. A mod has nothing to hook. |
| Block, allow or log one event with a script you have | Settings hook. No mod needed. |
| State shared between events, a `/command`, prompt composition, a model call, rewriting a tool result | Mod |
| Drawing (pane, band, status) | Mod, but only terminal and Desktop draw. The VS Code chat panel runs hooks and draws nothing. |
| Writing under `handover/`, or reading `handover/locks.d/` | Never a mod. `hooks-enforcement` forbids it. |

## Ship gate (priority order)
1. **Correctness:** on a fixed task set, pass rate with the mod is equal or better than without. One regression rejects it.
2. **Tokens:** the ledger (`budget-ledger`) shows a net saving after the mod's own overhead. A mod that only observes must add zero model-visible text.
3. **Speed:** record it. Do not block on it.

## Layout
```
mods/<name>/
  .claude-plugin/plugin.json   name, version, description, author
  hooks/hooks.json             {"modules": ["./register.ts"]}
  hooks/register.ts
  tests/<name>.test.ts
```
- Keep the engine out of the mod. Engines are skill companions (`skills/<cat>/<skill>.<name>.js`); the mod runs the installed copy at `<cwd>/.claude/skills/<skill>/<name>.js`, then `~/.claude/skills/<skill>/<name>.js`. If neither exists, the mod does nothing. A copy inside the mod drifts.
- Write mod files directly. Do not use `claude plugin init`.

## Rules
- **Fail open** for observers and assists: wrap own logic in `try/catch` and end each hook with `.catch(($, e, next) => next(e))`. Only a deliberate gate may fail closed, and its description says so.
- No network. Read only the env vars the mod needs and name them at the end of the `plugin.json` description ("Reads env: HOME." or "Reads no env."). Never read secrets.
- A hook on shell commands matches both `Bash` and `PowerShell` (`{ tool: ['Bash', 'PowerShell'] }`). On Windows the model may run git through either, and a Bash-only gate is silently skipped. Parse PowerShell with its own rules: the backtick escapes, a backslash is a path character.
- Never write under `handover/`; never read or gate on `handover/locks.d/` (role-session lane state). Skip `handover/` before starting work on a path there. A commit-time scan of staged text may read committed handover notes (see `hooks-enforcement`).
- A hook adds model-visible text (`context`, rewritten results, prompt sections) only when that is the mod's purpose. Measure the tokens it adds.
- A reload runs `register` again and resets module variables. Keep durable data in a file or `$.store`.
- Document the off switch: disable in `/plugin`. The mod must do nothing when its engine is missing.

## API traps (found building budget-ledger, verified 2026-10-09)
- `$.clock.now()`, `$.session.id()`, `$.session.usage()` and `$.env.get()` return Promises. Always `await`. A missing `await` gave `Invalid Date`, and the fail-open catch hid it.
- Write each call in full (`$.fs.write(...)`), event names as string literals, and never destructure `$`. `validate` rejects the rest.
- The tool result text is `ran.text`. A deny is `{ deny: "reason" }`. Extra model-visible lines go in `context: string[]`. A rewritten `result` is checked against the tool's schema.
- `$.fs.write` replaces the whole file and creates parent folders. There is no append. `$.fs.read` rejects files over 4 MiB. For a log, keep the text in memory, write one file per session, roll to a new part file well before 4 MiB, and queue the writes through one promise so concurrent hooks cannot drop a row (see `budget-ledger`).
- `session.compact` fires for `precompute` too, which only prepares a summary. Act after `next(e)`, and only on other triggers when the result is not a `skip`.
- On Windows, `$.fs` paths arrive absolute with backslashes. Normalise before comparing.
- The hooks module has no Node and no DOM. Run Node work with `$.process.run(["node", script, ...])` (argv list, no shell, 30 s default timeout).

## Validate and test loop
1. `claude plugin validate <dir>`. Read the `hooks:` and `calls:` lines. They are the review surface and list everything the mod touches.
2. `claude plugin test` from the mod folder. Rules: stub every host call with `on('fs.write', ...)`; register stubs before the first `$` call; use `mock.clock(on, { now })` for time; fire `$.session.start` first; a stub for a mods API call returns `{ value }`.
3. A swallowed error hides in the catch. Temporarily rethrow (`throw new Error('DEBUG ' + String(err))`); the test output then shows `the engine reported:`. Remove the rethrow before commit.
4. End to end, headless: `claude -p "<prompt>" --plugin-dir <dir> --model claude-haiku-5-5 --effort low --output-format json --no-session-persistence --permission-mode acceptEdits --allowedTools "Read,Glob,Grep"`. Hooks run under `-p`; drawing does not. In VS Code the binary is `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe`.
5. Write regexes with backslashes through the Edit tool. Shell heredocs and Python strings mangle them. Use `String.fromCharCode(92)` if needed.
6. The VS Code chat panel is not covered by `-p`. Say so in the report until the user confirms it there.

## Review checklist
- [ ] Step 0 says a mod is the right tool
- [ ] Observers fail open; any gate says it fails closed
- [ ] No network, no secrets, no writes under `handover/`, nothing reads `handover/locks.d/`
- [ ] `validate` passes; `calls:` lines match the intent
- [ ] Tests cover the happy path, a failing host call, and "engine missing"
- [ ] Ship gate evidence recorded (correctness set, ledger tokens)
- [ ] Facts about the API checked against the engine-written types, not memory

## Staleness guard
The mods API is early access. The types the engine writes (`<mod>/.claude-plugin/types/claude-code/index.d.ts`, or the `plugin-authoring` skill's `types/claude-code.d.ts`) outrank this file. If they disagree, follow the types and log the correction in `learnings.md`.
