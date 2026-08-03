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

## Where knowledge goes (check before writing a line)

Handover is loaded in full at every session start, so anything parked here is a tax paid forever. Three destinations exist — route deliberately instead of defaulting to the file you happen to have open:

| Content | Destination | Why |
|---|---|---|
| What is true **right now**; the exact resume point | **handover** (this file) | Needed cold, every session |
| A decision and its reasoning; a solved mystery; a non-obvious "why" | **`memory-bank/`** | Durable, indexed, loaded only when its hook matches |
| What happened, session by session; what changed in a file | **git history** | Already recorded, free, complete |

The test is tense, and it is mechanical: **if a sentence is past-tense narrative, it does not belong in handover** — only the single `## Last session` block may be, and only in outcome terms. Everything else past-tense is either a memory-bank fact or already in git.

## Size ceiling — enforced, not aspirational

**Hard ceiling: 120 lines.** Past that the file has stopped being a resume aid and become an archive that every future session pays for.

"Delete aggressively" is a judgment call, and judgment loses to append pressure — at session end you are already editing this file, so everything drifts into it. The ceiling is the guard that doesn't depend on discipline.

**When over the ceiling, demote — don't just delete:**
1. Decisions and solved mysteries → distil into `memory-bank/` one-fact files (+ their `INDEX.md` line, same step).
2. Session narrative → drop it. Git already has it; do not copy it anywhere.
3. Fixed bugs, shipped work, completed steps → delete outright.
4. What remains is current state and the resume point. That is the whole job.

Invoke the `memory-gardener` skill to do this if the file is far over; it owns the pruning pass.

## Rules
- **Outcome language, not process language.** "Venus overlay counters animate on scroll-enter" — not "edited VenusIntroCounters.ts".
- **Never duplicate what git already records** — link commits instead of describing them.
- **One `## Last session` block, overwritten each time.** Never stack dated session sections; that is the single failure mode that turns this file into a log. If you find several, collapse them — the older ones are git history and memory-bank facts.
- **Absolute dates**, never "yesterday"/"last week".
- If the project already has a handover file in a different format, adopt and improve its format rather than replacing it wholesale.

### Parallel mode specifics
- The ceiling is **per role file**, not for the folder — each session reads only its own `<role>.md`, so that is the number that matters.
- **`board.md`: clear `done` rows as part of finishing**, not "when convenient". A board that accumulates completed rows is the same unbounded-growth bug in a different file.
- **`memory-bank/` is shared across roles and owned by none.** Before demoting into it from a role session, claim `memory-bank/INDEX.md` in `locks.md` like any other shared file — concurrent demotions otherwise collide on the index. Release it in the same step you write.
