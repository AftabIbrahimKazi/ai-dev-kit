<div align="center">

# AI Dev Kit

**Agent skills, optional MCP tools, and layered coding standards for AI-assisted development — Claude Code, OpenCode, Codex, and any coding agent that reads markdown.**

Portable `SKILL.md` agent skills, framework-agnostic coding standards, and opt-in free/local MCP servers (UI prototyping, image reading, image generation, file pre-filtering) for teams building with AI pair programmers. One clone. Drop two folders into any project. Every session works your way — and gets better at it with use.

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
| `models/claude/` | Protocols tuned to each Claude model's actual behavior | `fable-5-1`, `opus-5-5`, `sonnet-5-5`, `haiku-4-5` (current) plus `fable-5`, `opus-5`, `opus-4-8`, `sonnet-5` (previous gen), `claude-all-models` (fleet routing), `opus-as-fable`, `hooks-enforcement` (opt-in Claude Code hooks) |
| `models/opencode/` | Open-weight fleet driven through OpenCode | `opencode-all-models` (routing), GLM, DeepSeek, Kimi, Qwen3-Coder, MiniMax, Devstral, MiMo, gpt-oss, `local-small-models` (≤32B self-hosted) |
| `workflow/` | Session/process discipline, model-independent | `intent-capture` → `plan-first` → `interpretation-checkpoint` → `pre-merge-gate` / `pre-commit` pipeline; plus `handover`, `debug-protocol`, `session-budget`, `perf-audit`, `role-session` (parallel sessions), `e2e-scaffold` |
| `standards/` | Loads and enforces the coding-standards chain; sets comment volume | `coding-standards`, `comment-style` (none / terse / descriptive — token-saving, asked at install) |
| `memory/` | Persistent knowledge across sessions | `memory-bank` (repo-committed context/decisions), `memory-gardener` (prunes/merges learnings) |
| `stack/` | Technology-specific discipline | `threejs-scene` (shaders, disposal, render hygiene), `astro-page` (convention-driven scaffolding) |
| `libraries/` | The author's own libraries | `strata-css`, `triforge` |
| `meta/` | Maintains the library itself | `skill-writer` (quality bar), `install-kit` (installer), `skill-scope` (pinned/archivable/addon classification) |
| `addons/` | Optional, user-opted capabilities — never installed by default | `system1-prefilter` (typed-decision prefiltering; hosted endpoint or the free local Laya model, exposed as the `prefilter` MCP tool) |
| `mcp/` | Optional MCP servers behind one meta skill — never installed by default | `mcp-manager` (setup interview, global-first per-tool config, MCP-first-then-fallback) + one companion per server: `stitch`, `local-vision`, `image-gen` |

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

## Optional AI tools: free and local MCP servers for any coding agent

One setup interview (`mcp-manager`) wires any of these into Claude Code, OpenCode, or another MCP client. **Models, runtimes, usage ledgers and keys live once in `~/.ai-dev-kit/` — never per project** — and each tool falls back to your normal flow when it is missing, rate-limited, or out of quota.

