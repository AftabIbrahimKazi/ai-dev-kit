<div align="center">

# AI Dev Kit: Agent Skills, Coding Standards and Claude Code Mods

**Agent skills, optional MCP tools, and layered coding standards for AI-assisted development — Claude Code, OpenCode, Codex, and any coding agent that reads markdown.**

**AI Dev Kit** is a free, MIT-licensed toolkit that makes AI coding agents behave consistently and spend fewer tokens. It ships 64 reusable `SKILL.md` agent skills (53 for Claude Code, 11 for OpenCode models), layered coding standards for CSS, HTML, JavaScript, TypeScript, accessibility, SEO, performance, Git and QA, 18 opt-in slash commands, 9 Claude Code mods that enforce the rules in code, and opt-in local MCP servers. A full Claude Code install adds about 3,900 tokens of always-on context (estimated).

Portable `SKILL.md` agent skills, framework-agnostic coding standards, opt-in slash commands, git hooks and Claude Code mods that enforce the rules in code, opt-in free/local MCP servers (UI prototyping, image reading, image generation, file pre-filtering), an opt-in offline text-to-speech add-on that reads Claude's replies aloud, and opt-in reply personas, for teams building with AI pair programmers. One clone. Drop two folders into any project. Every session works your way — and gets better at it with use.

