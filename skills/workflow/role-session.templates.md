# Parallel-Mode Templates

Copy these into a project's `handover/` folder when the user activates parallel mode. Fill placeholders; delete example rows.

## board.md
```markdown
# Lane Board
Updated continuously by active sessions. Dev clears `done` rows.

| Role | Task | Status | Started |
|---|---|---|---|
| frontend | venus overlay counters | in-progress | 2026-07-12 |
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
issues, next steps, don't touch.
