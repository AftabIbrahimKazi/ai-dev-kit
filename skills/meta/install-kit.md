---
name: install-kit
description: Install the skills library and/or coding-standards into a project — all in one go or hand-picked; pure file copying, no packages. Trigger on install skills, set up skills/standards, add my skills, or a project missing them.
---

# Install Kit — Skills & Standards Into Any Project

Installs by copying markdown files only. Never installs packages, never runs build tooling, never touches project code.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — source-location changes, a picking pattern the user prefers, an install step that was missing. Merge instead of duplicating; delete disproven bullets.

## Source locations (verify, don't assume)
- **Canonical home: the `ai-dev-kit` repo** — `My Projects/ai-dev-kit/` locally, `github.com/AftabIbrahimKazi/ai-dev-kit` remote (formerly `claude-dev-kit`; old URL redirects). It contains both `skills/` (category subfolders: `models/`, `workflow/`, `standards/`, `memory/`, `stack/`, `libraries/`, `meta/`, with a README index) and `coding-standards/` (has `index.md` at its root).
- If the local clone isn't at that path, glob for a `skills/README.md` + `coding-standards/index.md` pair, or clone the repo. Copies inside other projects are *installs*, not the source — improvements flow repo → projects, never the reverse.

## Step 1 — Offer the two modes
Ask exactly one question (skip it if the user already said which):
- **Everything** — all skills + the full coding-standards system.
- **Pick** — list the catalog by category (name + one-line purpose from the library README) and let the user choose categories and/or individual skills, plus a yes/no on the standards system.

When the user picks, advise but don't push: note skills that travel together (`coding-standards` skill pairs with the standards folder; `memory-gardener` pairs with `memory-bank`; Claude model skills pair with `claude-all-models`; open-model skills pair with `opencode-all-models`; `e2e-scaffold` pairs with `coding-standards/qa/e2e-testing.md` — the skill scaffolds the fixtures/config layer, the standard defines the discipline for keeping it current), and note stack skills that don't fit the target project's stack.

## Step 2 — Install skills
For each selected skill, copy the library file to the target project as:
```
<target>/.claude/skills/<skill-name>/SKILL.md
```
Rules:
- **Flat layout is mandatory** — `.claude/skills/<name>/SKILL.md`, never category subfolders (Claude Code won't discover them).
- **Companion files install alongside:** a library file named `<skill>.<companion>.<ext>` (e.g. `role-session.templates.md`, `strata-css.coverage.js`) is copied into the same skill folder as `<companion>.<ext>` (e.g. `.claude/skills/role-session/templates.md`, `.claude/skills/strata-css/coverage.js`). Companions are not always markdown — executable helpers ship this way too, so copy them verbatim and preserve the extension.
- The category folders exist only in the library; they disappear on install.
- **Never copy `learnings.md` files** — learnings are per-project experience; each project starts its own.
- If a skill already exists in the target: compare; if identical, skip silently; if different, show a one-line diff summary and ask (the target may have local learnings-promoted edits worth keeping).

## Step 3 — Install standards (if selected)
- Copy the entire `coding-standards/` folder to `<target>/coding-standards/` (skip `node_modules`/`.git` if present).
- **Activate the session protocol:** the folder ships `CLAUDE.example.md`. If the target has no `CLAUDE.md`, copy it there and fill in the project-specific table (name, framework, prefixes, token file paths) by asking or reading the project. If a `CLAUDE.md` exists, propose a merge — never overwrite it.
- Remind: exactly one script standard applies — set it in the project's CLAUDE.md per the index's Script Standard Selection table.
- **Multi-tool wiring (if the `role-session` skill was installed):** ask whether other AI tools (OpenCode, Codex, etc.) will also work this repo. If yes:
  - Copy the AGENTS.md template from `role-session/templates.md` to `<target>/AGENTS.md`, filling `{{project-name}}` (if an `AGENTS.md` exists, propose a merge — never overwrite).
  - Ensure the "Parallel-Session Coordination" section is present in the target's `CLAUDE.md` (it ships in `CLAUDE.example.md`; when merging into an existing `CLAUDE.md`, add it).
  - Note: `handover/PROTOCOL.md` itself (copied from the skill's `protocol.md`) and the board/locks scaffolding are created only when the user activates parallel mode, per `role-session/templates.md` — the pointers may briefly reference a file that doesn't exist yet; that's fine.
- If the tooling configs were installed (`coding-standards/tooling/`), mention the lint setup exists but do NOT install any npm packages — that's the user's call, made separately.

## Step 3b — Migrate renamed skills (every re-install)
The library keeps a rename ledger at `migrations/RENAMES.md` (repo root) (old name → new name, dated). On every install into a project that already has `.claude/skills/`:
1. List the target's existing skill folders and check each against the ledger's **Old name** column.
2. For each match, propose the migration (show old → new); on approval:
   - Copy the new-name skill in as usual (`.claude/skills/<new-name>/SKILL.md` + companions).
   - **Carry over `learnings.md`** from the old folder to the new one — learnings are the project's accumulated experience; a rename must never discard them. This is the one exception to the "never copy learnings" rule (it's a move within the same project, not a cross-project copy).
   - Preserve any local edits the old copy had (same compare-and-ask rule as Step 2) — merge them into the new copy, don't silently drop them.
   - Delete the old skill folder only after the new one is verified in place.
3. Grep the target's `CLAUDE.md`, `AGENTS.md`, and other skills' text for the old name and update references.
4. Report each migration in the Step 4 summary (`old-name → new-name, learnings carried, N references updated`).
When maintaining the library itself: any skill rename/merge MUST add a ledger row in the same change — a rename without a ledger row strands every existing install.

## Step 4 — Verify and report
- List what was installed where, grouped (skills / standards), plus what was skipped and why.
- Confirm the flat `.claude/skills/` layout (one folder per skill, each containing exactly `SKILL.md`).
- Suggest the natural first actions in the new project: a `handover.md` (if handover installed), the CLAUDE.md project table (if standards installed).

## Keeping installs current
This copies a snapshot. When the library improves, re-run the install for the affected skills — the compare-and-ask rule in Step 2 protects any local adaptations. Never edit an installed copy directly for library-wide improvements; edit the library and re-install.
