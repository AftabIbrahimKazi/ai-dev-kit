# Skills Library

Portable, self-improving skills for AI coding agents — Claude Code natively, other tools (OpenCode, etc.) via their own instruction files. Every skill reads its `learnings.md` at start and appends one distilled lesson at end, so the library sharpens with use.

**To use in a project:** copy the `.md` into that project as `.claude/skills/<name>/SKILL.md` (folder name = skill name, file renamed to `SKILL.md`). The flat `.claude/skills/` layout is required for auto-invocation — these category subfolders exist only for organizing the portable copies.

**Canonical home:** the [`ai-dev-kit`](https://github.com/AftabIbrahimKazi/ai-dev-kit) repo (local clone: `My Projects/ai-dev-kit/`). Improve skills there and commit; copies inside projects are installs. When editing a skill inside a project instead, port the improvement back to the repo — never let the two drift silently.

**Renames:** every skill rename/merge gets a row in [migrations/RENAMES.md](../migrations/RENAMES.md); the install-kit reads it to migrate old installs (carrying their `learnings.md` forward).

## models/ — driving each model at full capacity

### models/claude/ — the Claude lineup
| Skill | Purpose |
|---|---|
| [fable-5](models/claude/fable-5.md) | Fable 5 protocol — when its price pays off, always-on thinking, effort tuning |
| [opus-4-8](models/claude/opus-4-8.md) | Opus 4.8 workhorse protocol — explicit adaptive thinking, fast mode, task budgets |
| [sonnet-5](models/claude/sonnet-5.md) | Sonnet 5 — near-Opus coding at Sonnet cost, literal instruction patterns |
| [haiku-4-5](models/claude/haiku-4-5.md) | Haiku 4.5 — fan-out/classification workhorse, what never to route to it |
| [claude-all-models](models/claude/claude-all-models.md) | Fleet routing — right model per task, escalation rules, cost discipline |
| [opus-as-fable](models/claude/opus-as-fable.md) | Behavioral protocol pushing Opus 4.8 toward Fable-grade rigor |

### models/opencode/ — open-weight models driven through OpenCode
| Skill | Purpose |
|---|---|
| [opencode-all-models](models/opencode/opencode-all-models.md) | Open-weight fleet routing in OpenCode — GLM/DeepSeek/Kimi/Qwen/MiniMax, local vs. hosted |
| [big-pickle](models/opencode/big-pickle.md) | Big Pickle — Zen's free stealth model (≈GLM-4.6, Sonnet-4.5/4.6-class); free-tier caveats, exit plan |
| [glm-5-2](models/opencode/glm-5-2.md) | GLM-5.2 — open-weight flagship for long-horizon agents; latency/caching discipline |
| [deepseek-v4](models/opencode/deepseek-v4.md) | DeepSeek V4 Pro — cheap frontier reasoning; promo-pricing and cache discipline |
| [kimi-k2-6](models/opencode/kimi-k2-6.md) | Kimi K2.6 — retry-native agentic coder, best-in-class tool calling, vision-to-UI |
| [qwen3-coder](models/opencode/qwen3-coder.md) | Qwen3-Coder 480B & Next — Apache-2.0 coding workhorse, self-hosting pick |
| [minimax-m3](models/opencode/minimax-m3.md) | MiniMax M3 — cheapest frontier-cluster tokens; fan-out/bulk-edit worker |
| [devstral-2](models/opencode/devstral-2.md) | Devstral 2 — Mistral's repo-surgery specialist, top open SWE-bench per dollar |
| [mimo-v2-5](models/opencode/mimo-v2-5.md) | MiMo-V2.5 — Xiaomi dark horse, 1M context long-horizon agent at DeepSeek prices |
| [gpt-oss](models/opencode/gpt-oss.md) | gpt-oss 120b/20b — OpenAI open weights, self-hosted reasoning + tool calling, harmony format |
| [local-small-models](models/opencode/local-small-models.md) | ≤32B local tier — Ollama setup rules, context floor, tool-call smoke test, task ceiling |

## workflow/ — session and process discipline
| Skill | Purpose |
|---|---|
| [handover](workflow/handover.md) | Session continuity via handover.md — resume cold with zero re-explaining |
| [debug-protocol](workflow/debug-protocol.md) | Reproduce → one hypothesis → cheapest disproof; no shotgun edits |
| [plan-first](workflow/plan-first.md) | 5-line plan + file list before multi-file work |
| [session-budget](workflow/session-budget.md) | Token discipline — targeted reads, no restating, cheap-model delegation |
| [pre-commit](workflow/pre-commit.md) | Commit pass — stray files, debug leftovers, message format, version bump |
| [perf-audit](workflow/perf-audit.md) | Measured, ranked performance audit (payload → loading → runtime → 3D) |
| [role-session](workflow/role-session.md) | Parallel-session lane protocol — role charters, file locks, git token queue (+ [templates](workflow/role-session.templates.md), [cross-tool protocol](workflow/role-session.protocol.md)) |
| [e2e-scaffold](workflow/e2e-scaffold.md) | Scaffold reusable Playwright config/fixtures/smoke-test once per project — pairs with `qa/e2e-testing.md` |

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
