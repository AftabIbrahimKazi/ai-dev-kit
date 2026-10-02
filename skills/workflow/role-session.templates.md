# Parallel-Mode Templates

Copy these into a project's `handover/` folder when the user activates parallel mode. Fill placeholders; delete example rows.

**Preconditions (check before copying anything):** the project is a git repository (`git rev-parse --is-inside-work-tree`) — if not, stop and tell the user; then `mkdir handover/locks.d` and add `handover/locks.d/` to `.gitignore` (claims are local runtime state).

Also copy `protocol.md` from this skill's folder to `handover/PROTOCOL.md` — it is the tool-agnostic coordination protocol (claim primitive, session identity, session-start modes, incremental handover writing, stale-claim recovery, graceful handoff) that the AGENTS.md and CLAUDE.md pointers below reference.

## board.md
```markdown
# Lane Board
Updated continuously by active sessions. **Each session clears its own row on completion** — the board shows live work only, never a history of finished tasks. `Files` lists every path the task will touch — new claims require every listed file to be free in `locks.d/` (see `handover/PROTOCOL.md`).

| Role | Session | Task | Files | Status | Started |
|---|---|---|---|---|---|
| frontend | claude-a3f9 | venus overlay counters | src/overlay.js, src/overlay.css | in-progress | 2026-07-12 |
```
Statuses: `in-progress` · `awaiting-review` · `blocked (reason)` · `done`. This is the **only** definition of the board format; other files reference it. The board is a dashboard, not the safety mechanism: each session edits only its own row, re-asserts it at every handover checkpoint, and a lost row self-heals. Safety lives in `locks.d/`.

## locks.d/ (claims — no template file)
Created empty (`mkdir handover/locks.d`, gitignored). One directory per claim, created with `mkdir` (atomic), holding an `owner` file:
```
handover/locks.d/src__overlay.js/owner   →  claude-a3f9 | frontend | venus counters | editing | 2026-07-12 14:30
handover/locks.d/@git/owner               →  opencode-07c2 | backend | api fix | committing | 2026-07-12 14:41
handover/locks.d/@role__frontend/owner    →  claude-a3f9 | frontend | - | active | 2026-07-12 14:00
```
To see all claims: list `handover/locks.d` and read each `owner`. Key rule and shell forms: `PROTOCOL.md` §0.

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
First line: `Session: <tool>-<hex>` (the live owner; a resumer overwrites it). Same structure as the classic handover.md (see the `handover` skill), scoped
to this role's lane: current state, last session, decisions & why, known
issues, next steps, don't touch. Its **120-line ceiling and routing table
apply per role file** — decisions go to `memory-bank/`, session narrative
stays in git, only current state lives here. One `## Last session` block,
overwritten; never stacked dated sections.

## AGENTS.md (project root — OpenCode/Codex, or the shared canonical file)
Copy to the project root when OpenCode/Codex work the repo. On an OpenCode-only project this *is* the session-protocol file: install `coding-standards/CLAUDE.example.md` into it first (install-kit Step 3), then add the coordination section below. Replace `{{project-name}}`.
```markdown
# AGENTS.md — {{project-name}}

Instructions for AI coding agents (OpenCode, Codex, and any other tool) working in this repo. This repo is shared by multiple AI tools running sequentially or in parallel.

## Parallel-Session Coordination (mandatory)

Before claiming or resuming **any** task in the parallel-session system (`handover/` — board, locks, per-role handover notes), read `handover/PROTOCOL.md` and follow it. It defines session-start modes (new claim vs. resume), incremental handover writing, stale-lock recovery, and graceful handoff. Do not edit any file that is part of shared or locked work without going through that protocol first.

## Project standards

Project context, active coding standards, and the behavioural contract live in this file's project table and in `coding-standards/` — read them at session start. (If this repo's canonical contract is a different file, per the install report, read that file too.)
```

## Session-protocol section (insert into CLAUDE.md on Claude Code, AGENTS.md on OpenCode — never into a file the tool doesn't read)
```markdown
## Parallel-Session Coordination

Before claiming or resuming any task in the parallel-session system (`handover/` — board, locks, per-role handovers), read `handover/PROTOCOL.md` and follow it. Never touch a file that is part of shared or locked work without going through that protocol first.
```

## Pointer file (multi-tool repos only)
When `AGENTS.md` is canonical and Claude Code also works the repo, `CLAUDE.md` is just this (never a second copy of the contract):
```markdown
# CLAUDE.md
**Mandatory:** read `AGENTS.md` in full before doing anything — it holds this project's contract, standards table, and parallel-session rules. This file intentionally holds nothing else.
```