| Tool | What the agent gets | Runs | Cost | Verified |
|---|---|---|---|---|
| [`stitch`](skills/mcp/mcp-manager.stitch.md) | UI prototyping with [Google Stitch](https://stitch.withgoogle.com) (screens, variants, design systems) before any code is written | hosted | free for now, limited | live: generated a mobile screen and a Three.js 3D widget |
| [`local-vision`](skills/mcp/mcp-manager.local-vision.md) | `describe_image` — reads screenshots, diagrams and photos for models that cannot see (Qwen3-VL-2B via llama.cpp) | local CPU/GPU | free | real OpenCode; ~7–12 s per image on an 8-core CPU |
| [`image-gen`](skills/mcp/mcp-manager.image-gen.md) | `generate_image` for websites and apps: Gemini "Nano Banana" → Cloudflare Workers AI FLUX.1 schnell → labelled placeholder | hosted | Cloudflare free tier ≈ 173 images/day; Gemini image models need billing | real OpenCode; live Cloudflare and Gemini quota paths |
| [`prefilter`](skills/addons/system1-prefilter.md) | `prefilter` — the local [Laya](https://huggingface.co/convaiinnovations/laya) decision model ranks candidate files/tests before the agent reads them in full | local | free | real OpenCode; 1–3 s per call after a ~15–20 s first start |

**Built so a free tool can never become a trap.** `image-gen` warns at 80% of a daily cap, switches provider at 90% (before anything fails or bills), pauses all generation until 00:00 UTC when every provider is exhausted, then serves clearly marked placeholders — and every switch, pause and placeholder is reported to you as a notice, in the tool output and in `~/.ai-dev-kit/image-gen/notices.log`. Installers run a hardware preflight (CPU, RAM, disk, GPU) first, refuse installs the machine cannot hold, and pick CUDA/Vulkan/Metal builds only when the hardware warrants it, with automatic CPU fallback.

**Honest status.** Developed and tested on Windows 11 with an 8-core CPU and no discrete GPU. The CUDA, Metal, discrete-GPU Vulkan and Linux/macOS paths are implemented but untested. Model and API facts carry a `verified:` date and are re-checked live at setup. Credits and licences for every model and service (Qwen, llama.cpp, Laya, FLUX.1, Gemini, Stitch, placehold.co) are in [CREDITS.md](CREDITS.md) and each server file; nothing third-party is bundled in this repo.

**Get started:** install the kit, then tell your agent *"set up MCP servers"* — [`mcp-manager`](skills/mcp/mcp-manager.md) asks which tools, which AI clients, and where to keep keys, then writes the configs (merging, never overwriting) and health-checks each one.

## Install into a project

1. Copy `skills/` — and `coding-standards/` if the project should carry the standards — into the project root.
2. Open Claude Code (or your AI coding tool) in that project and say:

   > read skills/README.md and install

3. Choose **everything** or **pick** — the installer detects which coding tool you're in, copies the chosen skills to that tool's skill root (`.claude/skills/` for Claude Code, `.opencode/skills/` for OpenCode), wires the standards into that tool's session file (`CLAUDE.md` or `AGENTS.md` respectively), and reports what was installed.

Details, including per-skill manual installs: [skills/README.md → Installing into a new project](skills/README.md#installing-into-a-new-project).

## Key ideas

- **Self-improving skills.** Every skill reads a `learnings.md` sidecar at start and appends one distilled lesson at end. Learnings are per-project (never committed here, never copied by the installer) — each project's copies adapt to that project.
- **Adaptive to change.** Skills that describe living things (Claude models, libraries, frameworks) carry staleness guards: verify against the live source, follow it over the skill text, log the correction.
- **Standards as law, gaps flagged.** The standards system is declarative and testable; where it is silent, the AI flags the gap instead of inventing a rule ([RULE AI-12](coding-standards/ai-standards.md)).
- **Sequential by default, parallel when you say so.** The `role-session` skill coordinates multiple parallel AI sessions — Claude Code, OpenCode, or both (role charters, atomic `mkdir` file claims, a git commit token, session ids) and switches itself off in projects without the parallel structure.
- **Token-lean by design.** Skill descriptions are hard-capped, bodies stay under ~120 lines, read-efficiency rules are part of the standards, and the `memory-gardener` skill prunes accumulated knowledge.
- **Intent before implementation, a self-check before handoff.** `intent-capture` pins down goal/constraints/done-when on ambiguous asks before any plan is made; `pre-merge-gate` re-checks a diff against the loaded standards before a commit or review handoff — both are prose protocols, not tool-specific.
- **Claude Code enhancements stay optional and isolated.** Where a Claude Code-only mechanism (like hook-based enforcement in `hooks-enforcement`) can mechanically assist a rule, it lives under `skills/models/claude/` as an opt-in add-on — the underlying contract in `coding-standards/ai-standards.md` works the same with or without it, on any tool.

## Recent additions

- **MCP manager and free local/hosted tools.** [`mcp-manager`](skills/mcp/mcp-manager.md) is a meta skill that owns setup interviews, per-client config writing (Claude Code, OpenCode, others), MCP-first-then-fallback routing and global-first layout for every optional MCP server; adding a server is one data file. Shipped servers: Stitch UI prototyping, local image reading (Qwen3-VL), image generation with provider fallback and limit protection, and the Laya-backed file prefilter. All run from one global home (`~/.ai-dev-kit/`) and were verified in a real OpenCode session.
- **Local decision model.** [`system1-prefilter`](skills/addons/system1-prefilter.md) now supports a free offline provider (Laya, 421M parameters) with a hardware-aware installer and a `prefilter` MCP tool; measured guidance on phrasing, checkpoint choice and thresholds is recorded in the skill.
- **Controlled-writing rule.** [`skill-writer`](skills/meta/skill-writer.md) now asks for imperative steps, one term per concept and explicit conditions (borrowed from ASD-STE100's disambiguation rules). Measured on two skills: about 16% fewer tokens with equal-or-better rule-following.
- **Kit audit.** Every skill was checked for frontmatter, trigger-rich descriptions, length, catalog coverage and classification; stale descriptions and an install-kit contradiction were fixed.

- **Tool-routed installs.** `install-kit` now detects the target tool and routes both the skill root and the session-protocol file (`CLAUDE.md` for Claude Code, `AGENTS.md` for OpenCode/Codex) — a contract in a file the tool never opens can no longer pass as a successful install. Parallel-session claims moved from a shared `locks.md` table to atomic `handover/locks.d/` claims with per-session ids, so concurrent Claude Code and OpenCode sessions can't silently clobber each other.
- **Agent-tool discipline.** [`agent-usage`](skills/workflow/agent-usage.md) defaults every session to inline work — no Agent-tool delegation — unless the user names an agent explicitly or a scope-anchored need is judged and approved first; [`mode-kernel`](skills/workflow/mode-kernel.md) is the shared table governing how that gate (and three other skills' own stop-and-wait gates) behaves across autonomous, planning, and background session modes.
- **Skill ablation.** [`skill-ablation`](skills/memory/skill-ablation.md) is a periodic companion to `memory-gardener`: archive the accumulated session-protocol file/skills/hooks, run real work with none of it, and restore only what repeated real-world evidence proves is still needed — catching obsolete instructions a line-count cap alone can't.
- **Live-pulled Shopify skills.** [`shopify-toolkit-install`](skills/stack/shopify-toolkit-install.md) clones Shopify's own AI toolkit straight into a target project's skill root at install time — this kit never stores or forks Shopify-authored files, so authorship and their telemetry hook stay exactly where they belong.
- **Tool-compatibility checkpoint.** Any skill that depends on a mechanism only one AI coding tool provides (Claude Code hooks, for example) now declares it structurally via a `compat: <tool>-only` frontmatter field, checked automatically by `install-kit` at install time — so tool-specific features get flagged and kept out of incompatible projects instead of failing silently.
- **Comment level.** [`comment-style`](skills/standards/comment-style.md) sets one project-wide level for AI-written code comments — `none` (default), `terse`, or `descriptive` — because comments cost output tokens when written and input tokens on every re-read. `install-kit` asks at install; the user can change it any time in-session. Rule-mandated comments (TS `as` justifications, suppression-directive reasons, tool pragmas) still apply at `none`.
- **Claude 5.5 generation.** [`sonnet-5-5`](skills/models/claude/sonnet-5-5.md), [`opus-5-5`](skills/models/claude/opus-5-5.md), [`opus-5`](skills/models/claude/opus-5.md), and [`fable-5-1`](skills/models/claude/fable-5-1.md) join the lineup, and `claude-all-models` now routes across the current gears with the previous generation kept for pinned projects. These stay universal (no `compat` field) — they encode model behavior and API rules, not any one tool's mechanisms — and each new-generation skill flags the breaking API changes (forced `tool_choice` rejected, thinking blocks bound to model + conversation) that bite when moving up from its predecessor.
- **Opt-in addons.** [`system1-prefilter`](skills/addons/system1-prefilter.md) introduces a fourth skill-scope category — a capability that's never stack-detected or installed by default, only turned on when the user explicitly asks, then stays pinned as their own durable choice. `skill-scope` now tracks this category alongside permanent-pinned and per-session-archivable.

## Repository layout

```
skills/
  README.md        ← catalog + install instructions (start here)
  models/          ← per-model protocols + fleet routing (claude/ lineup + Claude Code hooks, opencode/ open-weight)
  workflow/        ← intent capture, planning, handover, debugging, budget, commits, pre-merge checks, perf, agent-usage discipline, session-mode gating, parallel sessions, e2e scaffolding
  standards/       ← the coding-standards enforcement skill
  memory/          ← repo-committed memory, knowledge gardening, periodic skill ablation
  stack/           ← Three.js, Astro, Shopify (live-pulled from Shopify's own toolkit, never forked)
  libraries/       ← skills for the author's own libraries (strata-css, triforge)
  meta/            ← skill-writer (quality bar), install-kit (installer), skill-scope (pin/archive/addon classification)
  addons/          ← opt-in, user-opted capabilities, never installed by default (system1-prefilter + local Laya)
  mcp/             ← opt-in MCP servers: mcp-manager + one companion per server (stitch, local-vision, image-gen)
migrations/
  RENAMES.md       ← skill rename ledger — install-kit reads it to migrate old installs (never delete)
coding-standards/
  index.md         ← system map: layers, reading order, file-to-role mapping (start here)
  *-standards.md   ← global rules per discipline (css, html, js/ts, git, seo, a11y, qa, ai, …)
  */               ← file-role partials per discipline
  frameworks/      ← framework additions/overrides (astro, bootstrap)
  tooling/         ← lint configs enforcing the machine-checkable rules
  CLAUDE.example.md← session-protocol template — wire into CLAUDE.md (Claude Code) or AGENTS.md (OpenCode)
```

## Maintaining the kit

- **This repo is the canonical home.** Improve skills here, then re-run the install into projects; the installer diffs before overwriting so locally-evolved copies are never silently clobbered.
- New skills follow the quality bar in [skills/meta/skill-writer.md](skills/meta/skill-writer.md).
- Standards edits follow the repo's own principles ([index.md → Principles](coding-standards/index.md)): testable, declarative, wrong/right examples mandatory. Machine-checkable rule changes update [`coding-standards/tooling/`](coding-standards/tooling/) in the same commit.
- `learnings.md` files are gitignored — they belong to the project that earned them. Lessons worth keeping forever get promoted into skill bodies (see `memory-gardener`).

## License

[MIT](LICENSE). Third-party models, services and borrowed ideas are credited in [CREDITS.md](CREDITS.md). The license's "software" wording legally covers this collection of markdown skills, standards, and configs — use, adapt, and redistribute freely with attribution.
