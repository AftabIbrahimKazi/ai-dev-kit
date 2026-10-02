---
name: role-session
description: Parallel-session lane protocol — role charters, file-lock claims, git token queue, per-role handover; sequential fallback without handover/ folder. Trigger when the user assigns a role ("you are the tester", "frontend session") or a handover/ board/locks structure exists.
---

# Role Session — One Lane of the GPU

The user runs multiple parallel AI sessions (Claude Code, OpenCode, or both), each a job role with one task, human-in-the-loop (the dev watches, reviews, and pushes/pulls git manually). This skill is the lane protocol: stay in your charter, claim files before editing, never touch git without the token, hand over on completion.

**Sequential fallback:** if the project has no `handover/` folder (just a classic `handover.md`, or nothing), this machinery is off — work normally, use the `handover` skill's classic mode. Never create the parallel structure unprompted; the user activates it.

**Precondition — a git repository.** Parallel mode hard-requires git (token-gated commits, claims as the commit manifest, no-push/pull rule). Before activating, confirm `git rev-parse --is-inside-work-tree` succeeds; if not, tell the user parallel mode cannot run here (offer `git init` or classic `handover.md` mode) and stop.

**Legacy projects:** a project activated before claims moved to `locks.d/` has a `handover/locks.md` table. If it has no live rows, delete it and create `locks.d/`; if it has live rows, finish or release those lanes first (the dev decides) — never run both mechanisms at once.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a coordination failure seen, a rule that saved a conflict, friction worth removing. Merge instead of duplicating; delete disproven bullets.

## The coordination files (in `handover/`)
```
handover/
  PROTOCOL.md    ← cross-tool coordination protocol (see protocol.md in this skill's folder)
  board.md       ← lane dashboard: one row per active task (format defined once, in templates.md)
  locks.d/       ← atomic claims: one directory per claimed file, plus `@git` (commit token) and `@role__<role>` (role ownership). Local runtime state — gitignored
  roles/<role>.md← charter: mission, owned paths, forbidden paths, definition of done
  <role>.md      ← per-role handover (state, next steps) — replaces single handover.md
```
`PROTOCOL.md` is the tool-agnostic layer for repos shared with other AI tools (OpenCode, Codex, …) **and defines the claim primitive, session identity, and recovery rules** — read it first; the lane rules below build on it.

**Session identity.** At boot generate `<tool>-<4 hex>` (e.g. `claude-a3f9`, `opencode-07c2`), tell the dev, and stamp it on every board row, claim, and handover header you write. A claim is `mkdir handover/locks.d/<key>` — atomic: it succeeds for exactly one session — then write `owner` inside (`session | role | task | status | claimed`). Statuses: `editing` → `awaiting-review` → (claim released on completion). Full mechanics: `PROTOCOL.md` §0.

## Session lifecycle

**1. Boot.** Confirm your role with the user if not stated. Read: your charter (`roles/<role>.md`), `board.md`, your `<role>.md` handover, `locks.d/`. Take your role (`mkdir handover/locks.d/@role__<role>`; if it exists, another live session holds this role — take a different role, or resume per `PROTOCOL.md` §1b only once the dev confirms that session is dead — **one role, one live session**). Add/update your board row (`role | session | task | files | status`) — the `Files` column lists every path the task will touch; before a **new** claim, verify every listed file is free in `locks.d/` (per `handover/PROTOCOL.md`). Stay strictly inside charter-owned paths; needing a forbidden path = stop and ask the dev, never trespass.

**2. Claim before edit — never before.** At the moment you are about to make your first edit (NOT during plan mode / analysis / discussion — reading anything, including locked files, is always free):
- Claim each file with `mkdir handover/locks.d/<key>` (`PROTOCOL.md` §0), then write its `owner` file, status `editing`. The `mkdir` *is* the verification — no check-then-write gap. Claim all files of a multi-file edit before the first one; if any `mkdir` fails, release what you took and stop.
- If a file is already claimed by another session: do not edit. Inform the dev — who holds it, their task and status — and wait for the dev's call. The dev may override stale rows (a dead session's leftovers); that's the dev's decision, never yours.
- **Scope growth:** any file entering edit scope mid-task gets claimed the same way before it is touched. No exceptions — unclaimed edits are the one thing that breaks the whole system.

**3. Work.** Normal discipline (standards chain, session-budget, debug-protocol all apply). Edits only within charter paths + claimed files.

**4. Handoff for review.** Work complete and self-verified — run `pre-merge-gate` scoped to your own claimed files — then set your claims' status to `awaiting-review` (edit each `owner`), update board row to `awaiting-review`, tell the dev what to look at. Keep all claims — they protect the work through the review wait. If the dev requests changes, set touched claims back to `editing` and continue.

**5. Commit — only with the token.** After dev approval:
- Take the token with `mkdir handover/locks.d/@git`. If it fails, someone else is committing: wait and retry (or tell the dev) — order is the dev's call; there is no queue to keep honest.
- Stage **only the files you hold claims on** — your claims are the commit manifest. Never `git add .` — other lanes' work-in-progress shares the tree.
- Commit per the project's git standard (pre-commit skill applies). No push/pull — that is the dev's, always manual.
- Release: remove `handover/locks.d/@git` immediately after committing. Holding the token is a seconds-long act; never work while holding it.

**6. Complete.** Release your claims (and `@role__<role>`), update your `<role>.md` handover (outcome, decisions, next steps for this role), clear your board row, capture any memory-bank-worthy knowledge. Session's job is finished.

Three boundedness rules apply here. Each exists because these files are read at every session start, so anything parked in them is charged to every future session:
- **Your `<role>.md` obeys the `handover` skill's 120-line ceiling and its routing table** (current state → handover · decisions and solved mysteries → `memory-bank/` · what happened → git, never copied). The ceiling is per role file, since each session reads only its own. Over it, run `memory-gardener`.
- **Clear your own `done` board row as part of completing** — don't leave it for the dev. A board that accumulates finished rows is the same unbounded-growth bug in a different file.
- **`memory-bank/` is shared and owned by no role.** Claim key `@memory-bank-index` in `locks.d/` (the same atomic `mkdir`, role `shared`) before demoting into it, and release in the same step — concurrent demotions from two roles otherwise collide on the index. The claim is safe because `mkdir` needs no prior lock.

## Session-mode notes
- **Plan mode:** planning is read-only — no lock claims, no board writes until the plan is approved and execution starts. Claims happen at first edit (rule 2 already enforces this).
- **Auto-accept / autonomous:** all rules above hold without the dev prompting them — especially claim-before-edit and stage-only-claimed-files, which are what make autonomy safe in a shared tree.
- **Manual-approve:** identical behavior; claim and board writes are just commands/edits the dev approves like any other.

## Shared-runtime awareness
One dev server / build / test run exists for all lanes. Before verifying against the running app, note that other lanes may be mid-edit; prefer verifying `awaiting-review` (stable) states, and tell the dev when a check needs the tree quiet. Tester role: prefer reviewing lanes' `awaiting-review` work over live-edited code.

## Hard rules (the ones that must never bend)
1. No edit to an unclaimed file.
2. No edit outside charter paths without dev approval.
3. No git command without holding the `@git` token; never `git add .`; never push/pull.
4. Locks live until completion — through review waits.
5. Another session's claims and board rows are read-only — only the dev overrides them.
6. One role, one live session. Two live sessions never share a role or a `<role>.md`.
