---
name: hooks-enforcement
description: Optional Claude Code hook config that mechanically assists AI-01–AI-03 instead of relying on prompt compliance alone. Trigger when installing into a Claude Code project already using coding-standards/ai-standards.md.
---

# Hooks Enforcement — Claude Code Only

`ai-standards.md`'s context-integrity rules (AI-01–AI-03) work by prompt compliance — the model polices itself, which degrades exactly when context pressure is highest. Claude Code hooks can inject deterministic reminders and block tool calls; they cannot verify prose output. This skill automates the *reminder*, not the *verification* — say so plainly rather than overselling it.

**This is Claude Code-only.** `ai-standards.md` remains the authoritative, tool-agnostic contract regardless of whether this is installed — never make any rule depend on this skill being present.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a case this caught, a false block, or a hook exit-code behavior that didn't match what's documented here. Merge instead of duplicating; delete disproven bullets.

## Non-goal
This cannot confirm `[CX]` is honest — only that a proxy artifact exists. Residual reliance on prompt compliance is inherent and stays. Do not describe this as "enforcing" AI-01–AI-03 in project docs; describe it as assisting.

## `handover/` guard (hard rule)
**Hooks configured by this skill must never read, write, or gate on any path under `handover/`.** Lane coordination in `role-session` stays exclusively inside the model-driven claim protocol — a hook racing `locks.md` outside the dev's visibility corrupts claims silently.

## Sample config
`SessionStart` hook — injects the AI-02 declaration reminder into every new session's context, since a model under context pressure is the one most likely to skip it unprompted:
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
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "test -f .claude/.standards-declared || { echo 'Standards not declared yet (AI-02) — state loaded standards, then create .claude/.standards-declared, before editing.' >&2; exit 2; }" }] }
    ]
  }
}
```
The marker file is written by the **model**, as the last step of its AI-02 declaration — never by the hook itself, which only checks for it.

Merge this into the target's `.claude/settings.json` — never overwrite an existing one.

## Staleness guard
Hook exit-code semantics (0 = allow, 2 = block with stderr shown to the model) and event names can change between Claude Code CLI versions. Confirm current behavior against the live Claude Code docs before relying on this in a production project — treat the block above as a starting point, not a guarantee.

## Failure mode this prevents
A session drifting past its context window silently drops the AI-02 declaration and nothing catches it until a later response is discarded for missing `[CX]` — by then the drift has already cost a turn. A hook-level check surfaces the same gap before any edit happens, at zero model-token cost.
