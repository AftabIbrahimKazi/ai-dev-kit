<div align="center">

# AI Dev Kit

**A self-improving skills library and layered coding-standards system for AI-assisted development — Claude Code, OpenCode, and any agent that reads markdown.**

One clone. Drop two folders into any project. Every session works your way — and gets better at it with use.

---

Listed under AI Hub → Skills on Three.js Resources — a curated directory for Three.js AI tools.

[![Featured on Three.js Resources](https://img.shields.io/badge/Featured%20on-Three.js%20Resources-4CAF50?style=for-the-badge&logo=three.js&logoColor=white)](https://threejsresources.com/ai/skills/ai-dev-kit)

</div>

---

## What's in the kit

| Folder | System | Docs |
|---|---|---|
| [`skills/`](skills/) | A library of self-improving agent skills — model protocols (Claude lineup + open-weight fleet), workflow discipline, persistent memory, parallel-session coordination, stack-specific patterns | [skills/README.md](skills/README.md) — full catalog with per-skill purpose |
| [`coding-standards/`](coding-standards/) | Universal, framework-agnostic coding standards in three layers (global rules → file-role partials → framework overrides), plus machine-enforcement lint configs | [coding-standards/index.md](coding-standards/index.md) — system map and reading order |

The two systems are independent but designed to interlock: the `coding-standards` skill loads and enforces the standards chain; the `install-kit` skill installs both; the AI behavioral contract ([`coding-standards/ai-standards.md`](coding-standards/ai-standards.md)) governs every session, including the `[CX]` context-integrity signal and read-efficiency rules.

## Install into a project

1. Copy `skills/` — and `coding-standards/` if the project should carry the standards — into the project root.
2. Open Claude Code (or your AI coding tool) in that project and say:

   > read skills/README.md and install

3. Choose **everything** or **pick** — Claude copies the chosen skills to `.claude/skills/` (the auto-invocable location), wires the standards `CLAUDE.md`, and reports what was installed.

Details, including per-skill manual installs: [skills/README.md → Installing into a new project](skills/README.md#installing-into-a-new-project).

## Key ideas

- **Self-improving skills.** Every skill reads a `learnings.md` sidecar at start and appends one distilled lesson at end. Learnings are per-project (never committed here, never copied by the installer) — each project's copies adapt to that project.
- **Adaptive to change.** Skills that describe living things (Claude models, libraries, frameworks) carry staleness guards: verify against the live source, follow it over the skill text, log the correction.
- **Standards as law, gaps flagged.** The standards system is declarative and testable; where it is silent, the AI flags the gap instead of inventing a rule ([RULE AI-12](coding-standards/ai-standards.md)).
- **Sequential by default, parallel when you say so.** The `role-session` skill coordinates multiple parallel Claude sessions (role charters, file locks, git token queue) and switches itself off in projects without the parallel structure.
- **Token-lean by design.** Skill descriptions are hard-capped, bodies stay under ~120 lines, read-efficiency rules are part of the standards, and the `memory-gardener` skill prunes accumulated knowledge.

## Repository layout

```
skills/
  README.md        ← catalog + install instructions (start here)
  models/          ← per-model protocols + fleet routing (claude/ lineup, opencode/ open-weight)
  workflow/        ← handover, debugging, planning, budget, commits, perf, parallel sessions
  standards/       ← the coding-standards enforcement skill
  memory/          ← repo-committed memory + knowledge gardening
  stack/           ← Three.js, Astro
  libraries/       ← skills for the author's own libraries (strata-css, triforge)
  meta/            ← skill-writer (quality bar), install-kit (installer)
migrations/
  RENAMES.md       ← skill rename ledger — install-kit reads it to migrate old installs (never delete)
coding-standards/
  index.md         ← system map: layers, reading order, file-to-role mapping (start here)
  *-standards.md   ← global rules per discipline (css, html, js/ts, git, seo, a11y, qa, ai, …)
  */               ← file-role partials per discipline
  frameworks/      ← framework additions/overrides (astro, bootstrap)
  tooling/         ← lint configs enforcing the machine-checkable rules
  CLAUDE.example.md← session-protocol template to wire into a project's CLAUDE.md
```

## Maintaining the kit

- **This repo is the canonical home.** Improve skills here, then re-run the install into projects; the installer diffs before overwriting so locally-evolved copies are never silently clobbered.
- New skills follow the quality bar in [skills/meta/skill-writer.md](skills/meta/skill-writer.md).
- Standards edits follow the repo's own principles ([index.md → Principles](coding-standards/index.md)): testable, declarative, wrong/right examples mandatory. Machine-checkable rule changes update [`coding-standards/tooling/`](coding-standards/tooling/) in the same commit.
- `learnings.md` files are gitignored — they belong to the project that earned them. Lessons worth keeping forever get promoted into skill bodies (see `memory-gardener`).

## License

[MIT](LICENSE). The license's "software" wording legally covers this collection of markdown skills, standards, and configs — use, adapt, and redistribute freely with attribution.
