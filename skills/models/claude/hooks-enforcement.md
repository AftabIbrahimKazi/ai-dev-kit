---
name: hooks-enforcement
description: Optional Claude Code hooks for AI-01-AI-03 and a git-commit gate on pre-commit. Trigger when installing into a Claude Code project using ai-standards.md or pre-commit.
compat: claude-code-only
---

# Hooks Enforcement — Claude Code Only

**This is Claude Code-only: it needs Claude Code's hook system (`SessionStart`, `UserPromptSubmit`, `PreToolUse` events in `.claude/settings.json`) — no other tool this kit targets has an equivalent.**

`ai-standards.md`'s context-integrity rules (AI-01–AI-03) work by prompt compliance — the model polices itself, which degrades exactly when context pressure is highest. Claude Code hooks can inject deterministic reminders and block tool calls; they cannot verify prose output. This skill automates the *reminder*, not the *verification* — say so plainly rather than overselling it.

`ai-standards.md` remains the authoritative, tool-agnostic contract regardless of whether this is installed — never make any rule depend on this skill being present.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a case this caught, a false block, or a hook exit-code behavior that didn't match what's documented here). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Non-goal
This cannot confirm `[CX]` (or its Context code) is honest — only that a proxy artifact exists. Residual reliance on prompt compliance is inherent and stays. Do not describe this as "enforcing" AI-01–AI-03 in project docs; describe it as assisting.

## `handover/` guard (hard rule)
**Hooks (settings hooks and mods) must never write under `handover/`, and never read or gate on the lane state in `handover/locks.d/`.** Lane coordination in `role-session` stays exclusively inside the model-driven claim protocol — a hook racing `handover/locks.d/` outside the dev's visibility corrupts claims silently. Two things stay allowed because they cannot race a claim: inspecting a path string (to skip it), and a commit-time scan of staged text, which may read committed handover notes like any other file (`locks.d/` is gitignored and excluded from the scan). A hook that would only re-check handover files, such as a per-edit linter, skips `handover/` entirely: no check applies there, so running it wastes a process.

## Sample config
`SessionStart` hook — injects the AI-02 declaration reminder into every new session's context, since a model under context pressure is the one most likely to skip it unprompted:
<!-- hook:core -->
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "echo 'Reminder: state loaded standards (AI-02) before any work, and write .claude/.standards-declared once done.'" }] }
    ]
  }
}
```
`PreToolUse` hook (matcher `Edit|Write`) — blocks the first edit until the model has completed its own AI-02 declaration:
<!-- hook:core -->
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "test -f .claude/.standards-declared || { echo 'Standards not declared yet (AI-02) — state loaded standards, then create the marker with Bash (touch .claude/.standards-declared; Write is gated by this same hook), before editing.' >&2; exit 2; }" }] }
    ]
  }
}
```
If the `standards-chain` mod is installed it gates the same first edit and makes this hook redundant (two denials for one edit): skip this block then. The marker file is written by the **model**, as the last step of its AI-02 declaration — never by the hook itself, which only checks for it.

`UserPromptSubmit` hook — re-injects the AI-01 reminder on every user message, because the token tends to drop in long sessions once the original instruction is far back in context. It names no code, so it never goes stale; the model reads the code from `CLAUDE.md`:
<!-- hook:core -->
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "echo 'AI-01: begin your response with the [CX] token defined in CLAUDE.md (with the Context code, if one is set).'" }] }
    ]
  }
}
```
Costs roughly 25 input tokens per user message, mostly served from cache after the first turn.

`SessionStart` hook — archives every per-session-archivable skill, so a session starts lean and nobody has to remember to do it. Silent, and fails open (`|| true`):
<!-- hook:core -->
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node .claude/skills/skill-scope/auto.js apply --quiet || true" }] }
    ]
  }
}
```
`UserPromptSubmit` hook — restores an archived skill when the message names one of its trigger words (`skill-scope/triggers.json`). It only adds, never archives, and prints one line only when it restored something. The `/next` command is the explicit version of the same step:
<!-- hook:core -->
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node .claude/skills/skill-scope/auto.js apply --add-only --quiet \"$(node -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).prompt||'')}catch(e){}})\")\" || true" }] }
    ]
  }
}
```

`SessionStart` hook — warns when `handover.md` is over 120 lines, has more than one session section, or a `learnings.md` is over 30 bullets. Prints nothing when all are within limits, so it costs no tokens until a limit is crossed, and fails open:
<!-- hook:core -->
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node .claude/skills/handover/size.js check --quiet || true" }] }
    ]
  }
}
```

**Merge these into the target's `.claude/settings.json` — never overwrite an existing one. Mechanical merge, run it instead of hand-editing:**
```
node <library>/skills/meta/install-kit.cli.js merge-hooks --library <library> --root <target>
```
It reads the six `<!-- hook:core -->`-marked blocks straight from this file (so it can never drift from what's documented here), adds each hook entry to `.claude/settings.json` under its event name only if an identical entry isn't already present, and leaves everything else in the file untouched. The pre-commit-gate pair below is deliberately not included — it's superseded by the `precommit-gate` mod and opt-in on its own, so it is never merged by this command.

## Pre-commit gate

Superseded by the `precommit-gate` mod and never merged by `merge-hooks`. The legacy settings-hook version and what it checks: `hooks-enforcement.extras.md`.

## Reminder-only assist for non-hookable triggers

`SessionStart` hook — for skills with no tool-call event to gate on (e.g. `debug-protocol`'s "two failed fixes" or "hunting a bug" trigger), inject a plain-text reminder instead of attempting to block anything:
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "echo 'Reminder: debug-protocol applies when hunting a bug/regression, or after two failed fixes — invoke it explicitly instead of continuing ad hoc edits.'" }] }
    ]
  }
}
```
This is a nudge, not enforcement — nothing stops the model from ignoring it, same limitation as the base AI-02 reminder above.

## Staleness guard
Hook exit-code semantics (0 = allow, 2 = block with stderr shown to the model) and event names can change between Claude Code CLI versions. Confirm current behavior against the live Claude Code docs before relying on this in a production project — treat the block above as a starting point, not a guarantee.

## Failure mode this prevents
A session drifting past its context window silently drops the AI-02 declaration and nothing catches it until a later response is discarded for missing `[CX]` — by then the drift has already cost a turn. A hook-level check surfaces the same gap before any edit happens, at zero model-token cost.