[![License: MIT](https://img.shields.io/github/license/AftabIbrahimKazi/ai-dev-kit?style=flat-square)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/AftabIbrahimKazi/ai-dev-kit?style=flat-square)](https://github.com/AftabIbrahimKazi/ai-dev-kit/stargazers) [![GitHub forks](https://img.shields.io/github/forks/AftabIbrahimKazi/ai-dev-kit?style=flat-square)](https://github.com/AftabIbrahimKazi/ai-dev-kit/forks) [![Last commit](https://img.shields.io/github/last-commit/AftabIbrahimKazi/ai-dev-kit?style=flat-square)](https://github.com/AftabIbrahimKazi/ai-dev-kit/commits/main)

---

Listed under AI Hub → Skills on Three.js Resources — a curated directory for Three.js AI tools.

[![Featured on Three.js Resources](https://img.shields.io/badge/Featured%20on-Three.js%20Resources-4CAF50?style=for-the-badge&logo=three.js&logoColor=white)](https://threejsresources.com/ai/skills/ai-dev-kit)

</div>

---

## Quick start

```bash
git clone https://github.com/AftabIbrahimKazi/ai-dev-kit.git
cp -r ai-dev-kit/skills ai-dev-kit/coding-standards your-project/
```

On Windows PowerShell: `Copy-Item -Recurse ai-dev-kit/skills, ai-dev-kit/coding-standards your-project/`

Then open Claude Code, OpenCode, Codex or any agent that reads markdown in `your-project` and say:

> read skills/README.md and install

The core installer copies markdown files only: no packages, no build step. Opt-in add-ons that need a tool (for example `narrate`, which uses Piper for speech) install it only when you ask. Full details: [Install into a project](#install-into-a-project).

**Why use it**

- **Consistent sessions.** The standards chain loads for each file you edit (the optional `standards-chain` mod makes that mechanical), and skills load when the agent recognises their trigger, so session ten behaves like session one. Skill loading is model-judged, not guaranteed; the mods are what enforce the critical gates.
- **Fewer wasted tokens.** Skills load only when relevant, reads are targeted, cheap models take the cheap work, and a script finds violations so the agent does not have to.
- **Standards that are enforced, not just written down.** Rules are testable, the agent self-checks before a commit, and gaps are flagged instead of improvised.
- **Cleanup of old or shared code.** `code-audit` counts violations across a whole project and lists the exact lines, so the agent reads only what is flagged.

**Jump to:** [Everything at a glance](#everything-the-kit-does-at-a-glance) · [Skills catalog](#complete-skills-catalog) · [MCP tools](#optional-ai-tools-free-and-local-mcp-servers-for-any-coding-agent) · [Voice, narration and personas](#voice-narration-and-personas) · [Mods](#claude-code-mods-all-nine) · [Scripts and git hooks](#scripts-and-git-hooks) · [Install](#install-into-a-project) · [Slash commands](#slash-commands) · [Where things live](#where-things-live-and-how-to-turn-things-off) · [FAQ](#frequently-asked-questions)

## Everything the kit does, at a glance

You do not need to read the code to use the kit. This section says what exists, what happens by itself, and what you have to ask for. Details for each item are in the sections below.

**Happens by itself once installed**

| What | How it works | Needs |
|---|---|---|
| Skills load when their situation comes up (commit, failing build, big task, handover, model choice, and so on) | The agent reads each skill's short description and loads the file when it matches. This is model-judged, so it is not guaranteed; the items below are the guaranteed layer. | the skills |
| Standards are read before a file is edited | The `standards-chain` mod denies the first edit of a file until its standards chain has been read | `standards-chain` mod |
| Commits are checked | The `precommit-gate` mod (and optional git hooks) block leaked secrets, secret files, bad commit messages and `--no-verify` | `precommit-gate` mod, or `/githooks` |
| Edits are checked | The `edit-check` mod runs syntax, lint and standards checks after each edit and shows only the problems | `edit-check` mod |
| Dangerous actions are stopped | The `guard` mod denies edits to secret files, lockfiles and `.git`, and destructive commands such as force push or `reset --hard` | `guard` mod |
| Noisy command output is shortened | The `output-compact` mod shrinks test and build logs and keeps every failure line | `output-compact` mod |
| Token use is recorded | The `budget-ledger` mod writes one row per turn; `/token-report` reads it | `budget-ledger` mod |
| Reminders at the right moment | `debug-nudge` (failed fix), `eta-nudge` (long or backgrounded task), `prefilter-rank` (ranked read order) | those mods |
| Replies are read aloud | A Stop hook keeps each reply; press Play to hear it (like claude.ai), or switch to auto to speak every reply | `narrate` add-on |
| On-screen controls for narration and persona | A footer tray, sidebar and Play button in VS Code | `extensions/narrate-buttons` |
| Replies use a chosen persona | A SessionStart hook adds a short persona text | `personality` add-on |

**You ask for it**

| What | How |
|---|---|
| Install the kit into a project | say `read skills/README.md and install` |
| Slash commands | type them: `/audit`, `/commit-check`, `/pickup`, `/wrap-up`, `/narration`, `/persona` and more ([full list](#slash-commands)) |
| A skill on purpose | type `/<skill-name>` (for example `/debug-protocol`) |
| Optional MCP tools | say `set up MCP servers` |
| Claude Code mods | say `set up mods` |
| Git hooks for every tool | type `/githooks` |

## What's in the kit

The kit is two independent systems that share one install path. `skills/` teaches an AI coding agent *how to work* — session discipline, model-specific behavior, memory, coordination. `coding-standards/` teaches it *what correct code looks like* for this project — language rules, file-role conventions, framework overrides. Either can be adopted alone; together, the `coding-standards` skill is what loads and enforces the standards chain during a session, so a project that wants enforcement needs both folders.

Every skill is a single portable markdown file with `name` + `description` frontmatter — the description is situation-first ("use whenever … load this BEFORE …") so it loads only when relevant — and reads a project-local, gitignored `learnings.md` sidecar at start and appends a lesson at end, so this repo stays the clean upstream while each install compounds its own experience. Every standard is testable and declarative, with wrong/right examples wherever a rule could be misread, and flags a gap (`RULE AI-12`) rather than inventing a rule where the standards are silent. They interlock at one seam: the `install-kit` skill installs both in one pass, and the `coding-standards` skill is what actually loads and walks the standards chain during a session — without it, `coding-standards/` is just reference documentation.

### `skills/` — the self-improving skills library

Full catalog: [skills/README.md](skills/README.md)

| Category | Covers | Representative skills |
|---|---|---|
| `models/claude/` | Protocols tuned to each Claude model's actual behavior | `fable-5-1`, `opus-5-5`, `sonnet-5-5`, `haiku-5-5` (current) plus `fable-5`, `opus-5`, `opus-4-8`, `sonnet-5`, `haiku-4-5` (previous gen), `claude-all-models` (fleet routing), `opus-as-fable`, `hooks-enforcement` (opt-in Claude Code hooks) |
| `models/opencode/` | Open-weight fleet driven through OpenCode | `opencode-all-models` (routing), GLM, DeepSeek, Kimi, Qwen3-Coder, MiniMax, Devstral, MiMo, gpt-oss, `local-small-models` (≤32B self-hosted) |
| `workflow/` | Session/process discipline, model-independent | `intent-capture` → `plan-first` → `interpretation-checkpoint` → `pre-merge-gate` / `pre-commit` pipeline; plus `handover`, `debug-protocol`, `session-budget`, `perf-audit`, `role-session` (parallel sessions), `e2e-scaffold`, `resolve-conflicts`, `responsive-check`, `optimize-assets` |
| `standards/` | Loads and enforces the coding-standards chain; audits a whole project against the script-checkable rules; sets comment volume | `coding-standards`, `code-audit`, `comment-style` (none / terse / descriptive — token-saving, asked at install) |
| `memory/` | Persistent knowledge across sessions | `memory-bank` (repo-committed context/decisions), `memory-gardener` (prunes/merges learnings) |
| `stack/` | Technology-specific discipline | `threejs-scene` (shaders, disposal, render hygiene), `astro-page` (convention-driven scaffolding) |
| `libraries/` | The author's own libraries | `strata-css`, `triforge` |
| `meta/` | Maintains the library itself | `skill-writer` (quality bar), `install-kit` (installer), `skill-scope` (pinned/archivable/addon classification), `mod-writer` and `mod-setup` (Claude Code mods), `misfire-log` (opt-in: logs when a skill/mod/addon should have fired but didn't, for the next kit update) |
| `addons/` | Optional, user-opted capabilities — never installed by default | `system1-prefilter` (typed-decision prefiltering; hosted endpoint or the free local Laya model, exposed as the `prefilter` MCP tool), `project-context` (a private, gitignored folder of project docs with token-lean indexes, set up with `/ctx`), `narrate` (offline text to speech for Claude's replies), `personality` (six reply personas by skill level) |
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
| `seo-standards.md`, `accessibility-standards.md`, `performance-standards.md` | SEO structure/schema; WCAG 2.1 AA; load/runtime performance budgets |
| `qa/` (umbrella folder, not one file) | Definition of done, branch gates, logic/error checks, security, E2E testing, bug reporting |
| `ai-standards.md` | The AI behavioral contract — hallucination detection, `[CX]` context-integrity signal, read-efficiency rules — for every session regardless of tool |
| `tooling/` | Lint configs that mechanically enforce whichever rules above are machine-checkable |

## Complete skills catalog

Every skill in the kit, by category, with what it is for. Click a category to open it. The same catalog lives in [skills/README.md](skills/README.md). Install-kit installs the baseline workflow skills by default and offers the rest; add-ons and MCP servers are never installed unless you ask.

<details>
<summary><strong>models/claude/ — the Claude lineup</strong></summary>

| Skill | Purpose |
|---|---|
| [fable-5-1](skills/models/claude/fable-5-1.md) | Fable 5.1 protocol — when its price pays off, preserved-thinking rules, progress updates, autonomy/scope prompts |
| [opus-5-5](skills/models/claude/opus-5-5.md) | Opus 5.5 — current flagship; always-on thinking, `medium` default effort, forced-tool-use ban |
| [sonnet-5-5](skills/models/claude/sonnet-5-5.md) | Sonnet 5.5 — recalibrated effort, `between_tools` thinking-off, low-effort verification prompt |
| [haiku-5-5](skills/models/claude/haiku-5-5.md) | Haiku 5.5 — first Haiku with adaptive thinking and effort, 1M context, fan-out/routing, breaking changes vs 4.5 |
| [opus-5](skills/models/claude/opus-5.md) | Opus 5 (previous gen) — thinking-on default, verbosity/over-verification/subagent tuning |
| [fable-5](skills/models/claude/fable-5.md) | Fable 5 (previous gen) — when its price pays off, always-on thinking, effort tuning |
| [opus-4-8](skills/models/claude/opus-4-8.md) | Opus 4.8 (previous gen) — explicit adaptive thinking, fast mode, task budgets |
| [sonnet-5](skills/models/claude/sonnet-5.md) | Sonnet 5 (previous gen) — near-Opus coding at Sonnet cost, literal instruction patterns |
| [haiku-4-5](skills/models/claude/haiku-4-5.md) | Haiku 4.5 (previous gen) — fan-out/classification workhorse, legacy `budget_tokens` surface |
| [claude-all-models](skills/models/claude/claude-all-models.md) | Fleet routing — right model per task, escalation rules, cost discipline |
| [opus-as-fable](skills/models/claude/opus-as-fable.md) | Behavioral protocol pushing Opus 4.8 toward Fable-grade rigor |
| [hooks-enforcement](skills/models/claude/hooks-enforcement.md) | Optional Claude Code hooks assisting AI-01–AI-03 mechanically — Claude Code only |

</details>

<details>
<summary><strong>models/opencode/ — open-weight models driven through OpenCode</strong></summary>

| Skill | Purpose |
|---|---|
| [opencode-all-models](skills/models/opencode/opencode-all-models.md) | Open-weight fleet routing in OpenCode — GLM/DeepSeek/Kimi/Qwen/MiniMax, local vs. hosted |
| [big-pickle](skills/models/opencode/big-pickle.md) | Big Pickle — Zen's free stealth model (≈GLM-4.6, Sonnet-4.5/4.6-class); free-tier caveats, exit plan |
| [glm-5-2](skills/models/opencode/glm-5-2.md) | GLM-5.2 — open-weight flagship for long-horizon agents; latency/caching discipline |
| [deepseek-v4](skills/models/opencode/deepseek-v4.md) | DeepSeek V4 Pro — cheap frontier reasoning; promo-pricing and cache discipline |
| [kimi-k2-6](skills/models/opencode/kimi-k2-6.md) | Kimi K2.6 — retry-native agentic coder, best-in-class tool calling, vision-to-UI |
| [qwen3-coder](skills/models/opencode/qwen3-coder.md) | Qwen3-Coder 480B & Next — Apache-2.0 coding workhorse, self-hosting pick |
| [minimax-m3](skills/models/opencode/minimax-m3.md) | MiniMax M3 — cheapest frontier-cluster tokens; fan-out/bulk-edit worker |
| [devstral-2](skills/models/opencode/devstral-2.md) | Devstral 2 — Mistral's repo-surgery specialist, top open SWE-bench per dollar |
| [mimo-v2-5](skills/models/opencode/mimo-v2-5.md) | MiMo-V2.5 — Xiaomi dark horse, 1M context long-horizon agent at DeepSeek prices |
| [gpt-oss](skills/models/opencode/gpt-oss.md) | gpt-oss 120b/20b — OpenAI open weights, self-hosted reasoning + tool calling, harmony format |
| [local-small-models](skills/models/opencode/local-small-models.md) | ≤32B local tier — Ollama setup rules, context floor, tool-call smoke test, task ceiling |

</details>

<details>
<summary><strong>workflow/ — session and process discipline</strong></summary>

Pipeline for a new, non-trivial ask: `intent-capture` (pin *what*) → `plan-first` (decide *how*) → `interpretation-checkpoint` (verify the parsed detail, wide-blast-radius tasks only) → edit → `pre-merge-gate` → `pre-commit`.

**Baseline set** (install-kit installs these by default regardless of stack, unless declined): `handover`, `agent-usage`, `mode-kernel`, `session-budget`, `debug-protocol`, `intent-capture`, `plan-first`, `interpretation-checkpoint`, `pre-merge-gate`, `pre-commit`. Not baseline: `perf-audit`, `role-session`, `e2e-scaffold`, `resolve-conflicts`, `responsive-check`, `optimize-assets` — situational, install-kit's Pick/Auto-detect catalog covers these on need.

| Skill | Purpose |
|---|---|
| [handover](skills/workflow/handover.md) | Session continuity via handover.md — resume cold with zero re-explaining; also hosts the agent-handover mechanism |
| [agent-usage](skills/workflow/agent-usage.md) | Default-never Agent-tool policy — two scope-anchored exceptions, an approval gate, chaining-pattern efficiency rules |
| [mode-kernel](skills/workflow/mode-kernel.md) | Central table for how agent-usage/debug-protocol/coding-standards/perf-audit's stop-and-wait gates behave per session mode |
| [debug-protocol](skills/workflow/debug-protocol.md) | Reproduce → one hypothesis → cheapest disproof; no shotgun edits |
| [intent-capture](skills/workflow/intent-capture.md) | Goal + constraints + done-when before planning, for ambiguous asks |
| [plan-first](skills/workflow/plan-first.md) | 5-line plan + file list before multi-file work; in plan mode, plan for a cheaper executor model and verify its result |
| [interpretation-checkpoint](skills/workflow/interpretation-checkpoint.md) | Files/Changes/Assumptions breakdown for correction on multi-file, multi-parameter tasks |
| [session-budget](skills/workflow/session-budget.md) | Token discipline — targeted reads, no restating, cheap-model delegation; `report.js` (ledger report) and `compact.js` (verbose-output shrinker) companions |
| [pre-merge-gate](skills/workflow/pre-merge-gate.md) | Self-check a diff against loaded standards before handoff or commit; `edit-check.js` companion runs the mechanical checks |
| [pre-commit](skills/workflow/pre-commit.md) | Commit pass — stray files, debug leftovers, secrets, message format, version bump; `check.js` companion runs the mechanical checks; `install-hook.js` installs it as git hooks |
| [resolve-conflicts](skills/workflow/resolve-conflicts.md) | Resolve merge/rebase conflicts by mode (both, ours, theirs), pace (all, auto, step) and developer role; `scope.js` companion lists the conflict set and verifies role scope; [roles example](skills/workflow/resolve-conflicts.roles.example.json) ships `frontend` and `backend` |
| [responsive-check](skills/workflow/responsive-check.md) | Range-based viewport check and fix (RULE 17 zones by default; `--range`, `--min`, `--max`, `--width`, `--detect`); `probes.js` plans viewports and detects breakpoints, `measure.js` measures in Playwright |
| [optimize-assets](skills/workflow/optimize-assets.md) | Convert (webp, avif, jpg, mp4, woff2 ...), compress and pre-compress (gzip, brotli) assets with the converters installed; `convert.js` companion also scans for heavy assets and lists references; originals are never touched |
| [perf-audit](skills/workflow/perf-audit.md) | Measured, ranked performance audit (payload → loading → runtime → 3D) |
| [role-session](skills/workflow/role-session.md) | Parallel-session lane protocol — role charters, atomic file claims, git token, session ids (+ [templates](skills/workflow/role-session.templates.md), [cross-tool protocol](skills/workflow/role-session.protocol.md)) |
| [e2e-scaffold](skills/workflow/e2e-scaffold.md) | Scaffold reusable Playwright config/fixtures/smoke-test once per project — pairs with `qa/e2e-testing.md` |

</details>

<details>
<summary><strong>standards/ — convention systems</strong></summary>

| Skill | Purpose |
|---|---|
| [coding-standards](skills/standards/coding-standards.md) | Load & enforce the layered coding-standards/ chain before any edit |
| [code-audit](skills/standards/code-audit.md) | Project-wide audit of the script-checkable standards rules (CSS, HTML, JS/TS, page SEO/a11y/perf, git history, versioning) for cleanup of old or multi-dev code; `audit.js` companion counts violations by rule and lists `file:line`, so the model reads only what is flagged |
| [comment-style](skills/standards/comment-style.md) | Per-project comment level — none (default) / terse / descriptive — asked at install, changeable any time; saves tokens |

</details>

<details>
<summary><strong>memory/ — persistent knowledge</strong></summary>

| Skill | Purpose |
|---|---|
| [memory-bank](skills/memory/memory-bank.md) | Repo-committed project memory — decisions, context, solved mysteries |
| [memory-gardener](skills/memory/memory-gardener.md) | Prune/merge learnings.md files and memory banks so knowledge compounds; `stale.js` companion lists bullets that name deleted files |
| [skill-ablation](skills/memory/skill-ablation.md) | Periodic archive-and-run-bare pass — restore only instructions real work proves are missing |

</details>

<details>
<summary><strong>stack/ — technology-specific</strong></summary>

| Skill | Purpose |
|---|---|
| [threejs-scene](skills/stack/threejs-scene.md) | Three.js discipline — shaders, disposal, scroll cameras, render hygiene |
| [astro-page](skills/stack/astro-page.md) | Convention-driven Astro scaffolding — discover, mirror siblings, verify |
| [shopify-toolkit-install](skills/stack/shopify-toolkit-install.md) | Live-pull Shopify's own AI toolkit skills into a project — never forked into this kit |

</details>

<details>
<summary><strong>addons/ — optional, user-opted capabilities</strong></summary>

| Skill | Purpose |
|---|---|
| [system1-prefilter](skills/addons/system1-prefilter.md) | Provider-agnostic System-One-typed-decision prefilter — cuts fetching-stage tokens via MCQ/boolean candidate filtering + deterministic confidence-ladder escalation (`ladder.js`). Local free provider: Laya (`laya-ctl.js` sets up and runs it offline; `prefilter-mcp.js` exposes it as an MCP tool). Opt-in only, never in any default install. |
| [personality](skills/addons/personality.md) | Six original personas (female and male at novice, mid and pro skill levels) that change how replies are worded; SessionStart hook, `/persona`, user-replaceable persona files; wording only, never facts |
| [narrate](skills/addons/narrate.md) | Stop hook that reads each reply aloud (play-button or auto mode, British Piper male/female voices, mute, volume, speed, pitch, reading-time limit); no tokens, never touches Claude |
| [project-context](skills/addons/project-context.md) | Private, gitignored `project-context/` docs folder with an `INDEX.md` per sub-folder (setup by auto-detect, project type or custom list); `scan.js` companion tracks changes so only new files are re-read; guarded against commits |

</details>

<details>
<summary><strong>mcp/ — optional MCP servers, one manager</strong></summary>

Free and local tools for any MCP-capable agent (Claude Code, OpenCode, others): UI prototyping, image reading, image generation. Say *"set up MCP servers"* after the install and `mcp-manager` runs the interview. **Local-model servers are global-first:** scripts in `~/.ai-dev-kit/mcp/`, models and ledgers in `~/.ai-dev-kit/<server>/`, keys in `~/.ai-dev-kit/.env`, rules in the tool's global instruction file — never copied per project. Each installer runs a hardware preflight first.

| Skill | Purpose |
|---|---|
| [mcp-manager](skills/mcp/mcp-manager.md) | Meta skill for all opt-in MCP servers — setup interview (servers × AI tools × scope × keys × routing), per-tool config wiring, "MCP first, then fallback" rules. Opt-in only. |
| [local-vision](skills/mcp/mcp-manager.local-vision.md) | Server file + `local-vision.js` — free offline image reading (Qwen3-VL-2B/4B via llama.cpp) for models without vision; hardware-aware installer (CPU/CUDA/Vulkan/Metal) + stdio MCP in one script; verified in real OpenCode |
| [image-gen](skills/mcp/mcp-manager.image-gen.md) | Server file + `image-gen.js` CLI/MCP — image generation for sites/apps with fallback: Gemini Nano Banana (needs billing) → Cloudflare FLUX.1 schnell (≈173 free images/day) → labelled placeholder; 80% heads-up, 90% switch, pause at exhaustion, every step reported as a notice |
| [stitch](skills/mcp/mcp-manager.stitch.md) | Server file (companion of mcp-manager) — Google Stitch UI prototyping, free for now; try first, fall back to artifact/HTML flow |

</details>

<details>
<summary><strong>libraries/ — the user's own repos</strong></summary>

| Skill | Purpose |
|---|---|
| [strata-css](skills/libraries/strata-css.md) | Strata CSS framework (Frameworks/strata) — use, debug, fix at source |
| [triforge](skills/libraries/triforge.md) | @triforge Three.js suite (3D/three-js) — package picking, FINDINGS workflow |

</details>

<details>
<summary><strong>meta/ — maintaining the library itself</strong></summary>

| Skill | Purpose |
|---|---|
| [skill-writer](skills/meta/skill-writer.md) | The quality bar for writing new skills — triggers, checkable rules, loop |
| [mod-writer](skills/meta/mod-writer.md) | Quality bar for Claude Code mods — mod vs script vs hook, fail-open rules, validate/test loop, API traps. Claude Code only |
| [mod-setup](skills/meta/mod-setup.md) | Opt-in installer for the kit's mods in [`mods/`](mods/) — version/surface check, review of what each mod touches, install, confirm. Claude Code only |
| [install-kit](skills/meta/install-kit.md) | Install, update, uninstall, archive/unarchive or merge git hooks into any project — all at once, hand-picked, auto-detected, or by named stack preset (Astro/Next.js/Laravel); `cli.js` does the mechanical copy/move deterministically (tracked by a `.ai-dev-kit.json` manifest), `verify.js` mechanically re-checks the result before the install is reported done; click-to-answer in Claude Code, a plain numbered-menu prompt elsewhere (no package install needed); runs from the library, never copied into the target project |
| [skill-scope](skills/meta/skill-scope.md) | Canonical pinned/conditional-pinned/archivable classification — install-kit and handover both read this, edited nowhere else |
| [misfire-log](skills/meta/misfire-log.md) | Opt-in add-on — logs a misfire (a skill/mod/addon that should have fired but didn't, or got bypassed) the moment one is noticed; `misfire-log.report.js` ranks the repeat offenders for the next kit update |

</details>


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

## Voice, narration and personas

Two opt-in add-ons, never installed by default. Neither costs tokens while it runs: narration is a local script, and a persona adds a short fixed text to the session.

### Narration: Claude's replies read aloud (`narrate`)

A Stop hook keeps each reply, and pressing Play reads it aloud with [Piper](https://github.com/OHF-Voice/piper1-gpl), an offline neural text-to-speech engine, on your machine (like the play button on claude.ai). Switch the mode to `auto` and every reply is spoken as it arrives. No cloud service, no tokens. Code, tables and links are not read; they are announced ("Code and tables are on screen"). A reply is spoken once on its own, and long replies are read in full, in sentence-sized pieces, up to a time limit. Replies from parallel sessions queue and play in order instead of cutting each other off. Playback uses your current default output device, so headphones and Bluetooth are followed.

**Install it** by telling your agent *"set up text to speech for Claude's replies"*, or run the steps yourself (paths are `<skill-root>/narrate/` in a project, `skills/addons/narrate.*` in this repo):

| Step | Command |
|---|---|
| 1. Voices and Piper (about 125 MB download, asks first) | `node setup.js --voices` |
| 2. Add the Stop hook to `~/.claude/settings.json` | shown in [narrate.md](skills/addons/narrate.md) |
| 3. Install the `/narration` command | `node setup.js --controls commands` |
| Optional: use your own Piper voice for a slot | `node setup.js --add-voice male\|female <file.onnx or URL>` |

**All settings** (slash command `/narration <setting>`, or `node speak.js --<setting>`; every change is saved and applies to the next reply):

| Setting | Values | Default | What it does |
|---|---|---|---|
| `mute` / `unmute` | none | on | silence or restore narration; mute also stops speech in progress |
| `stop` | none | none | cut off what is playing now and clear the queue |
| `play` / `replay` | none | none | read the latest reply (the play button); a reply is otherwise spoken exactly once |
| `mode` | `manual`, `auto` | manual | `manual`: like the play button on claude.ai, a reply is kept until you play it; `auto`: every reply is spoken as it arrives |
| `voice` | `male`, `female` | female | which voice (British by default: female is Jenny (Dioco), male is Northern English Male) |
| `volume` | 0 to 100 | 100 | loudness |
| `speed` | 0.5 to 2 | 1 | pace; pitch is unaffected |
| `pitch` | -12 to 12 | 0 | semitones up or down; pace is unaffected (Piper voices only) |
| `maxSeconds` | 30 to 1800 | 1110 | longest reading, in seconds of speech, converted to characters at your current speed and capped at 12000 characters (about 12 minutes at speed 1); past it the voice says "the rest is on screen" |
| `status` | none | none | shows mute state, engine, voice, volume, speed, pitch and the character limit |

**On-screen controls (VS Code):** `node extensions/narrate-buttons/install.js`, then reload the window. It adds one footer button that opens a popup tray with every control (volume, speed, pitch and reading time have inline -/+ buttons and the tray stays open while you adjust), plus an **AI Dev Kit** sidebar with the same controls. Set `narrateButtons.footer` to `tray+play` for a separate Play button next to the tray. The controls: narration (play, when to speak, mute, voice, volume, speed, pitch, reading time with +/- buttons), persona picker. A waiting reply turns the Play button yellow. Narration plays on the Play button by default (like claude.ai); switch it to speak every reply with *When to speak*. Every click runs the same scripts the slash commands use. `--remove` uninstalls.

### Voices, files and platforms

| Item | Detail |
|---|---|
| Default voices | British: `en_GB-jenny_dioco-medium` (female, Jenny (Dioco), attribution required, commercial use permitted) and `en_GB-northern_english_male-medium` (male, CC-BY-SA 4.0), downloaded at install, never shipped in this repo. Installs that only have the older American voices (`en_US-ljspeech-medium`, `en_US-joe-medium`) keep using them until `setup.js --voices` is run |
| Your own voice | `--add-voice` registers any Piper `.onnx` file with its `.onnx.json`; a cloned or character voice can plug in through `"engine":"command"` (any program that reads text and writes a wav). Check the licence yourself and never commit a cloned voice or its audio. |
| Settings file | `~/.claude/narrate.json`: `engine`, `gender`, `volume`, `speed`, `pitch`, `maxSeconds`, `max` (fixed character limit), `voices`, `piper`, `command` |
| Other files | `~/.claude/voices/` (voices), `narrate.off` (mute switch), `narrate-last.json` (last reply) |
| Windows | tested, including headphones; falls back to the built-in Windows voice without Piper |
| macOS, Linux, Android (Termux) | player choice (`afplay`, `paplay`/`pw-play`/`aplay`, `termux-media-player`) is unit-tested only, not heard on a real device |

### Reply personas (`personality`)

Six original personas change how replies are worded for your skill level. They change wording only: facts, code, paths and verification never change. A persona adds about 150 to 190 tokens per session. It does not make the model less accurate: on 20 questions with objective answer checks (JavaScript and Python behavior, SQL, git recovery, security, and multi-part explanations such as race conditions, CORS and N+1 queries), answers with a persona were as correct as with none on both Haiku and Sonnet, and every miss was a correct answer in plain words that a keyword check did not recognize. A shared rule makes completeness win over the word limits, so no step, fix or warning is dropped. Replies came out 2 to 36% shorter on Haiku (one run per question, Haiku and Sonnet, plus a 16-question repeat).

| Level | Language | Female | Male |
|---|---|---|---|
| `novice` (new to coding, junior) | plain words, terms explained once, reason before step, numbered steps, under 150 words | **Maya**, gentle guide | **Leo**, calm steady mentor |
| `mid` (working developer) | everyday dev terms unexplained, advanced ideas in one clause, reason and fix together, under 100 words | **Nora**, upbeat peer | **Jonas**, casual and dry-humored |
| `pro` (professional) | full jargon, result first, exact names, no preamble or recap, under 60 words | **Vera**, precise and neutral | **Victor**, blunt and minimal |

The install offers eight choices: the six personas, `none`, or `custom` (your own file or a starter to edit), and copies only the one you pick. Change it any time with `/persona set female|male novice|mid|pro`, `/persona off`, `/persona status` or `/persona list` (applies from the next session). A project can override your choice with `<project>/.claude/personality.json`. To replace a persona, put your own `<gender>-<level>.md` in `~/.claude/personas/`, or choose `custom` and edit `~/.claude/personas/custom.md`. Add the SessionStart hook shown in [personality.md](skills/addons/personality.md) once.

Licences and credits for Piper and the voices: [CREDITS.md](CREDITS.md).

## Claude Code mods (all nine)

Mods are small, optional Claude Code plug-ins in [`mods/`](mods/). They run in code, so unlike skills they fire every time. Each one fails open (if it breaks, your work continues), none depends on another, and nothing in the kit needs them. Install them by saying `set up mods`; [`mod-setup`](skills/meta/mod-setup.md) reviews what each one touches first. Claude Code only.

| Mod | What it does | Kind | Needs or pairs with |
|---|---|---|---|
| `budget-ledger` | Logs real token use, cost, cache and tool-result sizes per turn, one file per session; adds `/budget` | observes only | nothing |
| `precommit-gate` | Gates `git commit` and `git push`: blocks leaked secrets, secret files, bad messages and `--no-verify`; warns once on stray files and debug leftovers | blocks | the `pre-commit` skill |
| `guard` | Denies edits to secret files, lockfiles and `.git`, and destructive commands (root-like recursive deletes, force push, deleting remote main, `reset --hard`, `clean -f`, publish, download piped into a shell); settings in `.claude/guard.json` | blocks | nothing |
| `edit-check` | After each edit, runs syntax, ESLint, Stylelint and standards checks and shows the model only the problems; a clean file adds nothing | reminds | the `pre-merge-gate` skill |
| `standards-chain` | Denies the first edit of a file until its coding-standards chain has been read, and again after a compaction | blocks | a `coding-standards/` folder |
| `debug-nudge` | One reminder at the first failed test or build, and one at the second failed fix, to stop editing and apply `debug-protocol`; also reads failure text hidden by pipes | reminds | the `debug-protocol` skill |
| `eta-nudge` | Reminds the agent to state a time estimate when a call is backgrounded, and every 10 minutes after the first 5 | reminds | the `plan-first` skill |
| `output-compact` | Shortens long Bash and PowerShell output before the model reads it; every failure line survives | rewrites output | the `session-budget` skill |
| `prefilter-rank` | Ranks Grep and Glob results (5 to 40 files) by relevance using the local Laya model, so low-relevance files can be skipped; local only, removes nothing; starts Laya itself on the first big Grep or Glob and waits up to 20 s for the ranking on CPU | reminds | the `system1-prefilter` add-on with local Laya set up |

## Scripts and git hooks

Scripts are plain Node (no packages) that do the mechanical work so the agent does not spend tokens on it. Skills and commands call them; you can also run them yourself with `node <skill-root>/<skill>/<script>.js`.

| Script | What it does | Command |
|---|---|---|
| `code-audit/audit.js` | Counts violations of 47 script-checkable standards rules across a whole project and lists `file:line`; `--list` shows every rule | `/audit` |
| `pre-commit/check.js` | Staged-diff checks: secrets, secret files, stray files, debug leftovers, message format, `project-context/` files | `/commit-check` |
| `pre-commit/install-hook.js` | Installs `check.js` as real `pre-commit` and `commit-msg` git hooks, so human commits and tools without mods are checked too (`install`, `uninstall`, `status`) | `/githooks` |
| `pre-merge-gate/edit-check.js` | Per-file checks (syntax, lint, standards); also used by the `edit-check` mod | by the mod |
| `session-budget/compact.js` | Shortens long command output without dropping a failure line | `/quiet` |
| `session-budget/report.js` | Prints the token ledger: tokens, cost, cache, waste, per-turn time | `/token-report` |
| `plan-first/delegate.js` | Runs a written plan on a cheaper Claude model in one headless call and prints a compact result | by the skill |
| `resolve-conflicts/scope.js` | Lists the conflict set with a side legend and checks role scope | `/resolve-conflicts` |
| `responsive-check/probes.js` and `measure.js` | Plans viewports from your breakpoints, then measures layout problems in a browser (Playwright) | `/responsive-check` |
| `optimize-assets/convert.js` | Finds heavy assets, converts (webp, avif, jpg, mp4, woff2, and more), compresses and pre-compresses them; originals are never touched | `/optimize-assets` |
| `memory-gardener/stale.js` | Lists memory and handover bullets that name deleted files (report only) | `/stale` |
| `misfire-log/append.js` and `report.js` | Logs a skill or mod that should have fired but did not; ranks repeat offenders | by the skill |
| `project-context/scan.js` and `figma.js` | Tracks which project docs changed; turns exported Figma PNG or SVG files into a design summary | `/ctx`, `/figma` |
| `install-kit/cli.js` | Installs, updates, uninstalls, archives/unarchives skills and merges git hooks — the mechanical half of the installer; asks a plain numbered-menu question for any flag left out outside Claude Code (no package install needed) | by the installer |
| `install-kit/verify.js` | Re-checks an install on disk before it is reported done | by the installer |
| `narrate/speak.js`, `setup.js` | Narration and installer ([reference](#voice-narration-and-personas)) | `/narration` |
| `personality/inject.js`, `setup.js` | Persona injector and installer | `/persona` |
| `system1-prefilter` scripts and the MCP servers | Local decision model, image reading, image generation ([MCP tools](#optional-ai-tools-free-and-local-mcp-servers-for-any-coding-agent)) | by tool |

**Git hooks.** `/githooks` (or `node pre-commit/install-hook.js install`) writes two hooks into your repository: `pre-commit` runs `check.js --staged` and fails before the editor opens on secrets or secret files, and `commit-msg` adds the message-format check. Only BLOCK findings fail a commit; warnings print and pass. A missing `node` never blocks a commit. `git commit --no-verify` skips hooks, which the `pre-commit` skill forbids. An existing hook of yours is never overwritten without `--force`, and `--force` keeps a copy.

## Install into a project

1. Copy `skills/` — and `coding-standards/` if the project should carry the standards — into the project root. (Or keep one clone of this repo anywhere and point every project at it with `--library <path>`; either way, it's the same `install-kit.cli.js` doing the work.)
2. Open your AI coding tool in that project and say:

   > read skills/README.md and install

3. Choose **everything**, **pick**, **auto-detect** (scans the project and cites the signal before pinning anything), or a **stack preset** (name the stack directly — Astro, Next.js, Laravel — no scan needed). The installer detects which coding tool you're in, copies the chosen skills to that tool's skill root (`.claude/skills/` for Claude Code, `.opencode/skills/` for OpenCode), wires the standards into that tool's session file (`CLAUDE.md` or `AGENTS.md` respectively), mechanically re-verifies the result, and reports what was installed — or exactly what still needs fixing before it's reported done. `install-kit` itself is never copied into your project — it always runs from wherever the library lives, against `--root <target>`, so there's nothing left behind to clean up afterward.

**How you answer those questions depends on where you're running it — pick based on that, not preference:**

| Where | How you answer | Best for |
|---|---|---|
| **Claude Code chat (recommended default)** | Click multiple-choice options at every decision point — mode, tool confirmation, which skills, comment style, context code. Typing only comes up for a hand-picked skill list or an override's specifics. | Anyone already working in Claude Code — fewest keystrokes, nothing to remember. |
| **OpenCode, Codex, or a plain terminal** | The installer asks each question as a plain numbered list — type the number of your answer and press Enter. No extra software to install first. | Tools with no click-to-answer chat widget, or installing with no AI in the loop at all — see the walkthrough just below. |
| **Direct CLI flags** (`--tool`, `--skills`, `--standards`, ...) | No questions at all; fully scripted. | CI, re-installs across many projects, or anyone who already knows exactly what they want. |

None of these change *what* gets installed — only how you're asked. If you're not sure, let whichever tool you're already in drive it; it'll default to the right mode for where it's running.

### Installing from a terminal (PowerShell, Command Prompt, Mac/Linux shell) — a complete walkthrough

If you've never used a terminal before, this is every single thing to type, in order. It's the same on Windows, Mac, or Linux except step 1.

1. **Open a terminal.** Windows: click Start, type `PowerShell`, press Enter. Mac: open Terminal from Spotlight. Linux: open your usual terminal app.

2. **Check that Node.js is installed.** Type this and press Enter:

   ```shell
   node --version
   ```

   If you see something like `v22.11.0`, you're set — skip to step 3. If you see an error instead, Node.js isn't installed: go to [nodejs.org](https://nodejs.org), download the button labeled **LTS**, run the installer with its defaults, then close and reopen your terminal and try step 2 again.

3. **Download a copy of this kit.** Type these three lines one at a time, pressing Enter after each:

   ```shell
   cd Documents
   git clone https://github.com/AftabIbrahimKazi/ai-dev-kit
   cd ai-dev-kit
   ```

   (If you don't have `git`, download the ZIP from the green "Code" button on [this repo's GitHub page](https://github.com/AftabIbrahimKazi/ai-dev-kit), unzip it, and `cd` into the unzipped folder instead.)

4. **Run the installer against your actual project.** Replace `C:\path\to\your-project` below with your real project's folder (drag the folder into the terminal window to paste its path automatically), then type:

   ```shell
   node skills/meta/install-kit.cli.js install --root "C:\path\to\your-project"
   ```

   You don't need to know any other flags. The script asks you the rest, one question at a time, printed like this:

   ```text
   Target tool:
     1) claude
     2) opencode
     3) codex
   Type a number [1]:
   ```

   Type the number of your answer and press Enter (or just press Enter to accept whatever's shown in `[brackets]`). For a question that lets you pick several things, it says so and lets you type numbers separated by commas (`1,3,4`), or the word `all`. For a yes/no question, type `y` or `n`.
5. When it's done, it prints a summary of exactly what was installed and where. That's the whole process — there's nothing else to run afterward, and nothing extra to install first (no `npm install`, no other software).

**Already comfortable with command-line flags?** Skip the walkthrough and call every flag directly — see the full reference below. **Working inside Claude Code chat instead of a terminal?** Skip all of this too — just say *"read skills/README.md and install"* and answer the same questions as clickable buttons instead.

### Every `install-kit.cli.js` command and flag

Run as `node skills/meta/install-kit.cli.js <command> [flags]` from inside the kit folder (the `cd ai-dev-kit` from step 3 above). **Leave any flag below out on a real terminal and the script asks for it as a plain numbered question instead of erroring** — exactly like the walkthrough above, just for whichever piece you didn't already specify.

**`list`** — prints every skill (and its companions) the library can install; nothing is written to disk.

| Flag | What it does |
|---|---|
| `--library <path>` | Required. Path to the ai-dev-kit repo or any clone of it. |
| `--json` | Prints machine-readable JSON instead of plain text. |

**`install`** — copies the chosen skills (and, optionally, the standards system) into a target project. Safe to re-run; only files that actually differ get touched.

| Flag | What it does |
|---|---|
| `--library <path>` | Required. Where the skills are copied *from*. |
| `--root <path>` | Required. The target project to install *into*. |
| `--tool claude\|opencode\|codex` | Required. Which tool's skill root and session file to route to (`.claude/skills/`+`CLAUDE.md`, `.opencode/skills/`+`AGENTS.md`, or `.agents/skills/`+`AGENTS.md`). |
| `--skills a,b,c` | The skill names to install, comma-separated. Append `:companion1+companion2` to a name to install only specific companions of it (e.g. `mcp-manager:stitch`) instead of all of them. |
| `--standards` | Also copies `coding-standards/` and generates the project's `CLAUDE.md`/`AGENTS.md` (only if that file doesn't already exist). |
| `--comment-style-level none\|terse\|descriptive` | Sets how much the AI comments its own code. Only meaningful when `comment-style` is in `--skills`; carries forward automatically on a later `install`/`update` if you don't repeat it. |
| `--context-code X7\|none` | The 2–4 character marker RULE AI-01 asks for, stamped into the generated session-protocol file. Only used together with `--standards`. `none` writes a bare `[CX]` instead. |
| `--force` | Overwrites an existing `coding-standards/` folder wholesale instead of only merging the files that changed. |
| `--json` | Prints the result (including the verify check) as JSON instead of plain text. |

**`update`** — re-syncs already-installed skills with whatever the library currently has, and offers any pending skill-rename migrations.

| Flag | What it does |
|---|---|
| `--library <path>` | Required. |
| `--root <path>` | Required. |
| `--skills a,b` | Which already-installed skills to refresh. |
| `--all` | Refresh every skill the manifest (`.ai-dev-kit.json`) already tracks, instead of naming them. |
| `--context-code X7\|none` | Re-applies a new context code if the project has `coding-standards/` installed. |
| `--apply-migrations a,b\|all` | Applies pending rename migrations for the named old skill name(s), or `all` of them — carries `learnings.md` forward, deletes the old folder only after the new one lands. Without this flag, a pending migration is only reported, never applied. |
| `--json` | Prints the result as JSON. |

**`uninstall`** — removes skill folders this kit installed. Never touches a hand-authored or third-party folder sharing the same skill root, even with `--all`.

| Flag | What it does |
|---|---|
| `--root <path>` | Required. |
| `--skills a,b` | Which installed skills to remove. |
| `--all` | Remove every skill the manifest tracks. |
| `--remove-standards` | Also deletes `coding-standards/`. The session-protocol file (`CLAUDE.md`/`AGENTS.md`) is **never** deleted by any flag — it may carry your own edits; remove it yourself if you want it gone too. |
| `--json` | Prints the result as JSON. |

**`archive`** / **`unarchive`** — move a skill between the active skill root and `<tool-dir>/skills-archive/` (still on disk, just invisible to the tool) and back. This is what `handover` calls to "mount/unmount" a skill for a session that doesn't need it.

| Flag | What it does |
|---|---|
| `--root <path>` | Required. |
| `--skills a,b` | Which skills to archive (must currently be installed) or unarchive (must currently be archived). |
| `--all` | Archive every currently-installed skill, or unarchive every currently-archived one. |
| `--json` | Prints the result as JSON. |

**`merge-hooks`** — merges the sample Claude Code hooks documented in `hooks-enforcement.md` into `.claude/settings.json`, deduped, never touching anything else already in that file.

| Flag | What it does |
|---|---|
| `--library <path>` | Required. |
| `--root <path>` | Required. |
| `--json` | Prints the result as JSON. |

Details, including per-skill manual installs: [skills/README.md → Installing into a new project](skills/README.md#installing-into-a-new-project).

## Slash commands

Slash commands are shortcuts **you** type; the agent never runs them on its own. Anything typed after the name is passed to the command (`/audit src/components`). Most of the kit needs no command: the mods and git hooks fire by themselves, and skills load when the agent recognises their trigger. Reach for a command at the moments below. Type `/kit` in a session for this table.

### Most useful commands

| Command | Use it when | How to use it |
|---|---|---|
| `/commit-check` | You are about to commit | `/commit-check` or `/commit-check --message "feat: add nav"`. Reports secrets, secret files, stray files and message format; a BLOCK means do not commit. |
| `/audit` | You want a health check of the whole project | `/audit`, `/audit src/` or `/audit --standard css,html`. Prints counts per rule and the worst files. |
| `/debug-protocol` | Something fails and the cause is unknown | `/debug-protocol the build fails with a weird error`. Forces reproduce first, one hypothesis, one change at a time. |
| `/plan-first` | The task is big or touches many files | `/plan-first add dark mode and a language switcher`. Gives a short file list and plan before any edit. |
| `/quiet` | A test or build run prints a wall of output | `/quiet npm test`. Shortens the output, keeps every failure line, shows the exit code. |
| `/pickup` | Starting a session | `/pickup`. Loads `handover.md` (current state, in-flight work, next step) so nothing has to be re-explained. Reads only; edits nothing. |
| `/wrap-up` | Ending a session | `/wrap-up` or `/wrap-up next task is the pricing section`. Rewrites `handover.md` in place (no ever-growing log); the task you name goes first under Next steps. Does not commit. |
| `/token-report` | The session feels expensive | `/token-report` or `/token-report --last 3`. Shows where the tokens went. Needs the ledger from the `budget-ledger` mod. |
| `/eta` | A task is taking a while, or is backgrounded, and you want its time estimate without asking in prose | `/eta`. Restates the current task's (and checkpoint's) time estimate — a judgment call, not a measurement; `plan-first` states it unprompted past 5 min or for background/parallel work. |
| `/kit` | You forget which command to use | `/kit` prints this table; `/kit my build keeps failing` names the best command. |
| `/format` | You want answers as a table, bullets, one-liners or yes/no | `/format bullets`; `/format reset` returns to the default (a table where the data has structure). |
| `/narration` | You use the `narrate` add-on and want to mute, replay, or change the voice, volume, speed or pitch | `/narration mute`, `/narration replay`, `/narration voice male`, `/narration speed 1.3`. |
| `/persona` | You use the `personality` add-on and want replies worded for your skill level | `/persona set female novice`, `/persona off`, `/persona list`. Applies from the next session. |

### All commands

**Kit commands** (templates in [`skills/commands/`](skills/commands/); installed on request by `install-kit` into `.claude/commands/` or `.opencode/commands/`; each runs a kit script and hands the output to the agent, so no skill has to be matched first):

| Command | What it does | Arguments | Needs |
|---|---|---|---|
| `/audit` | Standards audit of the project | script options: a path, `--standard`, `--rule`, `--top N` | `code-audit` |
| `/commit-check` | Mechanical pre-commit check of the staged change | `--message "…"`, `--all` | `pre-commit` |
| `/token-report` | Token and cost report from the ledger | `--last N`, `--sid ID` | `session-budget` |
| `/quiet` | Runs a command with shortened output | the command, e.g. `npm run build` | `session-budget` |
| `/stale` | Lists memory and handover bullets that name deleted files (report only) | none | `memory-gardener` |
| `/pickup` | Loads `handover.md` as the project state; reads only | none | `handover` |
| `/wrap-up` | Rewrites `handover.md` in place for the next session | optional: the next task | `handover` |
| `/githooks` | Shows git hook status and offers to install them | none | `pre-commit` |
| `/resolve-conflicts` | Resolves merge/rebase conflicts: mode `both` (default), `ours`, `theirs`; pace `all`, `auto` (default), `step`; role guardrails | `--role frontend|backend`, `--out leave|ours|theirs`, `--note "…"` | `resolve-conflicts` |
| `/responsive-check` | Checks a page at range-based viewports (the six RULE 17 zones by default) and proposes range-based fixes | `--range a-b` (repeatable), `--min N`, `--max N`, `--width W`, `--ranges a-b,…`, `--detect`, `--max-probes N` | `responsive-check` |
| `/optimize-assets` | Finds heavy assets, converts them (`webp`, `avif`, `jpg`, `mp4`, `woff2`, ...) or compresses them in place of the same format; originals are never touched | `scan [dir]`, `convert <paths> --to webp,avif`, `compress <paths>`, `precompress <paths>`, `tools`, `refs <assets>`, `--preset vision|web` | `optimize-assets` |
| `/ctx <init|analyze|status|add|detect>` | Sets up and maintains the private `project-context/` docs folder: folders by auto-detect, project type or your own list; an `INDEX.md` per folder so Claude reads facts, not raw files | `init [--folders a,b] [--copy]`, `analyze [folder]`, `status`, `add <folder> <file>`, `detect` | `project-context` |
| `/figma <folder>` | Turns exported Figma PNG/SVG files into `project-context/design/figma.md`: frame sizes, colors, fonts, type sizes, text. No MCP, no Figma account tokens, no connector cost | a folder or files of exports, optional `--link <figma url>`, `--write` to save | `project-context` |
| `/narration <setting>` | Controls reply narration without opening a file | `mute`, `unmute`, `stop`, `replay`, `status`, `voice male|female`, `volume 0-100`, `speed 0.5-2`, `pitch -12..12`, `maxSeconds 30-1800` | `narrate` |
| `/persona <setting>` | Chooses how replies are worded; applies from the next session | `set female|male novice|mid|pro`, `off`, `status`, `list` | `personality` |
| `/kit` | This cheat sheet | optional: describe your situation | none |
| `/eta` | Restates the active task's time estimate and checkpoint, no script | none | `plan-first` |
| `/format <name>` | Sets the response shape for the session, no script | `table`, `bullets`, `oneline`, `bool`, `reset` | none |

**Mod command** (Claude Code, from the `budget-ledger` mod): `/budget` shows the same ledger report.

**Skills by name** (Claude Code turns every installed skill into `/<skill-name> <free text>`, which loads it on purpose instead of waiting for the agent to match it):

| Group | Commands | Use when |
|---|---|---|
| Workflow | `/debug-protocol`, `/plan-first`, `/intent-capture`, `/interpretation-checkpoint`, `/handover` (the skill; `/pickup` and `/wrap-up` are its read and write commands), `/pre-commit`, `/pre-merge-gate`, `/session-budget`, `/agent-usage`, `/mode-kernel`, `/perf-audit`, `/e2e-scaffold`, `/role-session`, `/resolve-conflicts`, `/responsive-check`, `/optimize-assets` | the situation in each skill's description |
| Standards | `/coding-standards`, `/code-audit`, `/comment-style` | editing code, auditing, or changing comment level |
| Memory | `/memory-bank`, `/memory-gardener`, `/skill-ablation` | recording decisions, pruning notes, testing which skills are still needed |
| Setup and authoring | `/install-kit`, `/mod-setup`, `/mod-writer`, `/skill-scope`, `/skill-writer` | installing the kit or mods, writing a skill or mod |
| Add-ons | `/project-context`, `/narrate`, `/personality` | setting up that add-on |
| Stack and tools | `/astro-page`, `/threejs-scene`, `/shopify-toolkit-install`, `/mcp-manager`, `/system1-prefilter`, `/strata-css`, `/triforge` | working in that stack or setting up that tool |
| Claude models | `/claude-all-models`, `/fable-5-1`, `/fable-5`, `/opus-5-5`, `/opus-5`, `/opus-4-8`, `/opus-as-fable`, `/sonnet-5-5`, `/sonnet-5`, `/haiku-5-5`, `/haiku-4-5`, `/hooks-enforcement` | choosing or prompting a Claude model |
| OpenCode models | `/opencode-all-models`, `/big-pickle`, `/deepseek-v4`, `/devstral-2`, `/glm-5-2`, `/gpt-oss`, `/kimi-k2-6`, `/local-small-models`, `/mimo-v2-5`, `/minimax-m3`, `/qwen3-coder` | choosing or prompting an open-weight model |

**Claude Code built-ins** (not part of the kit): `/help`, `/clear`, `/compact`, `/context`, `/model`, `/mcp`, `/plugin`, `/resume`, `/config`, and bundled skills such as `/code-review`, `/simplify`, `/security-review`, `/init`, `/loop` and `/schedule`. `/help` lists what your version has.

**Good to know**
- **What is reliable and what is not.** Mechanical layers (the git hooks, the mods, the scripts) always run; skills load by the model's judgment. In live runs on haiku and Sonnet the new skills triggered reliably, but `debug-protocol` did not always (it loaded in roughly 1 of 3 runs on a failing build; the `debug-nudge` mod raises that). `pre-commit` loaded in 30 of 30 haiku runs whenever there was something to commit. Treat the contract and the mods as the guarantee, and skills as the judgment layer.
- **New add-ons:** the `narrate` skill loaded on 6 of 6 prompts asking for spoken replies or dictation and the `personality` skill on 5 of 6 prompts asking to set up a persona (haiku), with no false trigger across 10 control runs. `/narration` and `/persona` ran in an installed-layout scratch project on haiku.
- **Tested:** all script-backed kit commands (`/pickup` and `/wrap-up` included) ran in Claude Code (`/audit` was last re-checked at script level after its `--no-fail` change); `/audit` also runs in OpenCode. `/eta` is untested (no script to run headless); `/figma` is covered by unit tests only, not a live run — it's a plain instruction template, same shape as `/kit`. In OpenCode (1.18, free `glm-5.3-flash-free` model) a clean kit install answered with the `[CX]` marker and loaded the right skill on 3 of 3 prompts (`optimize-assets`, `resolve-conflicts`, `responsive-check`) with no skill on a control question. Skills by name were checked for `/debug-protocol` in Claude Code only; Codex was not run.
- **Free text vs options:** kit commands pass what you type to a script, so give them options, not sentences (`/audit focus on a11y` prints "unknown option"). Skills by name take plain sentences.
- **`/quiet` vs the `output-compact` mod:** same compaction engine. The mod does it automatically for every Bash and PowerShell call in Claude Code; `/quiet` is the manual version for OpenCode, Codex, or a project without the mod.
- **`prefilter-rank` mod:** automates `system1-prefilter`'s local-Laya narrowing after Grep/Glob (5-40 results) — adds a ranked read-order reminder, never removes a result. Loopback-only (`127.0.0.1`, checked in code, never the hosted-provider path), fails open if Laya isn't configured or reachable. If Laya is set up but not running, the first qualifying Grep/Glob starts it in the background (`laya-ctl.js start`, at most once per 5 minutes) and goes unranked; later ones are ranked. On CPU, Laya scores about 3 candidates a second (17 files in 5 to 6 s), so the ranking wait is up to 20 s; a GPU makes it near-instant. Needs the addon's local-Laya path already set up; `mod-setup` won't offer it before that.
- **`/budget` vs `/token-report`:** the same report; the mod owns `/budget`, so the kit's command has a different name to avoid a clash.
- **Always-on checks do not need a command:** secrets, bad commit messages, destructive commands and standards violations are caught by the mods (Claude Code) and, if installed through `/githooks`, by git hooks (every tool).

## Key ideas

- **Self-improving skills.** Every skill reads a `learnings.md` sidecar at start and appends one distilled lesson at end. Learnings are per-project (never committed here, never copied by the installer) — each project's copies adapt to that project.
- **Adaptive to change.** Skills that describe living things (Claude models, libraries, frameworks) carry staleness guards: verify against the live source, follow it over the skill text, log the correction.
- **Standards as law, gaps flagged.** The standards system is declarative and testable; where it is silent, the AI flags the gap instead of inventing a rule ([RULE AI-12](coding-standards/ai-standards.md)).
- **Response rules.** [RULE AI-17](coding-standards/ai-standards.md) makes file references clickable links where the tool renders them; [RULE AI-18](coding-standards/ai-standards.md) makes the answer's shape follow the data (a table for a comparison, one line for a single fact, a short answer to a yes/no question).
- **Sequential by default, parallel when you say so.** The `role-session` skill coordinates multiple parallel AI sessions — Claude Code, OpenCode, or both (role charters, atomic `mkdir` file claims, a git commit token, session ids) and switches itself off in projects without the parallel structure.
- **Token-lean by design.** Skill descriptions are hard-capped, bodies stay under ~120 lines, read-efficiency rules are part of the standards, and the `memory-gardener` skill prunes accumulated knowledge.
- **Intent before implementation, a self-check before handoff.** `intent-capture` pins down goal/constraints/done-when on ambiguous asks before any plan is made; `pre-merge-gate` re-checks a diff against the loaded standards before a commit or review handoff — both are prose protocols, not tool-specific.
- **Measured, not promised.** Where a claim has a number, the number and its sample size are stated: Haiku 5.5 running a written plan cost $0.049 against $0.581 for Sonnet 5.5 on six test plans (both passed all six); the audit script found the same lines as a model-led audit in 0.2 s with no tokens, where the model cost $0.026 and missed one file (one project, three rules); the output compactor shrank a verbose passing test log by 59% and failure output by about 0%. These are small samples from the author's own projects: indicative, not guarantees.
- **Claude Code enhancements stay optional and isolated.** Where a Claude Code-only mechanism (like hook-based enforcement in `hooks-enforcement`) can mechanically assist a rule, it lives under `skills/models/claude/` as an opt-in add-on — the underlying contract in `coding-standards/ai-standards.md` works the same with or without it, on any tool.

## Recent additions

- **Install-kit mechanized, then the whole kit ported to TypeScript.** `install-kit.cli.js` now does install/update/uninstall/archive/unarchive/merge-hooks as one deterministic script tracked by a `.ai-dev-kit.json` manifest, instead of a narrated file copy. Every question the installer asks defaults to a click (`AskUserQuestion` in Claude Code); outside a chat tool — OpenCode, Codex, a bare terminal — the same script asks a plain numbered question for whatever flag is missing, built on Node's own `readline` so there's no extra package to install first. All 27 companion scripts are now authored in `.ts` and shipped as compiled `.js`.
- **Narration controls without hotkeys.** The keyboard hotkeys and voice dictation were removed: the global keyboard hook did not fire reliably and could clash with other shortcuts. Narration is now controlled by `/narration` and by the optional VS Code extension `extensions/narrate-buttons` (a footer tray, an AI Dev Kit sidebar and a Play button that turns yellow when a reply is waiting).
- **Play-button narration and British voices.** `narrate` now defaults to manual mode (a reply is kept until you press Play, like claude.ai), with `auto` to speak every reply. The default voices are British (Jenny (Dioco) and a Northern English male); older American voices keep working until the new ones are downloaded.
- **Read replies aloud: `narrate`.** An opt-in Stop hook speaks each reply with Piper, offline, with a male and a female voice, mute, volume, speed and pitch. Controls are the `/narration` slash command plus VS Code buttons (`extensions/narrate-buttons`). By default a reply is kept and played with the Play button (`/narration play`), like claude.ai; `/narration mode auto` speaks every reply as it arrives. The default voices are British (Jenny and a Northern English male). Replies from parallel sessions queue instead of cutting each other off, each reply is spoken once on its own, `/narration replay` plays it again, and playback follows the Windows default output, so headphones work. Voices are downloaded at install and are not in the repo; custom Piper voices can be added. Covered by 37 script tests; see the status note in [Voice, narration and personas](#voice-narration-and-personas).
- **Reply personas: `personality`.** Six original personas (female and male at novice, mid and pro level) that change wording only. The install asks for one of eight choices and copies only that persona. About 150 to 190 tokens per session; no accuracy loss on 20 objectively graded questions (Haiku and Sonnet), replies up to 36% shorter.
- **Command name clash avoided.** The narration command is `/narration`, because `/narrate` is the name of the skill and Claude Code launched the skill instead of the command.
- **Lower always-on cost, no feature removed.** Measured with `findings/harness/audit.js` (estimates at ~4 characters per token): a typical install adds about 1,750 tokens of skill descriptions per session and the full Claude Code kit about 2,440, plus the `CLAUDE.md` contract (the template is about 1,440 tokens; `install-kit` writes a leaner one without the template preamble, and adds the parallel-session section only with `role-session`). Command templates carry `disable-model-invocation: true`, so Claude Code keeps their descriptions out of the model's context while you can still type them (0 always-on tokens). Model-skill descriptions dropped their feature lists, since the model name is what triggers them. Measured on haiku: the shortened model skills still triggered 8 of 8 with no false trigger. Details in [`findings/2026-10-27-new-features-audit.md`](findings/2026-10-27-new-features-audit.md).
- **Skill Triggers table.** The `CLAUDE.md` contract carries a short table mapping situations to skills ("commit what I have" to `pre-commit`, a failing build to `debug-protocol`, and so on), because skills load by the model's own judgment and sometimes do not. With the table, `pre-commit` loaded 4 of 4 on a "commit what I have" prompt (1 of 2 before). `install-kit` removes a row when its skill is not installed.
- **Merge conflicts, responsive layouts, asset weight.** Three new workflow skills, each with a script and a command: [`resolve-conflicts`](skills/workflow/resolve-conflicts.md) (modes `both`, `ours`, `theirs`; role scope leaves files owned by another role alone), [`responsive-check`](skills/workflow/responsive-check.md) (viewport plan from the project's own breakpoints, then a Playwright measurement) and [`optimize-assets`](skills/workflow/optimize-assets.md) (scan, convert, compress and pre-compress images, video, fonts and SVG, checking the file signature before reading dimensions). Together with `project-context`, they triggered 14 of 14 times on haiku with no skill named in the prompt.
- **Project docs without an MCP: `project-context`, `/ctx`, `/figma`.** An opt-in, gitignored `project-context/` folder holds requirements, brand notes and design, each folder with an `INDEX.md`; `/ctx` sets it up and tracks what changed so only new or modified files are re-read. `/figma` needs no Figma connector and no tokens: export frames from Figma as SVG (colors, fonts, type sizes, text) and PNG (reference), and a script drafts `project-context/design/figma.md` from the files. A pre-commit rule blocks staged `project-context/` files.
- **`debug-nudge` reminds at the first failed check too.** The mod used to speak only at the second failed fix; it now also gives one short reminder at the first failed test or build command of a session, because `debug-protocol` often does not load by itself at that moment. It also reads failure text, because a pipe such as `npm test | tail` hides the exit code and the mod used to see nothing. On a bug with an unclear cause, `debug-protocol` loaded in 3 of 6 haiku runs with the mod and 0 of 6 without (small sample; the bug was fixed in all 12).
- **Command names that no longer collide.** `/resume` is now `/pickup` and `/hooks` is now `/githooks`, because Claude Code ships built-ins with the old names. `/eta`, `/format`, `/ctx` and `/figma` are new.
- **`install-kit` removes itself after a clean install** (`install-kit.verify.js --finish`); later additions run from the kit repo.
- **Time estimates & checkpointing.** `plan-first` now states a time estimate (as a range, not false precision) before any task estimated past 5 minutes, or anything backgrounded or part of a sequential/parallel chain, and designs that work into self-contained checkpoints (target ≤10 min, worst case ≤15, longer only when a step is genuinely unsplittable). The new `/eta` command restates the current estimate/checkpoint on demand without re-deriving it from scratch. The `eta-nudge` mod makes the reminder half deterministic instead of memory-dependent (nudges on a backgrounded call, and every 10 minutes past the first 5). The estimate itself stays the model's judgment call — nothing can mechanize that — but `session-budget.report.js` now surfaces each turn's real wall-clock duration (`budget-ledger` already logged it, just never read it back), so an estimate can finally be checked against what actually happened instead of staying pure vibes.
- **`prefilter-rank` mod.** Automates `system1-prefilter`'s local-Laya narrowing: ranks a Grep/Glob result (5-40 files) by relevance to the task and adds a read-order reminder, instead of requiring the agent to call the `prefilter` MCP tool itself every time. Task text comes from the session transcript's last user message (`$.session.messages()` — free, no model call). Loopback-only by a host check in code (never trusts `SYSTEM1_BASE_URL` alone), never the hosted-provider path (no-ops if `SYSTEM1_API_KEY` is set instead), fails open if Laya isn't reachable. It also runs `laya-ctl.js start` to bring Laya up (a fixed script path, no user input). `mod-writer.md`'s "no network" rule now carries this one narrow, disclosed exception.
- **Install protocol, enforced.** [`install-kit`](skills/meta/install-kit.md)'s Step 4 now runs `install-kit.verify.js`, a mechanical re-check of the actual files on disk (flat skill layout, the CommonJS `package.json` shield, the session-protocol file with its Context-code placeholder actually filled in, `comment-style`'s level actually answered, `coding-standards/index.md` present) instead of trusting the agent's own narration — the install isn't reported done while it fails. A new **Stack preset** mode lets the user name a stack directly (Astro, Next.js, Laravel) instead of waiting on Auto-detect's scan; Next.js and Laravel presets install what the kit actually has and say plainly, in the report, which framework-specific layer doesn't exist yet rather than papering over the gap.
- **`output-compact` mod.** Runs `session-budget`'s compactor on every Bash/PowerShell result automatically, instead of depending on the agent remembering to pipe a command through it by hand. No-ops below the compactor's own savings floor, fails open, no network.
- **`misfire-log`.** Opt-in skill that logs the moment a skill/mod/addon should have fired but didn't (or got bypassed by a direct/manual path), with a `report.js` that ranks the repeat offenders — so a pattern noticed mid-task survives to actually drive the next kit update instead of staying a one-off memory.
- **Project-wide audit.** [`code-audit`](skills/standards/code-audit.md) checks 47 script-checkable rules (CSS, HTML, JS/TS, page SEO/accessibility/performance basics, git history, versioning) across a whole project, groups violations by rule with the worst files first, lists `file:line` on request and keeps a baseline so counts can only go down. It also lists what it cannot check, so the agent knows what still needs reading.
- **Optional Claude Code mods.** [`mods/`](mods/) ships nine opt-in mods installed through [`mod-setup`](skills/meta/mod-setup.md): `budget-ledger`, `precommit-gate`, `guard`, `edit-check`, `debug-nudge`, `standards-chain`, `output-compact`, `prefilter-rank` and `eta-nudge`. Each wraps a tool-agnostic script, a local loopback call, or a few pure rules, fails open, and nothing in the kit depends on them.
- **Delegated execution in plan mode.** [`plan-first`](skills/workflow/plan-first.md) can hand a written plan to the next cheaper model through `delegate.js`, with commit and push blocked for the executor, then verify and fix the result itself.
- **Haiku 5.5.** [`haiku-5-5`](skills/models/claude/haiku-5-5.md) covers the new adaptive-thinking Haiku, its breaking API changes against 4.5 and how to route to it.
- **Installs into ESM projects.** The installer now adds a one-line `package.json` at the skill root so the CommonJS companion scripts keep running inside Astro, Vite and other `"type": "module"` projects.

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
  addons/          ← opt-in, user-opted capabilities, never installed by default (system1-prefilter + local Laya, project-context, narrate, personality)
  mcp/             ← opt-in MCP servers: mcp-manager + one companion per server (stitch, local-vision, image-gen)
  commands/        ← opt-in slash-command templates (/audit, /commit-check, /token-report, /quiet, /stale, /githooks, /pickup, /wrap-up, /eta, /resolve-conflicts, /responsive-check, /optimize-assets, /ctx, /figma, /narration, /persona, /kit); each runs a kit script or is a plain instruction template (/eta, /kit)
mods/              ← optional Claude Code mods (budget-ledger, precommit-gate, guard, edit-check, debug-nudge, standards-chain, output-compact, prefilter-rank, eta-nudge), a local marketplace; each wraps a tool-agnostic script from a skill, a loopback-only local call (prefilter-rank), or a few pure rules (eta-nudge)
extensions/        ← optional VS Code extension (narrate-buttons): footer tray, sidebar and Play button for narration and persona; `node extensions/narrate-buttons/install.js`
tests/             ← tests for the kit's scripts (node tests/<name>.test.js) plus real captured logs under fixtures/
migrations/
  RENAMES.md       ← skill rename ledger — install-kit reads it to migrate old installs (never delete)
coding-standards/
  index.md         ← system map: layers, reading order, file-to-role mapping (start here)
  *-standards.md   ← global rules per discipline (css, html, js/ts, git, seo, a11y, qa, ai, …)
  */               ← file-role partials per discipline
  frameworks/      ← framework additions/overrides (astro, bootstrap, strata-css)
  tooling/         ← lint configs enforcing the machine-checkable rules
  CLAUDE.example.md← session-protocol template — wire into CLAUDE.md (Claude Code) or AGENTS.md (OpenCode)
```

## Maintaining the kit

- **This repo is the canonical home.** Improve skills here, then re-run the install into projects; the installer diffs before overwriting so locally-evolved copies are never silently clobbered.
- New skills follow the quality bar in [skills/meta/skill-writer.md](skills/meta/skill-writer.md).
- Standards edits follow the repo's own principles ([index.md → Principles](coding-standards/index.md)): testable, declarative, wrong/right examples mandatory. Machine-checkable rule changes update [`coding-standards/tooling/`](coding-standards/tooling/) in the same commit.
- `learnings.md` files are gitignored — they belong to the project that earned them. Lessons worth keeping forever get promoted into skill bodies (see `memory-gardener`).

## Where things live, and how to turn things off

| Thing | Where it lives | Scope | Turn it off |
|---|---|---|---|
| Skills and standards | `<project>/.claude/skills/`, `<project>/coding-standards/` | one project | delete the folder |
| Slash commands | `<project>/.claude/commands/` | one project | delete the file |
| Mods | installed by `mod-setup` into Claude Code | per user or per project | remove the plug-in with `/plugin` |
| Git hooks | `<repo>/.git/hooks/` | one repository | `node pre-commit/install-hook.js uninstall` |
| Narration hook, voices, settings | `~/.claude/settings.json`, `~/.claude/voices/`, `~/.claude/narrate.json` | this device and user, every project | `/narration mute`, or remove the Stop hook |
| VS Code controls | `~/.vscode/extensions/ai-dev-kit.narrate-buttons-*` | this device and user | `node extensions/narrate-buttons/install.js --remove` |
| Laya server (started by `prefilter-rank`) | `~/.ai-dev-kit/laya/`, about 2 GB of RAM while loaded, unloads after 10 minutes idle | this device, never per project | `node system1-prefilter/laya-ctl.js stop`, or remove the mod |
| Persona choice | `~/.claude/personality.json` (project override in `.claude/personality.json`) | user, or one project | `/persona off` |
| MCP tools, models, keys | `~/.ai-dev-kit/` | this device, never per project | remove the MCP entry from your tool's config |
| Per-project lessons | `learnings.md` next to each skill | one project, git-ignored | delete the file |
| Project docs | `<project>/project-context/` | one project, git-ignored | delete the folder |

## Frequently asked questions

**What is an agent skill (`SKILL.md`)?** A markdown file with a short description of when it applies and the steps to follow. The agent reads the description, and loads the file only when a task matches. Every skill here is one such file.

**Which AI coding tools does it work with?** Claude Code natively, plus OpenCode, Codex and any agent that reads markdown instructions. The installer detects the tool and puts the skills and the session file where that tool actually reads them (`CLAUDE.md` or `AGENTS.md`).

**Does it install packages or touch my code?** The core installer copies markdown files only and never edits your code. The audit script, the Claude Code mods and the add-ons are optional and run only when you choose them. The `narrate` add-on is the one place that installs software (Piper through pip, two voice files of about 63 MB each), and only after it tells you the download size and you agree.

**Can I use only the standards, or only the skills?** Yes, either folder works alone. A project that wants the standards enforced during a session needs both, because the `coding-standards` skill is what loads the chain.

**How is this different from a prompt library?** Skills load on a trigger instead of sitting in every prompt, they record lessons per project, the standards are testable rules with wrong/right examples, and a script audits a codebase against them.

**How do I update an install?** Pull the repository and re-run the installer. It compares each file and asks before overwriting a local change.

**Can Claude read its answers aloud?** Yes, with the opt-in `narrate` add-on: a Stop hook sends each reply through Piper, an offline text-to-speech engine, on your machine. It uses no tokens and no cloud service. See [Voice, narration and personas](#voice-narration-and-personas).

**Can I change how Claude words its answers for my skill level?** Yes, with the opt-in `personality` add-on: six personas (female and male at novice, mid and professional level), or your own. It changes wording only, never facts or code, and adds about 150 to 190 tokens per session. In tests on Haiku and Sonnet it answered as correctly as no persona.

**How many tokens does the kit add to every session?** About 1,750 tokens for a typical install's skill descriptions, or about 2,440 for the full Claude Code kit, plus the `CLAUDE.md` contract (about 1,440 for the template). Skill bodies load only when used (about 1,370 tokens on average), slash commands cost nothing until you type them, and the mods that observe or enforce add no context. Claude Code's own built-in skills and system prompt are extra and are not counted here; run `/context` in Claude Code to see the full breakdown. These are estimates at about 4 characters per token.

**Can I control narration with on-screen buttons instead of hotkeys?** Yes. `node extensions/narrate-buttons/install.js` adds a footer tray, a sidebar and a Play button to VS Code. See [Voice, narration and personas](#voice-narration-and-personas).

**Is it free?** Yes, MIT licensed. Optional tools state their own limits: some run locally for free, hosted ones have free tiers or need billing.

## Contributing and support

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). If the kit saves you time or tokens, a star helps other people find it.

## License

[MIT](LICENSE). Third-party models, services and borrowed ideas are credited in [CREDITS.md](CREDITS.md). The license's "software" wording legally covers this collection of markdown skills, standards, and configs — use, adapt, and redistribute freely with attribution.
