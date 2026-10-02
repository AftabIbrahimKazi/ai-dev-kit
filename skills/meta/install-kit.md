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
- **Canonical home: the `ai-dev-kit` repo** — `My Projects/ai-dev-kit/` locally, `github.com/AftabIbrahimKazi/ai-dev-kit` remote (formerly `claude-dev-kit`; old URL redirects). It contains both `skills/` (category subfolders: `models/`, `workflow/`, `standards/`, `memory/`, `stack/`, `libraries/`, `meta/`, `addons/`, with a README index) and `coding-standards/` (has `index.md` at its root).
- If the local clone isn't at that path, glob for a `skills/README.md` + `coding-standards/index.md` pair, or clone the repo. Copies inside other projects are *installs*, not the source — improvements flow repo → projects, never the reverse.

## Skill scope — read before Step 1

Every skill installed here falls into one of two mechanisms, defined canonically in the `skill-scope` skill — **read it now**, don't re-derive the classification. Summary:
- **Permanent-pinned** (universal, or conditional on this project's stack/tooling/model) — decided once, here, at install.
- **Per-session archivable** (task-instance-specific) — installed here too, but its per-session on/off toggle is `handover`'s job, not install-kit's. Install it now regardless; don't pre-filter it out at install time.

The user can override any pin decision, but only by stating it explicitly in this session — never infer an override from context or convenience.

**Opt-in addons** (`addons/` — currently `system1-prefilter`) are a fourth category: never offered as part of Everything/Pick/Auto-detect by default, never stack-scanned. Offer them only when the user explicitly asks (at install or any later session) — then follow that addon's own Setup section for its install questions (e.g. `system1-prefilter` asks endpoint + API-key-variable questions itself). Once installed, treat as permanent-pinned — it's the user's own durable choice, not re-derived per session.

## Step 1 — Offer the modes
Ask exactly one question (skip it if the user already said which):
- **Everything** — all skills + the full coding-standards system.
- **Pick** — the universal permanent-pinned group pre-checked (from `skill-scope`), plus the catalog by category (name + one-line purpose from the library README) for the user to choose categories and/or individual skills, plus a yes/no on the standards system.
- **Auto-detect** — universal permanent-pinned group installs unconditionally; for the conditional-pinned group, scan the target project for a project guide doc (`README.md`, `CLAUDE.md`, `AGENTS.md`, `package.json`/`composer.json`/similar manifest, an existing `docs/` folder) against each skill's signal in `skill-scope`'s table (e.g. a Three.js dependency → `stack/threejs-scene`, an Astro config → `stack/astro-page`, a Shopify theme structure → `stack/shopify-toolkit-install`). Present the inferred list with the evidence found (file + line/field) before installing — cite the signal, never pin on a guess. Per-session-archivable skills still install unconditionally in this mode too; only their per-session toggle is deferred to `handover`.

Before finalizing any mode, ask once whether the user wants to override anything the scan/pick produced (pin something the scan skipped, or explicitly exclude something it matched) — record any such override plainly in the install report, since it's the user's explicit statement that authorized it.

**Detect the target tool before any mode proceeds — infer first, then confirm.** Probe the target: `.opencode/` or `opencode.json` → OpenCode; `.claude/` or `CLAUDE.md` → Claude Code; `.agents/` or a bare `AGENTS.md` → Codex/agents.md tools. State the evidence found and ask the user to confirm it (an inference never stands unconfirmed — a repo may carry markers for several tools). If nothing is found, or markers conflict, ask which tool(s) the project uses. **Record the answer as this install's target tool — Steps 2, 3, and 4 route every path off it.**

**Path routing — the detected tool decides where files land:**

| Target tool | Skill root | Session-protocol file |
|---|---|---|
| Claude Code | `<target>/.claude/skills/` | `<target>/CLAUDE.md` |
| OpenCode | `<target>/.opencode/skills/` | `<target>/AGENTS.md` |
| Codex / agents.md-convention tools | `<target>/.agents/skills/` | `<target>/AGENTS.md` |

Each tool auto-loads its own instruction file and ignores the other: OpenCode reads `AGENTS.md` and falls back to `CLAUDE.md` only when no `AGENTS.md` exists; Claude Code does the reverse. A session-protocol file in the wrong place is present on disk but permanently unreachable — the install looks complete while every session silently starts blind. Never write the contract into a file the detected tool does not read.

**Multi-tool repos (decided):** keep the full contract in exactly one canonical file — `AGENTS.md` by default, the cross-tool convention — and make the other tool's file a short pointer to it. Never two hand-maintained copies (they drift). Because a pointer depends on the agent following it, the pointer must state in its first line that reading the canonical file is mandatory, and Step 4's reachability check applies to each tool's file. Ask before wiring a second tool; on an OpenCode/Codex-only install, state in the report that Claude Code's `AGENTS.md` fallback is shadowed by any `CLAUDE.md`/`CLAUDE.local.md` (version floor in Step 4) and the pointer is the remedy. Exception: a Claude Code-only project keeps its contract in `CLAUDE.md` as today — no `AGENTS.md` is created unless a second tool is confirmed.

When the user picks, advise but don't push: note skills that travel together (`coding-standards` skill pairs with the standards folder; `memory-gardener` pairs with `memory-bank`; Claude model skills pair with `claude-all-models`; open-model skills pair with `opencode-all-models`; `e2e-scaffold` pairs with `coding-standards/qa/e2e-testing.md` — the skill scaffolds the fixtures/config layer, the standard defines the discipline for keeping it current; `intent-capture` pairs with `plan-first` — it feeds the plan's Goal/Approach line on ambiguous asks; `pre-merge-gate` pairs with `role-session` — it's the self-check run before marking claims `awaiting-review`; `hooks-enforcement` pairs with `coding-standards/ai-standards.md` — it's the Claude Code-only mechanical assist for that file's AI-01–AI-03; `agent-usage` pairs with `mode-kernel` — mode-kernel governs how agent-usage's approval gate (and debug-protocol's/coding-standards'/perf-audit's own stop-and-wait gates) behaves per session mode, install together; `agent-usage` also pairs with `handover` — its Reporting contract writes into handover's "Agent handovers" mechanism; `skill-ablation` pairs with `memory-gardener` — gardener prunes what stays, ablation periodically tests what should stay at all; run gardener first if learnings/handover are over cap), and note stack skills that don't fit the target project's stack.

## Step 2 — Install skills
For each selected skill, copy the library file into the **routed skill root** from Step 1's table as:
```
<skill-root>/<skill-name>/SKILL.md
```
Rules:
- **Flat layout is mandatory** — `<skill-root>/<name>/SKILL.md`, never category subfolders (no tool discovers them nested).
- **Companion files install alongside:** a library file named `<skill>.<companion>.<ext>` (e.g. `role-session.templates.md`, `strata-css.coverage.js`) is copied into the same skill folder as `<companion>.<ext>` (e.g. `<skill-root>/role-session/templates.md`, `<skill-root>/strata-css/coverage.js`). Companions are not always markdown — executable helpers ship this way too, so copy them verbatim and preserve the extension.
- The category folders exist only in the library; they disappear on install.
- **Never copy `learnings.md` files** — learnings are per-project experience; each project starts its own.
- If a skill already exists in the target: compare; if identical, skip silently; if different, show a one-line diff summary and ask (the target may have local learnings-promoted edits worth keeping).
- **`hooks-enforcement` is Claude Code-only and opt-in beyond the file copy:** if selected, additionally ask whether to merge its sample hook JSON into `<target>/.claude/settings.json` (merge, never overwrite). Skip this question entirely for non-Claude-Code targets — the skill file itself still installs normally as reference.
- **Tool-compatibility checkpoint:** before copying, check each selected skill's frontmatter for `compat: <tool>-only`. If the target tool (from Step 1) doesn't match, flag it in the plan before installing rather than copying silently — offer to skip it (it would never trigger there anyway) or install it as inert reference material, user's call. A skill with no `compat` field is universal — copy without asking. Report skipped-for-incompatibility items in the Step 4 summary, separate from user-deselected ones.

## Step 3 — Install standards (if selected)
- Copy the entire `coding-standards/` folder to `<target>/coding-standards/` (skip `node_modules`/`.git` if present).
- **Activate the session protocol in the routed file:** the standards folder ships `CLAUDE.example.md` as the template — the filename is historical (kept so existing installs and the Claude Code path stay unchanged); its body is tool-neutral and the destination is not. Copy it to the **routed session-protocol file** from Step 1's table (Claude Code → `CLAUDE.md`, OpenCode/Codex → `AGENTS.md`), filling in the project-specific table (name, framework, prefixes, token file paths) by asking or reading the project. If that file exists, propose a merge — never overwrite it. On a non-Claude-Code target do **not** also create a `CLAUDE.md`: nothing would read it.
- Remind: exactly one script standard applies — set it in the routed session-protocol file per the index's Script Standard Selection table.
- **Multi-tool wiring:** only when the user confirms a second tool also works this repo. Keep the contract in one canonical file and make the other tool's file a pointer to it (Step 1, "Multi-tool repos"). Ensure the "Parallel-Session Coordination" section is present in the canonical file (it ships in `CLAUDE.example.md`). If `role-session` was installed, its `templates.md` carries a pointer template for each tool's file.
- Note: `handover/PROTOCOL.md` itself (copied from the `role-session` skill's `protocol.md`) and the board/locks scaffolding are created only when the user activates parallel mode, per `role-session/templates.md` — the pointers may briefly reference a file that doesn't exist yet; that's fine.
- **`.gitignore`:** if the target's `.gitignore` names a skill root (e.g. `.claude/skills/`), update it to the routed root so it doesn't keep pointing at a directory that no longer exists after a tool switch. Propose the edit; don't apply silently.
- If the tooling configs were installed (`coding-standards/tooling/`), mention the lint setup exists but do NOT install any npm packages — that's the user's call, made separately.

## Step 3b — Migrate renamed skills (every re-install)
The library keeps a rename ledger at `migrations/RENAMES.md` (repo root) (old name → new name, dated). On every install into a project that already has a skill root (check the other tools' roots too — a re-install may be switching tools, in which case the previous root's skills are the ones to migrate):
1. List the target's existing skill folders and check each against the ledger's **Old name** column.
2. For each match, propose the migration (show old → new); on approval:
   - Copy the new-name skill in as usual (`<skill-root>/<new-name>/SKILL.md` + companions).
   - **Carry over `learnings.md`** from the old folder to the new one — learnings are the project's accumulated experience; a rename must never discard them. This is the one exception to the "never copy learnings" rule (it's a move within the same project, not a cross-project copy).
   - Preserve any local edits the old copy had (same compare-and-ask rule as Step 2) — merge them into the new copy, don't silently drop them.
   - Delete the old skill folder only after the new one is verified in place.
3. Grep the routed session-protocol file (and any multi-tool pointer file), plus the other skills' text, for the old name and update references.
4. Report each migration in the Step 4 summary (`old-name → new-name, learnings carried, N references updated`).
When maintaining the library itself: any skill rename/merge MUST add a ledger row in the same change — a rename without a ledger row strands every existing install.

## Step 4 — Verify and report
- List what was installed where, grouped (skills / standards), plus what was skipped and why. Name the detected target tool and both routed paths explicitly, so a wrong route is visible immediately rather than at the next session start.
- Confirm the flat `<skill-root>/` layout (one folder per skill, each containing `SKILL.md` plus any companions).
- **Confirm the contract is actually reachable:** re-read the routed session-protocol file and check it carries the `[CX]` rule (for a pointer file, check it points at a file that does). A contract file the tool never opens is the one install failure that looks like success — catch it here, not a session later. Reachability also depends on what can appear *later*: on an OpenCode/Codex-only install no `CLAUDE.md` is created, so Claude Code would fall back to `AGENTS.md` (needs Claude Code ≥ 2.1.277; ≥ 2.1.281 with telemetry off or on Bedrock/Vertex/Foundry) — but only while no `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, or parent-directory `CLAUDE.md` exists, since any of those shadows the fallback. If the project is later opened in Claude Code, create a `CLAUDE.md` pointer to `AGENTS.md` instead of relying on the fallback. Note this in the report; don't create the pointer on a single-tool install.
- Suggest the natural first actions in the new project: a `handover.md` (if handover installed), the session-protocol project table (if standards installed).

## Keeping installs current
This copies a snapshot. When the library improves, re-run the install for the affected skills — the compare-and-ask rule in Step 2 protects any local adaptations. Never edit an installed copy directly for library-wide improvements; edit the library and re-install.
