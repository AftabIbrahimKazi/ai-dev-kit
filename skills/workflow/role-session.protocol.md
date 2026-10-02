# Cross-Tool Coordination Protocol

Tool-agnostic source of truth for every AI coding agent working in this repo — Claude Code, OpenCode, Codex, or anything else. Multiple tools may work this repo **sequentially** (one hits a usage limit, another picks up the same task) or **in parallel** (two tools on two different tasks at once). This file defines the rules that make that safe. It complements the lane mechanics in the `role-session` skill (`<skill-root>/role-session/SKILL.md` — `.claude/skills/` on Claude Code, `.opencode/skills/` on OpenCode; lock claims, git token, charters); where that skill describes *how* a lane operates, this file defines *how sessions start, hand off, and recover across tools*.

Coordination files (all in `handover/`):

- `board.md` — dashboard, one row per active task: `Role | Session | Task | Files | Status | Started` (format defined once, in `role-session`'s `templates.md`). The `Files` column lists **every** path the task will touch. Informational: each session edits only its own row and re-asserts it at each checkpoint.
- `locks.d/` — the atomic claims (§0): one directory per claimed file, plus `@git` (commit token) and `@role__<role>`. Gitignored, local runtime state.
- `roles/<role>.md` — role charter (owned paths, forbidden paths, definition of done).
- `<role>.md` — per-role handover note (resume state for that role's task). First line `Session: <id>`.

**Precondition:** the project is a git repository. If `git rev-parse --is-inside-work-tree` fails, parallel mode cannot run — stop and tell the dev.

---

## 0. Session identity and the claim primitive

Prose rules like "re-read the file, then write your row" are check-then-act and lose races when two sessions run at once (two tools, or two windows of one tool). Claims therefore use an operation the filesystem makes atomic: **`mkdir` of a path that must not already exist.**

**Session id.** At boot generate `<tool>-<4 hex>` (`claude-a3f9`, `opencode-07c2`), tell the dev, and stamp it on every claim, board row, and handover header. It is how a returning session recognises its own rows and how a takeover names whom it displaced.

**Claim.** `mkdir handover/locks.d/<key>` — plain `mkdir` with no `-p`/`-Force`/`-ErrorAction` (works the same in bash and PowerShell; the parent `locks.d/` already exists). Success = you hold it. Failure ("already exists") = another session holds it: read its `owner`, do not proceed. Immediately after success write `handover/locks.d/<key>/owner` containing `session | role | task | status | claimed-timestamp`.

**Key.** Encode the repo-relative path so the mapping is injective: replace `%` with `%25`, `_` with `%5F`, `@` with `%40`, then every `/` or `\` with `__` (`src/a/b.js` → `src__a__b.js`; `src/my_file.js` → `src__my%5Ffile.js`). After encoding, a raw `__` can only be a separator, so two distinct paths never share a key. **Reserved keys** live in their own namespace, prefixed `@` — which encoded file keys never start with: `@git` (commit token), `@role__<role>` (role ownership; one live session per role), `@memory-bank-index` (shared bank index). A file path can never produce a reserved key. This is the only definition of the key scheme; other files reference it.

**Release.** Delete the `owner` file, then the directory (`rmdir` / `Remove-Item`). Update status in place by rewriting your own `owner`.

**Multi-file claims:** take all keys before the first edit; if any `mkdir` fails, release the ones you took and report who holds the blocker. A directory with no `owner` file (a session died between the two steps) is a suspect claim — treat per §3.

**Same role, two sessions: not allowed.** The first session takes `@role__<role>`; a second session wanting the same role must pick another role, or resume (§1b) only after the dev confirms the first is dead. This keeps one writer per `<role>.md`.

---

## 1. Session-start modes

Every session begins in exactly one of two modes. Decide which before touching anything.

### 1a. New task mode — claiming a task from the board

You are starting a task that no session currently owns.

1. Read `handover/board.md` and pick a candidate task.
2. Read that task's **full `Files` list** from its board row.
3. Check **every** path in that list against `handover/locks.d/` (no directory exists for its key).
4. Claim the task **only if every file in the list is currently free**. Then proceed under the normal lane rules (take your claims with `mkdir` at first edit, per §0 and the role-session skill — the check above is a cheap pre-screen; the `mkdir` is the real decision).
5. If **any** file in the list is locked by another role/session: **do not start the task.** Either wait, or pick a different board task whose entire `Files` list is free.

The point: the pre-check happens against the *whole* file list up front, so you never start a task and discover a locked dependency halfway through.

### 1b. Resume mode — continuing an in-progress task under the same role

You are continuing a task another session (possibly another tool) already started under a role — e.g. Claude Code got cut off mid-"frontend" task and OpenCode is picking it up as the same "frontend" role.

This is **not a new claim**:

- **Skip the lock pre-check** from 1a. The task's claims already exist and are yours to inherit.
- **Keep the existing claims in `locks.d/` as-is** under that role. Do not delete and re-claim them. **Adopt them:** rewrite each `owner` (and `@role__<role>`, the board row, and the `Session:` line of `<role>.md`) with your own session id, and log `resumed from <old-session> at <timestamp>` in the board row.
- Resume only when the previous session is known dead (cut off, or the dev says so). If it may still be live, ask the dev — never run two live sessions on one role.
- Read the role's handover file (`handover/<role>.md`) for the **exact resume point** — last completed step and next step.
- **Verify before continuing:** open the files the handover note references and confirm their current on-disk contents match what the note says they should contain. If they don't (drift — a partial edit, an unrecorded change), stop, report the discrepancy to the dev, and reconcile before writing anything.

---

## 2. Incremental handover writing (the ungraceful-cutoff safety net)

Sessions can end **without warning** — usage-limit exhaustion mid-task gives no chance to write a wrap-up note. Therefore:

- Update your role's `handover/<role>.md` **continuously as you work**, not only at session end. Natural checkpoints: after each completed step, before starting a multi-file edit, after any decision a resumer could reverse.
- Every update must record a **specific resume point**:
  - the **exact last completed step** (e.g. "added the `Files` column to `board.md`; row for task X updated"), and
  - the **exact next step** (e.g. "next: claim `src__nav.js` and `src__nav.css`, then edit `src/nav.js` to wire the toggle").
- Vague status ("working on the navbar", "in progress") is not a resume point and is a protocol violation — a cold resumer must be able to continue from the note alone.

If the session then dies abruptly, the note is at most one step stale, and Rule 1b makes resumption cheap.

---

## 3. Stale-lock recovery

Every claim's `owner` file carries a `claimed` timestamp and the owning session id. Locks normally live until task completion — but a dead session can strand them.

- A lock is **suspect** when it has been claimed for an unusually long time relative to its task (hours-to-days with no matching progress, not minutes) **and** the corresponding `board.md` row shows no update over that period.
- A new session **may treat a suspect lock as abandoned** and take over the file/task — but **must log the decision** rather than silently seizing it. Record, in the board row and in the rewritten `owner` file, something like: `takeover: claim from <old-session> (<role>) claimed <timestamp> presumed abandoned, taken by <new-session> <timestamp>`.
- The log is mandatory so that if the original owner's session comes back, they can recognise their old session id in the log and see exactly what happened instead of finding their claims mysteriously gone.
- When in doubt — the dev is watching; asking beats seizing.

---

## 4. Opportunistic graceful handoff

Some harnesses surface a signal that a session is nearing its context or usage limit (e.g. a compaction warning). If yours does:

1. Treat the signal as a cue to **proactively prompt the user**: continue working, or halt now for a clean handoff?
2. If the user chooses to halt:
   - Write a **complete, clean handover note** in `handover/<role>.md` (full resume point, decisions, gotchas).
   - **Properly finalize your locks**: release claims for finished files; leave in-flight claims in place (they are what Rule 1b resumes under) with the handover note stating exactly which claims are held and why.
   - Update your `board.md` row status, then stop.

This is **best-effort and opportunistic** — many cutoffs arrive with no signal at all. Rules 2 (incremental handover writing) and 3 (stale-claim recovery) are the guaranteed fallback for abrupt cutoffs; Rule 4 just makes the handoff cleaner when the harness gives you the chance.
