# Handover extras

Read only when needed: archiving skills at session end, agent-handover files, or multi-role mode.

## Skill scope for next session

Only touches `skill-scope`'s per-session-archivable set (`perf-audit`, `role-session`, `e2e-scaffold`, `memory-gardener`, `skill-ablation`, `skill-writer`) — never permanent-pinned skills, that's install-kit's territory. If the next task was volunteered (see above), archive any of these it doesn't need by running:
```
node <library>/skills/meta/install-kit.cli.js archive --root <target> --skills perf-audit,role-session
```
(`<library>` is the `ai-dev-kit` clone — same one install-kit uses.) This moves each named skill from the skill root into `<tool-dir>/skills-archive/<name>/` (`.claude/` or `.opencode/`, matching the skill root) — move, not delete, so local `learnings.md` survives — and updates `.ai-dev-kit.json` so a later `unarchive` or `update` knows where things stand. Record it:

```markdown
## Archived skills (this session)
Archived to `<tool-dir>/skills-archive/` — restore if scope shifts:
- perf-audit — <tool-dir>/skills-archive/perf-audit/
```

An explicit user override (e.g. "keep `perf-audit` pinned anyway") is honored and noted as explicit, never inferred. The next session restores on the spot if scope shifts — run `node <library>/skills/meta/install-kit.cli.js unarchive --root <target> --skills perf-audit` — a skill bouncing archive→restore repeatedly should move to permanent-pinned instead, via install-kit.

## Agent handovers

When `agent-usage`'s Reporting contract applies (a dispatched agent must write its full raw findings somewhere), those findings go here — never into `handover.md` directly, and never lost.

**Folder convention:**
- Classic mode: `<tool-dir>/agent-handovers/INDEX.md` (`.claude/` or `.opencode/`, matching the skill root) + one dated file per agent run (`YYYY-MM-DD_task-slug.md`).
- Multi-role mode: `handover/<role>/agent-handovers/INDEX.md` + files, owned exclusively by that role's folder — no lock-file entry needed (unlike `memory-bank/INDEX.md`, which is shared across roles and does need one).

**Who writes them:** the dispatched agent itself, as part of finishing its task — full raw findings, not a summary written after the fact. Writing it yourself would reintroduce the cost the delegation was meant to avoid.

**Consolidation — part of "On session end" above:** when updating `handover.md` (or a role's `handover/<role>.md`), also check whether any agent-handover files were created this session. Distill anything decision-worthy or state-relevant up into the normal sections, under the same ceiling and outcome-language rules as everything else — nothing raw gets copied in. Same distillation pattern already used for `memory-bank/`, just sourced from agent output instead of inline work.

**Access rule — gated by concurrency, not by role:**
- While two parallel role sessions are concurrently active, neither reads the other's `agent-handovers/` folder or `INDEX.md` — this prevents live cross-talk between sessions running at the same time.
- Once a role's session has ended, its `agent-handovers/` folder becomes durable historical record, exactly like its `handover/<role>.md` — not deleted or archived away.
- Any later session (same or different role, Classic or Multi-role) goes through that role's `handover.md` first — it is the mandatory curated gate. Only if `handover.md` references or hints at something needing more depth may the session then open that role's `agent-handovers/` files for backing detail. Never scan another (ended) role's `agent-handovers/INDEX.md` directly as a first move, independent of what that role's `handover.md` says.

## Parallel mode specifics
- The ceiling is **per role file**, not for the folder — each session reads only its own `<role>.md`, so that is the number that matters.
- **`board.md`: clear `done` rows as part of finishing**, not "when convenient". A board that accumulates completed rows is the same unbounded-growth bug in a different file.
- **`memory-bank/` is shared across roles and owned by none.** Before demoting into it from a role session, claim key `@memory-bank-index` in `handover/locks.d/` (atomic `mkdir`, per `role-session`) like any other shared file — concurrent demotions otherwise collide on the index. Release it in the same step you write.
