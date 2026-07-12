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
- **Skills library:** the `skills/` folder in the user's library project, organized in category subfolders (`models/`, `workflow/`, `standards/`, `memory/`, `stack/`, `libraries/`, `meta/`) with a README index. Known home: `My Projects/Astro/planatarium-2/skills/` — but glob for it if not found there; the user may move the library to its own repo. If found in multiple places, ask which is current and log the answer.
- **Standards system:** the `coding-standards/` folder (has `index.md` at its root). Same discovery rule.

## Step 1 — Offer the two modes
Ask exactly one question (skip it if the user already said which):
- **Everything** — all skills + the full coding-standards system.
- **Pick** — list the catalog by category (name + one-line purpose from the library README) and let the user choose categories and/or individual skills, plus a yes/no on the standards system.

When the user picks, advise but don't push: note skills that travel together (`coding-standards` skill pairs with the standards folder; `memory-gardener` pairs with `memory-bank`; model skills pair with `all-models`), and note stack skills that don't fit the target project's stack.

## Step 2 — Install skills
For each selected skill, copy the library file to the target project as:
```
<target>/.claude/skills/<skill-name>/SKILL.md
```
Rules:
- **Flat layout is mandatory** — `.claude/skills/<name>/SKILL.md`, never category subfolders (Claude Code won't discover them).
- **Companion files install alongside:** a library file named `<skill>.<companion>.md` (e.g. `role-session.templates.md`) is copied into the same skill folder as `<companion>.md` (e.g. `.claude/skills/role-session/templates.md`).
- The category folders exist only in the library; they disappear on install.
- **Never copy `learnings.md` files** — learnings are per-project experience; each project starts its own.
- If a skill already exists in the target: compare; if identical, skip silently; if different, show a one-line diff summary and ask (the target may have local learnings-promoted edits worth keeping).

## Step 3 — Install standards (if selected)
- Copy the entire `coding-standards/` folder to `<target>/coding-standards/` (skip `node_modules`/`.git` if present).
- **Activate the session protocol:** the folder ships `CLAUDE.example.md`. If the target has no `CLAUDE.md`, copy it there and fill in the project-specific table (name, framework, prefixes, token file paths) by asking or reading the project. If a `CLAUDE.md` exists, propose a merge — never overwrite it.
- Remind: exactly one script standard applies — set it in the project's CLAUDE.md per the index's Script Standard Selection table.
- If the tooling configs were installed (`coding-standards/tooling/`), mention the lint setup exists but do NOT install any npm packages — that's the user's call, made separately.

## Step 4 — Verify and report
- List what was installed where, grouped (skills / standards), plus what was skipped and why.
- Confirm the flat `.claude/skills/` layout (one folder per skill, each containing exactly `SKILL.md`).
- Suggest the natural first actions in the new project: a `handover.md` (if handover installed), the CLAUDE.md project table (if standards installed).

## Keeping installs current
This copies a snapshot. When the library improves, re-run the install for the affected skills — the compare-and-ask rule in Step 2 protects any local adaptations. Never edit an installed copy directly for library-wide improvements; edit the library and re-install.
