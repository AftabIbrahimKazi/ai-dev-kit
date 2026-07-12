# Skills Library

Portable, self-improving skills for Claude Code. Every skill reads its `learnings.md` at start and appends one distilled lesson at end, so the library sharpens with use.

**To use in a project:** copy the `.md` into that project as `.claude/skills/<name>/SKILL.md` (folder name = skill name, file renamed to `SKILL.md`). The flat `.claude/skills/` layout is required for auto-invocation — these category subfolders exist only for organizing the portable copies.

**Canonical home:** the [`claude-dev-kit`](https://github.com/AftabIbrahimKazi/claude-dev-kit) repo (local clone: `My Projects/dev-kit/`). Improve skills there and commit; copies inside projects are installs. When editing a skill inside a project instead, port the improvement back to the repo — never let the two drift silently.

## models/ — driving each Claude model at full capacity
| Skill | Purpose |
|---|---|
| [fable-5](models/fable-5.md) | Fable 5 protocol — when its price pays off, always-on thinking, effort tuning |
| [opus-4-8](models/opus-4-8.md) | Opus 4.8 workhorse protocol — explicit adaptive thinking, fast mode, task budgets |
| [sonnet-5](models/sonnet-5.md) | Sonnet 5 — near-Opus coding at Sonnet cost, literal instruction patterns |
| [haiku-4-5](models/haiku-4-5.md) | Haiku 4.5 — fan-out/classification workhorse, what never to route to it |
| [all-models](models/all-models.md) | Fleet routing — right model per task, escalation rules, cost discipline |
| [opus-as-fable](models/opus-as-fable.md) | Behavioral protocol pushing Opus 4.8 toward Fable-grade rigor |

## workflow/ — session and process discipline
| Skill | Purpose |
|---|---|
| [handover](workflow/handover.md) | Session continuity via handover.md — resume cold with zero re-explaining |
| [debug-protocol](workflow/debug-protocol.md) | Reproduce → one hypothesis → cheapest disproof; no shotgun edits |
| [plan-first](workflow/plan-first.md) | 5-line plan + file list before multi-file work |
| [session-budget](workflow/session-budget.md) | Token discipline — targeted reads, no restating, cheap-model delegation |
| [pre-commit](workflow/pre-commit.md) | Commit pass — stray files, debug leftovers, message format, version bump |
| [perf-audit](workflow/perf-audit.md) | Measured, ranked performance audit (payload → loading → runtime → 3D) |
| [role-session](workflow/role-session.md) | Parallel-session lane protocol — role charters, file locks, git token queue (+ [templates](workflow/role-session.templates.md)) |

## standards/ — convention systems
| Skill | Purpose |
|---|---|
| [coding-standards](standards/coding-standards.md) | Load & enforce the layered coding-standards/ chain before any edit |

## memory/ — persistent knowledge
| Skill | Purpose |
|---|---|
| [memory-bank](memory/memory-bank.md) | Repo-committed project memory — decisions, context, solved mysteries |
| [memory-gardener](memory/memory-gardener.md) | Prune/merge learnings.md files and memory banks so knowledge compounds |

## stack/ — technology-specific
| Skill | Purpose |
|---|---|
| [threejs-scene](stack/threejs-scene.md) | Three.js discipline — shaders, disposal, scroll cameras, render hygiene |
| [astro-page](stack/astro-page.md) | Convention-driven Astro scaffolding — discover, mirror siblings, verify |

## libraries/ — the user's own repos
| Skill | Purpose |
|---|---|
| [strata-css](libraries/strata-css.md) | Strata CSS framework (Frameworks/strata) — use, debug, fix at source |
| [triforge](libraries/triforge.md) | @triforge Three.js suite (3D/three-js) — package picking, FINDINGS workflow |

## meta/ — maintaining the library itself
| Skill | Purpose |
|---|---|
| [skill-writer](meta/skill-writer.md) | The quality bar for writing new skills — triggers, checkable rules, loop |
| [install-kit](meta/install-kit.md) | Install skills + standards into any project — all at once or hand-picked |

## Installing into a new project

**Quick start (the intended flow):** dump this `skills/` folder — and `coding-standards/` if the project should have the standards system — into the new project's root, then tell Claude:

> read skills/README.md and install

**Claude, when given that instruction:** read `meta/install-kit.md` in this folder and follow it as the installation procedure. In short: offer **everything** or an **interactive pick** (catalog below), copy chosen skills to `.claude/skills/<name>/SKILL.md` (flat — never category subfolders), never copy `learnings.md` files, wire `coding-standards/CLAUDE.example.md` into the project's `CLAUDE.md` if standards were chosen (merge, never overwrite), and finish with a report of what was installed and skipped. After install, the dumped `skills/` folder may be kept as the in-project library copy or deleted — ask the user.

Alternative flows: from a session that can see both projects, ask Claude to run the install-kit against the target path; or manually copy any single `<category>/<name>.md` to `.claude/skills/<name>/SKILL.md`.
