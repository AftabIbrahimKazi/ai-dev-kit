# Parallel-Mode Templates

Copy these into a project's `handover/` folder when the user activates parallel mode. Fill placeholders; delete example rows.

Also copy `protocol.md` from this skill's folder to `handover/PROTOCOL.md` — it is the tool-agnostic coordination protocol (session-start modes, incremental handover writing, stale-lock recovery, graceful handoff) that the AGENTS.md and CLAUDE.md pointers below reference.

## board.md
```markdown
# Lane Board
Updated continuously by active sessions. **Each session clears its own row on completion** — the board shows live work only, never a history of finished tasks. `Files` lists every path the task will touch — new claims require every listed file to be free in `locks.md` (see `handover/PROTOCOL.md`).

| Role | Task | Files | Status | Started |
|---|---|---|---|---|
| frontend | venus overlay counters | src/overlay.js, src/overlay.css | in-progress | 2026-07-12 |
```
Statuses: `in-progress` · `awaiting-review` · `blocked (reason)` · `done`

## locks.md
```markdown
# File Locks & Git Token

git: free
git-queue:

| File | Role | Task | Status | Claimed |
|---|---|---|---|---|
```

## roles/<role>.md (charter)
```markdown
# Role — <Frontend Engineer>

## Mission
<One paragraph: what this role is responsible for in this project.>

## Owned paths
- src/components/
- public/css/
<paths this role may edit freely (still subject to file locks)>

## Forbidden paths
- src/api/
<paths this role must never edit — ask the dev if a task seems to need one>

## Definition of done
<What "task complete" means for this role — e.g. renders clean, standards
chain passes, responsive at all breakpoints, console clean.>
```

## <role>.md (per-role handover)
Same structure as the classic handover.md (see the `handover` skill), scoped
to this role's lane: current state, last session, decisions & why, known
issues, next steps, don't touch. Its **120-line ceiling and routing table
apply per role file** — decisions go to `memory-bank/`, session narrative
stays in git, only current state lives here. One `## Last session` block,
overwritten; never stacked dated sections.

## AGENTS.md (project root — for non-Claude tools)
Copy to the project root when the project is shared with other AI tools
(OpenCode, Codex, etc). Replace `{{project-name}}`.
```markdown
# AGENTS.md — {{project-name}}

Instructions for AI coding agents (OpenCode, Codex, and any other tool) working in this repo. This repo is shared by multiple AI tools running sequentially or in parallel.

## Parallel-Session Coordination (mandatory)

Before claiming or resuming **any** task in the parallel-session system (`handover/` — board, locks, per-role handover notes), read `handover/PROTOCOL.md` and follow it. It defines session-start modes (new claim vs. resume), incremental handover writing, stale-lock recovery, and graceful handoff. Do not edit any file that is part of shared or locked work without going through that protocol first.

## Project standards

Project context, active coding standards, and the behavioural contract live in `CLAUDE.md` at the project root and `coding-standards/` — read them at session start.
```

## CLAUDE.md section (insert into the project's CLAUDE.md)
```markdown
## Parallel-Session Coordination

Before claiming or resuming any task in the parallel-session system (`handover/` — board, locks, per-role handovers), read `handover/PROTOCOL.md` and follow it. Never touch a file that is part of shared or locked work without going through that protocol first.
```
