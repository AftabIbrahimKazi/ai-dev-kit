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

Every skill is a single portable markdown file with `name` + `description` frontmatter — the description is trigger-rich ("trigger when…") so it loads only when relevant — and reads a project-local, gitignored `learnings.md` sidecar at start and appends a lesson at end, so this repo stays the clean upstream while each install compounds its own experience. Every standard is testable and declarative, with wrong/right examples wherever a rule could be misread, and flags a gap (`RULE AI-12`) rather than inventing a rule where the standards are silent. They interlock at one seam: the `install-kit` skill installs both in one pass, and the `coding-standards` skill is what actually loads and walks the standards chain during a session — without it, `coding-standards/` is just reference documentation.

### `skills/` — the self-improving skills library

Full catalog: [skills/README.md](skills/README.md)

| Category | Covers | Representative skills |
|---|---|---|
| `models/claude/` | Protocols tuned to each Claude model's actual behavior | `fable-5`, `opus-4-8`, `sonnet-5`, `haiku-4-5`, `claude-all-models` (fleet routing), `opus-as-fable`, `hooks-enforcement` (opt-in Claude Code hooks) |
| `models/opencode/` | Open-weight fleet driven through OpenCode | `opencode-all-models` (routing), GLM, DeepSeek, Kimi, Qwen3-Coder, MiniMax, Devstral, MiMo, gpt-oss, `local-small-models` (≤32B self-hosted) |
| `workflow/` | Session/process discipline, model-independent | `intent-capture` → `plan-first` → `interpretation-checkpoint` → `pre-merge-gate` / `pre-commit` pipeline; plus `handover`, `debug-protocol`, `session-budget`, `perf-audit`, `role-session` (parallel sessions), `e2e-scaffold` |
| `standards/` | Loads and enforces the coding-standards chain | `coding-standards` |
| `memory/` | Persistent knowledge across sessions | `memory-bank` (repo-committed context/decisions), `memory-gardener` (prunes/merges learnings) |
| `stack/` | Technology-specific discipline | `threejs-scene` (shaders, disposal, render hygiene), `astro-page` (convention-driven scaffolding) |
| `libraries/` | The author's own libraries | `strata-css`, `triforge` |
| `meta/` | Maintains the library itself | `skill-writer` (quality bar), `install-kit` (installer) |

### `coding-standards/` — the layered standards system

Full map: [coding-standards/index.md](coding-standards/index.md)

| Layer | What it is | Location |
|---|---|---|
| 1 — Universal global rules | One rule file per discipline, applies to every file of that type | `css-standards.md`, `html-standards.md`, and one script standard (`js-`, `ts-`, or `js-and-ts-standards.md` — never more than one per project) |
| 2 — Universal file-role rules | Partials for each file *role* within a discipline (e.g. a CSS token file vs. an overlay file; a script's entry vs. orchestrator vs. controller file) | matching `{discipline}-standards/` subfolder |
| 3 — Framework rules | Extends or explicitly overrides a universal rule (`OVERRIDES [file] RULE [n]`) | `frameworks/` — currently Astro, Bootstrap, Strata CSS |

| Cross-cutting | Covers |
|---|---|
| `git-standards.md`, `versioning-standards.md` | Commit/branch/PR conventions, package versioning |
| `seo-standards.md`, `accessibility-standards.md` | SEO structure/schema; WCAG 2.1 AA |
| `qa/` (umbrella folder, not one file) | Definition of done, branch gates, logic/error checks, security, E2E testing, bug reporting |
| `ai-standards.md` | The AI behavioral contract — hallucination detection, `[CX]` context-integrity signal, read-efficiency rules — for every session regardless of tool |
| `tooling/` | Lint configs that mechanically enforce whichever rules above are machine-checkable |

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
