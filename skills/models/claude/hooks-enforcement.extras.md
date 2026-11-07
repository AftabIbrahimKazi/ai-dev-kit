# Hooks enforcement extras

Read only when setting up the legacy pre-commit gate hooks by hand.

## Pre-commit gate (separate from AI-01–AI-03, same hook mechanism)

**Superseded where mods are available (2026-10-09).** The `precommit-gate` mod does this job without bash scripts: it gates both the Bash and PowerShell tools (so it works on Windows), parses the command so text that merely mentions "git commit" is not blocked, scans for leaked secrets (also on `git push`), and runs the `pre-commit` skill's `check.js` on every attempt, so it needs no declaration marker. Install it with `mod-setup`. The settings-hook variant below (`hooks-enforcement.pre-commit-gate.sh` / `-clear.sh`, shipped as companions) stays for projects that want shell hooks. Its marker lives under `.claude/`, and Claude Code asks permission for every write there (and refuses it in headless runs), so expect one approval prompt per commit with it.

Skill triggers that depend on the model noticing a moment in conversation ("this is the done-moment", "this is a bug worth investigating") cannot be hooked — there's no tool-call event to match on. `git commit` is different: it's an actual Bash call, so it's mechanically detectable. This gate hard-blocks it until `pre-commit`'s checklist has actually run.

`PreToolUse` hook (matcher `Bash`) — blocks any Bash call containing `git commit` until the marker file exists:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash .claude/hooks/pre-commit-gate.sh" }] }
    ]
  }
}
```
`PostToolUse` hook (matcher `Bash`) — clears the marker after any `git commit` call, so the next commit needs a fresh declaration:
```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash .claude/hooks/pre-commit-clear.sh" }] }
    ]
  }
}
```
Both scripts live in `.claude/hooks/` (companion files of this skill, install alongside it) and parse the hook's stdin JSON for `tool_input.command`, matching the substring `git commit`. **Known limitation:** substring matching means a Bash command whose *text* merely mentions "git commit" (e.g. `echo "run git commit next"`) also blocks — a false positive, not a false negative. Acceptable trade-off since the failure mode leans safe (over-blocks rather than under-blocks), but don't oversell this as precise command parsing.

The marker (`.claude/.pre-commit-declared`) is written by the **model**, as the last step of actually running `pre-commit`'s checklist — never by the hook itself.

### What the gate checks, beyond the marker

Once the marker exists, the gate script also runs two mechanical checks the `pre-commit` skill would otherwise re-derive by reasoning over `git diff` output every time — moving pure pattern-matching out of the model loop:

1. **Debug leftovers in the staged diff** — greps added lines (`git diff --cached -U0`, excluding `.claude/**`) for `console.log(`, `console.debug(`, `debugger;`, `FIXME`. Blocks with the offending `file:line`s on match. Deliberately excludes bare `TODO` (too common as legitimate deferred work) and doesn't attempt `print(`/language-specific probes — extend the pattern in the script per project if needed.
2. **Commit message format** — extracts the `-m "..."` argument and checks it against Conventional Commits (git-standards RULE G-06/G-07: `type: summary` with type in `feat|fix|patch|style|refactor|chore|docs|test|remove`) and the 50-char header limit (RULE G-08). This assumes the project's `git-standards.md` is still the kit default — if a project overrides commit format, either edit the regex in the script or drop this block.

**Known regex-engine trap (fixed once, documented so it isn't reintroduced):** the diff-header exclusion line originally used plain `grep -v '^\+\+\+'` (BRE). GNU BRE treats `\+` as a quantifier, not a literal `+`, so `\+\+\+` parsed as a degenerate quantifier chain and matched *every* line starting with `+` — silently swallowing all staged additions, not just the `+++ b/file` diff header, and making the debug-leftover check permanently pass with no findings. Fixed by using `grep -vE '^\+\+\+'` (ERE, where `+` needs no escaping as a literal within `\+` under `-E` semantics is unambiguous). Verified via manual stdin-JSON test invocations of the script (bypassing the live PreToolUse gate itself, which intercepts any Bash call whose *text* contains "git commit" — including test payloads — per the substring-matching limitation above).

