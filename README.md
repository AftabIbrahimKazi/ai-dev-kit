<div align="center">

# AI Dev Kit

**A self-improving skills library and layered coding-standards system for AI-assisted development — Claude Code, OpenCode, and any coding agent that reads markdown.**

Portable Claude Code skills, agent instructions, and framework-agnostic coding standards for teams building with AI pair programmers. One clone. Drop two folders into any project. Every session works your way — and gets better at it with use.

---

Listed under AI Hub → Skills on Three.js Resources — a curated directory for Three.js AI tools.

[![Featured on Three.js Resources](https://img.shields.io/badge/Featured%20on-Three.js%20Resources-4CAF50?style=for-the-badge&logo=three.js&logoColor=white)](https://threejsresources.com/ai/skills/ai-dev-kit)

</div>

---

## What's in the kit

The kit is two independent systems that share one install path. `skills/` teaches an AI coding agent *how to work* — session discipline, model-specific behavior, memory, coordination. `coding-standards/` teaches it *what correct code looks like* for this project — language rules, file-role conventions, framework overrides. Either can be adopted alone; together, the `coding-standards` skill is what loads and enforces the standards chain during a session, so a project that wants enforcement needs both folders.

### `skills/` — the self-improving skills library

Full catalog: [skills/README.md](skills/README.md). Every skill is a single portable markdown file with `name` + `description` frontmatter; the description is trigger-rich (explicit "trigger when…" phrasing) so an agent loads it only when it's actually relevant, keeping the always-resident cost low. Every skill also reads a project-local `learnings.md` sidecar at the start of a use and appends one distilled lesson at the end — those files are gitignored per project, so this repo stays the clean upstream while each installed copy compounds its own experience. The library is organized into seven categories:

- **`models/`** — protocols tuned to a specific model's actual behavior, not generic prompting advice. `models/claude/` covers the current Claude lineup (Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5) plus fleet-routing rules for which model a task should go to, an `opus-as-fable` protocol for pushing Opus toward Fable-grade rigor, and an opt-in `hooks-enforcement` skill that uses Claude Code's hook mechanism to mechanically assist a few standards rules. `models/opencode/` does the same for the open-weight fleet driven through OpenCode — GLM, DeepSeek, Kimi, Qwen3-Coder, MiniMax, Devstral, MiMo, gpt-oss, and a local-small-models tier for anything ≤32B self-hosted via Ollama — with per-model notes on pricing tiers, context ceilings, and tasks that shouldn't be routed to them.
- **`workflow/`** — session and process discipline, independent of any one model. This is where a non-trivial request gets structured: `intent-capture` pins down *what* was actually asked when a request is ambiguous, `plan-first` decides *how* before multi-file work starts, `interpretation-checkpoint` is a newer addition that catches drift in the parsed fine detail (files, parameters, values) on tasks with real blast radius, and `pre-merge-gate` / `pre-commit` close the loop before a diff ships. Alongside that pipeline: `handover` for cold session resumption, `debug-protocol` for reproduce-before-fix discipline, `session-budget` for token discipline, `perf-audit` for a measured performance pass, `role-session` for coordinating multiple parallel Claude sessions on the same repo (file locks, git token queue), and `e2e-scaffold` for one-time Playwright setup.
- **`standards/`** — the `coding-standards` skill itself, which loads and enforces the layered standards chain described below before any edit.
- **`memory/`** — persistent knowledge that survives a session: `memory-bank` for repo-committed decisions and context, `memory-gardener` for pruning and merging accumulated `learnings.md` files and memory banks so the knowledge compounds instead of sprawling.
- **`stack/`** — technology-specific discipline, currently `threejs-scene` (shader, disposal, scroll-camera, and render-hygiene rules) and `astro-page` (convention-driven scaffolding that discovers and mirrors sibling patterns).
- **`libraries/`** — skills scoped to the author's own libraries (`strata-css`, `triforge`), kept in the shared catalog because the same install/update discipline applies to them.
- **`meta/`** — the library maintaining itself: `skill-writer` is the quality bar every skill is written against (trigger-rich descriptions, checkable and numerically-thresholded rules, a mandatory self-improvement loop, a ~120-line budget), and `install-kit` is the installer that copies chosen skills into a project's `.claude/skills/`.

### `coding-standards/` — the layered standards system

Full map: [coding-standards/index.md](coding-standards/index.md). The standards are universal and framework-agnostic by default, organized in three layers read top-down for any file being edited: **Layer 1** is a global rule file per discipline at the folder root (`css-standards.md`, `html-standards.md`, a script standard — `js-standards.md`, `ts-standards.md`, or `js-and-ts-standards.md` depending on the project, never more than one at a time); **Layer 2** is a matching subfolder of partials, one per file *role* within that discipline (a CSS token file has different laws than a CSS overlay file; a script's entry file differs from its orchestrator, controller, preset, or utility files); **Layer 3** is `frameworks/` (currently Astro, Bootstrap, Strata CSS), which extends or explicitly overrides a universal rule with an `OVERRIDES [filename] RULE [number]` notation. Beyond the file-role disciplines, `git-standards.md` and `versioning-standards.md` cover commit/branch/PR and package-versioning conventions, `seo-standards.md` and `accessibility-standards.md` cover cross-cutting concerns, `qa/` is an umbrella folder (not a single file) spanning definition-of-done, branch gates, logic/error checks, security, E2E testing, and bug reporting, and `ai-standards.md` is the AI behavioral contract that governs every session — hallucination detection, the `[CX]` context-integrity signal, and read-efficiency rules — regardless of which coding tool is running it. `tooling/` holds the lint configs that mechanically enforce whichever rules in the chain are checkable by a machine. Every rule in the system is meant to be testable and declarative (state what's required, not what's preferred), with wrong/right examples wherever a rule could be misread; where the standards are silent on a case, the AI is required to flag the gap rather than invent a rule (`RULE AI-12`).

The two systems interlock at one seam: the `install-kit` skill installs both in one pass, and the `coding-standards` skill is the thing that actually loads and walks the standards chain during a session — without it installed and invoked, `coding-standards/` is just reference documentation.

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
- **Intent before implementation, a self-check before handoff.** `intent-capture` pins down goal/constraints/done-when on ambiguous asks before any plan is made; `pre-merge-gate` re-checks a diff against the loaded standards before a commit or review handoff — both are prose protocols, not tool-specific.
- **Claude Code enhancements stay optional and isolated.** Where a Claude Code-only mechanism (like hook-based enforcement in `hooks-enforcement`) can mechanically assist a rule, it lives under `skills/models/claude/` as an opt-in add-on — the underlying contract in `coding-standards/ai-standards.md` works the same with or without it, on any tool.

## Repository layout

```
skills/
  README.md        ← catalog + install instructions (start here)
  models/          ← per-model protocols + fleet routing (claude/ lineup + Claude Code hooks, opencode/ open-weight)
  workflow/        ← intent capture, planning, handover, debugging, budget, commits, pre-merge checks, perf, parallel sessions, e2e scaffolding
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
