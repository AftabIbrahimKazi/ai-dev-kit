---
name: handover
description: Maintain handover.md so sessions resume cold with zero re-explaining. Trigger at session start, before ending one, or on "handover", "wrap up", "where were we", "resume".
---

# Handover — Session Continuity Protocol

Cold-start context rebuilding is the biggest hidden token cost in long-running projects. This skill makes `handover.md` in the project root the single source of session-to-session truth.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — what a fresh session was missing, what sections proved useless. Merge instead of duplicating; delete disproven bullets.

## Mode detection (first thing, every time)
- **Classic (sequential):** project has a single `handover.md` (or nothing) → the protocol below, unchanged.
- **Multi-role (parallel):** project has a `handover/` folder (board + per-role files + locks) → the same protocol applies **per role**: read/write `handover/<role>.md` instead of the root file, and follow the `role-session` skill for boards, locks, and git. The structure below is identical; only the file location and scope (one role's state, not the whole project's) change. Never create the `handover/` structure unprompted — the user activates parallel mode.

## On session start
1. Read `handover.md` in the project root. If it exists, treat it as authoritative current state — do NOT re-derive project state by re-reading files it already summarizes.
2. Verify only what it flags as in-flight (e.g. `git status` if it says "uncommitted work on X").
3. If it doesn't exist, offer to create one after the first meaningful unit of work.

## On session end (or when asked to wrap up)
Update `handover.md` — update in place, never append an ever-growing log. Structure:

```markdown
# Handover — <project name>
Updated: <date> · Branch: <branch>

## Current state
2–4 sentences: what works, what's mid-flight.

## Last session
What was done, in outcome terms (not a tool-call log).

## Decisions & why
Only decisions a future session could accidentally reverse. One line each: decision — reason.

## Known issues
Bugs/quirks confirmed real, with repro hint. Delete when fixed.

## Next steps
Ordered, concrete, small enough to start immediately. First item = the exact resume point.

## Don't touch / gotchas
Things that look wrong but are intentional; fragile areas.
```

## Rules
- **Outcome language, not process language.** "Venus overlay counters animate on scroll-enter" — not "edited VenusIntroCounters.ts".
- **Delete aggressively.** Anything shipped, fixed, or stale comes out. The file's value is inversely proportional to its length past ~1 page.
- **Never duplicate what git already records** — link commits instead of describing them.
- **Absolute dates**, never "yesterday"/"last week".
- If the project already has a handover file in a different format, adopt and improve its format rather than replacing it wholesale.
