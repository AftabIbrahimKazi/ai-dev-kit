---
name: misfire-log
description: Opt-in add-on: logs a skill, mod or addon that should have triggered but did not. Trigger only when configured per "Setup"; never install by default.
---

# Misfire Log — Opt-In Add-On

**This is opt-in only, never part of any default install.** It adds one gitignored file and two scripts; nothing else in the kit depends on it, and nothing degrades if it is absent.

## What this is, precisely

A misfire is any gap between what the kit was supposed to do and what happened: a skill that should have loaded but was never read, a mod that should have fired but had nothing to catch, an addon that was installed and configured but went unused, or a task that reached for a direct/manual path instead of the kit's own tool. This skill gives the agent one place to record a misfire the moment it notices one — mid-task, in a debug session, or at handover — instead of it staying a one-off memory that never reaches the kit maintainer. `misfire-log.report.js` later turns the log into the same kind of table a human would otherwise hand-build after an incident review.

This skill never blocks or slows a task to log something. Logging is a side note, not a gate: append after the task has moved on, never make the user wait on it.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a misfire category that kept recurring, a noise source worth excluding). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Setup (once per project, at install or whenever the user opts in later)

1. Confirm the user wants this on — it is off by default.
2. Create `.claude/misfires.jsonl` lazily (the append script creates it on first write) and add `.claude/misfires.jsonl` to the project's `.gitignore` if not already covered by a broader `.claude/` ignore.
3. Nothing else to configure. No key, no network call, no service.

## When to log (trigger)

Log a misfire as soon as any of these becomes clear, without waiting to be asked:
- A skill whose trigger text plainly matched the task was never read (caught retrospectively, e.g. during `debug-protocol` or `handover`, or because the user says a kit feature "didn't work" or "went unused").
- A mod that should have caught something (a denied path, a bad commit, a repeated test failure) produced no block and no reminder when it should have.
- An addon (`mcp-manager`'s companions, `system1-prefilter`) is configured and healthy but the task used a direct/manual path instead (e.g. called a provider's API directly rather than through the addon's CLI).
- The user explicitly reports a miss ("you should have used X", "why didn't Y fire").

Do not log: a skill correctly skipped because it was out of scope for the task, or an addon correctly skipped because it was never configured. Those are not misfires.

## How to log

Run:
```
node misfire-log.append.js --kind skill|mod|addon --name <name> --side kit|assistant --expected "<what should have happened>" --actual "<what happened instead>" [--evidence "<file/log/line that shows it>"]
```
- `--side kit`: the plumbing itself was wrong or missing (no trigger text matched, wrong default config, a routing line never got written) — fixable in the kit.
- `--side assistant`: the plumbing was fine but the task didn't reach for it (never checked, never invoked, stopped searching too early) — fixable in a skill's wording or a mod's deterministic catch, not just "try harder."
- Keep `--expected`/`--actual` to one line each; put detail in `--evidence` as a path or short quote, not a paragraph. This file is read back in aggregate, not line by line.

## Reviewing the log

`node misfire-log.report.js [--file .claude/misfires.jsonl]` prints counts by `name`, by `kind`, and by `side`, and lists the most-repeated `(kind, name)` pairs first — the ones worth fixing in the kit before anything that happened only once. Run it before writing a kit update, not during a task.

## Scope

This is a logging aid, not a detector. It never infers that a misfire happened — it only gives the agent (or the user) a fast, structured way to record one that was already noticed by some other means (a debug session, a user report, a mod's silence where it should have spoken). Pairs naturally with `debug-protocol` (log before moving on from a fix) and `handover` (log before session end if anything misfired that session).
