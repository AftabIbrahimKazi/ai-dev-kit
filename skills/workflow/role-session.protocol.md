# Cross-Tool Coordination Protocol

Tool-agnostic source of truth for every AI coding agent working in this repo — Claude Code, OpenCode, Codex, or anything else. Multiple tools may work this repo **sequentially** (one hits a usage limit, another picks up the same task) or **in parallel** (two tools on two different tasks at once). This file defines the rules that make that safe. It complements the lane mechanics in `.claude/skills/role-session/SKILL.md` (lock claims, git token, charters); where that skill describes *how* a lane operates, this file defines *how sessions start, hand off, and recover across tools*.

Coordination files (all in `handover/`):

- `board.md` — one row per active task: `Role | Task | Files | Status | Started`. The `Files` column lists **every** path the task will touch.
- `locks.md` — per-file claims (with `Claimed` timestamps) + the git token/queue.
- `roles/<role>.md` — role charter (owned paths, forbidden paths, definition of done).
- `<role>.md` — per-role handover note (resume state for that role's task).

---

## 1. Session-start modes

Every session begins in exactly one of two modes. Decide which before touching anything.

### 1a. New task mode — claiming a task from the board

You are starting a task that no session currently owns.

1. Read `handover/board.md` and pick a candidate task.
2. Read that task's **full `Files` list** from its board row.
3. Check **every** path in that list against `handover/locks.md`.
4. Claim the task **only if every file in the list is currently free**. Then proceed under the normal lane rules (claim files at first edit, per the role-session skill).
5. If **any** file in the list is locked by another role/session: **do not start the task.** Either wait, or pick a different board task whose entire `Files` list is free.

The point: the pre-check happens against the *whole* file list up front, so you never start a task and discover a locked dependency halfway through.

### 1b. Resume mode — continuing an in-progress task under the same role

You are continuing a task another session (possibly another tool) already started under a role — e.g. Claude Code got cut off mid-"frontend" task and OpenCode is picking it up as the same "frontend" role.

This is **not a new claim**:

- **Skip the lock pre-check** from 1a. The task's locks already exist and are yours to inherit.
- **Keep the existing lock rows in `locks.md` as-is** under that role. Do not delete and re-claim them.
- Read the role's handover file (`handover/<role>.md`) for the **exact resume point** — last completed step and next step.
- **Verify before continuing:** open the files the handover note references and confirm their current on-disk contents match what the note says they should contain. If they don't (drift — a partial edit, an unrecorded change), stop, report the discrepancy to the dev, and reconcile before writing anything.

---

## 2. Incremental handover writing (the ungraceful-cutoff safety net)

Sessions can end **without warning** — usage-limit exhaustion mid-task gives no chance to write a wrap-up note. Therefore:

- Update your role's `handover/<role>.md` **continuously as you work**, not only at session end. Natural checkpoints: after each completed step, before starting a multi-file edit, after any decision a resumer could reverse.
- Every update must record a **specific resume point**:
  - the **exact last completed step** (e.g. "added the `Files` column to `board.md`; row for task X updated"), and
  - the **exact next step** (e.g. "next: add the lock rows for `src/nav.js` and `src/nav.css`, then edit `src/nav.js` to wire the toggle").
- Vague status ("working on the navbar", "in progress") is not a resume point and is a protocol violation — a cold resumer must be able to continue from the note alone.

If the session then dies abruptly, the note is at most one step stale, and Rule 1b makes resumption cheap.

---

## 3. Stale-lock recovery

Every lock row in `locks.md` carries a `Claimed` timestamp. Locks normally live until task completion — but a dead session can strand them.

- A lock is **suspect** when it has been claimed for an unusually long time relative to its task (hours-to-days with no matching progress, not minutes) **and** the corresponding `board.md` row shows no update over that period.
- A new session **may treat a suspect lock as abandoned** and take over the file/task — but **must log the decision** rather than silently seizing it. Record, in the board row and/or the lock row, something like: `takeover: lock from <role> claimed <timestamp> presumed abandoned, taken by <role/tool> <timestamp>`.
- The log is mandatory so that if the original owner's session comes back, they can see exactly what happened instead of finding their locks mysteriously gone.
- When in doubt — the dev is watching; asking beats seizing.

---

## 4. Opportunistic graceful handoff

Some harnesses surface a signal that a session is nearing its context or usage limit (e.g. a compaction warning). If yours does:

1. Treat the signal as a cue to **proactively prompt the user**: continue working, or halt now for a clean handoff?
2. If the user chooses to halt:
   - Write a **complete, clean handover note** in `handover/<role>.md` (full resume point, decisions, gotchas).
   - **Properly finalize your locks**: release lock rows for finished files; leave in-flight lock rows in place (they are what Rule 1b resumes under) with the handover note stating exactly which locks are held and why.
   - Update your `board.md` row status, then stop.

This is **best-effort and opportunistic** — many cutoffs arrive with no signal at all. Rules 2 (incremental handover writing) and 3 (stale-lock recovery) are the guaranteed fallback for abrupt cutoffs; Rule 4 just makes the handoff cleaner when the harness gives you the chance.
