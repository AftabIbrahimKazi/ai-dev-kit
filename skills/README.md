# Skills Library

Portable, self-improving skills for AI coding agents — Claude Code natively, other tools (OpenCode, etc.) via their own instruction files. Every skill reads its `learnings.md` at start and appends one distilled lesson at end, so the library sharpens with use.

**To use in a project:** copy the `.md` into that project's skill root as `<skill-root>/<name>/SKILL.md` (folder name = skill name, file renamed to `SKILL.md`; skill root = `.claude/skills/` for Claude Code, `.opencode/skills/` for OpenCode, `.agents/skills/` for Codex-style tools). The flat layout is required for auto-invocation — these category subfolders exist only for organizing the portable copies.

**Canonical home:** the [`ai-dev-kit`](https://github.com/AftabIbrahimKazi/ai-dev-kit) repo (local clone: `My Projects/ai-dev-kit/`). Improve skills there and commit; copies inside projects are installs. When editing a skill inside a project instead, port the improvement back to the repo — never let the two drift silently.

**Renames:** every skill rename/merge gets a row in [migrations/RENAMES.md](../migrations/RENAMES.md); the install-kit reads it to migrate old installs (carrying their `learnings.md` forward).

## models/ — driving each model at full capacity

### models/claude/ — the Claude lineup
| Skill | Purpose |
|---|---|
| [fable-5-1](models/claude/fable-5-1.md) | Fable 5.1 protocol — when its price pays off, preserved-thinking rules, progress updates, autonomy/scope prompts |
| [opus-5-5](models/claude/opus-5-5.md) | Opus 5.5 — current flagship; always-on thinking, `medium` default effort, forced-tool-use ban |
| [sonnet-5-5](models/claude/sonnet-5-5.md) | Sonnet 5.5 — recalibrated effort, `between_tools` thinking-off, low-effort verification prompt |
| [haiku-5-5](models/claude/haiku-5-5.md) | Haiku 5.5 — first Haiku with adaptive thinking and effort, 1M context, fan-out/routing, breaking changes vs 4.5 |
| [opus-5](models/claude/opus-5.md) | Opus 5 (previous gen) — thinking-on default, verbosity/over-verification/subagent tuning |
| [fable-5](models/claude/fable-5.md) | Fable 5 (previous gen) — when its price pays off, always-on thinking, effort tuning |
| [opus-4-8](models/claude/opus-4-8.md) | Opus 4.8 (previous gen) — explicit adaptive thinking, fast mode, task budgets |
| [sonnet-5](models/claude/sonnet-5.md) | Sonnet 5 (previous gen) — near-Opus coding at Sonnet cost, literal instruction patterns |
| [haiku-4-5](models/claude/haiku-4-5.md) | Haiku 4.5 (previous gen) — fan-out/classification workhorse, legacy `budget_tokens` surface |
| [claude-all-models](models/claude/claude-all-models.md) | Fleet routing — right model per task, escalation rules, cost discipline |
| [opus-as-fable](models/claude/opus-as-fable.md) | Behavioral protocol pushing Opus 4.8 toward Fable-grade rigor |
| [hooks-enforcement](models/claude/hooks-enforcement.md) | Optional Claude Code hooks assisting AI-01–AI-03 mechanically — Claude Code only |

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
Pipeline for a new, non-trivial ask: `intent-capture` (pin *what*) → `plan-first` (decide *how*) → `interpretation-checkpoint` (verify the parsed detail, wide-blast-radius tasks only) → edit → `pre-merge-gate` → `pre-commit`.

**Baseline set** (install-kit installs these by default regardless of stack, unless declined): `handover`, `agent-usage`, `mode-kernel`, `session-budget`, `debug-protocol`, `intent-capture`, `plan-first`, `interpretation-checkpoint`, `pre-merge-gate`, `pre-commit`. Not baseline: `perf-audit`, `role-session`, `e2e-scaffold`, `resolve-conflicts`, `responsive-check`, `optimize-assets` — situational, install-kit's Pick/Auto-detect catalog covers these on need.

| Skill | Purpose |
|---|---|
| [handover](workflow/handover.md) | Session continuity via handover.md — resume cold with zero re-explaining; also hosts the agent-handover mechanism |
| [agent-usage](workflow/agent-usage.md) | Default-never Agent-tool policy — two scope-anchored exceptions, an approval gate, chaining-pattern efficiency rules |
| [mode-kernel](workflow/mode-kernel.md) | Central table for how agent-usage/debug-protocol/coding-standards/perf-audit's stop-and-wait gates behave per session mode |
| [debug-protocol](workflow/debug-protocol.md) | Reproduce → one hypothesis → cheapest disproof; no shotgun edits |
| [intent-capture](workflow/intent-capture.md) | Goal + constraints + done-when before planning, for ambiguous asks |
| [plan-first](workflow/plan-first.md) | 5-line plan + file list before multi-file work; in plan mode, plan for a cheaper executor model and verify its result |
| [interpretation-checkpoint](workflow/interpretation-checkpoint.md) | Files/Changes/Assumptions breakdown for correction on multi-file, multi-parameter tasks |
| [session-budget](workflow/session-budget.md) | Token discipline — targeted reads, no restating, cheap-model delegation; `report.js` (ledger report) and `compact.js` (verbose-output shrinker) companions |
| [pre-merge-gate](workflow/pre-merge-gate.md) | Self-check a diff against loaded standards before handoff or commit; `edit-check.js` companion runs the mechanical checks |
| [pre-commit](workflow/pre-commit.md) | Commit pass — stray files, debug leftovers, secrets, message format, version bump; `check.js` companion runs the mechanical checks; `install-hook.js` installs it as git hooks |
| [resolve-conflicts](workflow/resolve-conflicts.md) | Resolve merge/rebase conflicts by mode (both, ours, theirs), pace (all, auto, step) and developer role; `scope.js` companion lists the conflict set and verifies role scope; [roles example](workflow/resolve-conflicts.roles.example.json) ships `frontend` and `backend` |
| [responsive-check](workflow/responsive-check.md) | Range-based viewport check and fix (RULE 17 zones by default; `--range`, `--min`, `--max`, `--width`, `--detect`); `probes.js` plans viewports and detects breakpoints, `measure.js` measures in Playwright |
| [optimize-assets](workflow/optimize-assets.md) | Convert (webp, avif, jpg, mp4, woff2 ...), compress and pre-compress (gzip, brotli) assets with the converters installed; `convert.js` companion also scans for heavy assets and lists references; originals are never touched |
| [perf-audit](workflow/perf-audit.md) | Measured, ranked performance audit (payload → loading → runtime → 3D) |
| [role-session](workflow/role-session.md) | Parallel-session lane protocol — role charters, atomic file claims, git token, session ids (+ [templates](workflow/role-session.templates.md), [cross-tool protocol](workflow/role-session.protocol.md)) |
| [e2e-scaffold](workflow/e2e-scaffold.md) | Scaffold reusable Playwright config/fixtures/smoke-test once per project — pairs with `qa/e2e-testing.md` |

## standards/ — convention systems
| Skill | Purpose |
|---|---|
| [coding-standards](standards/coding-standards.md) | Load & enforce the layered coding-standards/ chain before any edit |
| [code-audit](standards/code-audit.md) | Project-wide audit of the script-checkable standards rules (CSS, HTML, JS/TS, page SEO/a11y/perf, git history, versioning) for cleanup of old or multi-dev code; `audit.js` companion counts violations by rule and lists `file:line`, so the model reads only what is flagged |
| [comment-style](standards/comment-style.md) | Per-project comment level — none (default) / terse / descriptive — asked at install, changeable any time; saves tokens |

## memory/ — persistent knowledge
| Skill | Purpose |
|---|---|
| [memory-bank](memory/memory-bank.md) | Repo-committed project memory — decisions, context, solved mysteries |
| [memory-gardener](memory/memory-gardener.md) | Prune/merge learnings.md files and memory banks so knowledge compounds; `stale.js` companion lists bullets that name deleted files |
| [skill-ablation](memory/skill-ablation.md) | Periodic archive-and-run-bare pass — restore only instructions real work proves are missing |

## stack/ — technology-specific
| Skill | Purpose |
|---|---|
| [threejs-scene](stack/threejs-scene.md) | Three.js discipline — shaders, disposal, scroll cameras, render hygiene |
| [astro-page](stack/astro-page.md) | Convention-driven Astro scaffolding — discover, mirror siblings, verify |
| [shopify-toolkit-install](stack/shopify-toolkit-install.md) | Live-pull Shopify's own AI toolkit skills into a project — never forked into this kit |

## addons/ — optional, user-opted capabilities
| Skill | Purpose |
|---|---|
| [system1-prefilter](addons/system1-prefilter.md) | Provider-agnostic System-One-typed-decision prefilter — cuts fetching-stage tokens via MCQ/boolean candidate filtering + deterministic confidence-ladder escalation (`ladder.js`). Local free provider: Laya (`laya-ctl.js` sets up and runs it offline; `prefilter-mcp.js` exposes it as an MCP tool). Opt-in only, never in any default install. |
| [personality](addons/personality.md) | Six original personas (female and male at novice, mid and pro skill levels) that change how replies are worded; SessionStart hook, `/persona`, user-replaceable persona files; wording only, never facts |
| [narrate](addons/narrate.md) | Stop hook that reads each reply aloud (Piper male/female voices, mute, volume, speed, pitch, replay, reading-time limit); no tokens, never touches Claude |
| [project-context](addons/project-context.md) | Private, gitignored `project-context/` docs folder with an `INDEX.md` per sub-folder (setup by auto-detect, project type or custom list); `scan.js` companion tracks changes so only new files are re-read; guarded against commits |

## mcp/ — optional MCP servers, one manager
Free and local tools for any MCP-capable agent (Claude Code, OpenCode, others): UI prototyping, image reading, image generation. Say *"set up MCP servers"* after the install and `mcp-manager` runs the interview. **Local-model servers are global-first:** scripts in `~/.ai-dev-kit/mcp/`, models and ledgers in `~/.ai-dev-kit/<server>/`, keys in `~/.ai-dev-kit/.env`, rules in the tool's global instruction file — never copied per project. Each installer runs a hardware preflight first.

| Skill | Purpose |
|---|---|
| [mcp-manager](mcp/mcp-manager.md) | Meta skill for all opt-in MCP servers — setup interview (servers × AI tools × scope × keys × routing), per-tool config wiring, "MCP first, then fallback" rules. Opt-in only. |
| [local-vision](mcp/mcp-manager.local-vision.md) | Server file + `local-vision.js` — free offline image reading (Qwen3-VL-2B/4B via llama.cpp) for models without vision; hardware-aware installer (CPU/CUDA/Vulkan/Metal) + stdio MCP in one script; verified in real OpenCode |
| [image-gen](mcp/mcp-manager.image-gen.md) | Server file + `image-gen.js` CLI/MCP — image generation for sites/apps with fallback: Gemini Nano Banana (needs billing) → Cloudflare FLUX.1 schnell (≈173 free images/day) → labelled placeholder; 80% heads-up, 90% switch, pause at exhaustion, every step reported as a notice |
| [stitch](mcp/mcp-manager.stitch.md) | Server file (companion of mcp-manager) — Google Stitch UI prototyping, free for now; try first, fall back to artifact/HTML flow |

## libraries/ — the user's own repos
| Skill | Purpose |
|---|---|
| [strata-css](libraries/strata-css.md) | Strata CSS framework (Frameworks/strata) — use, debug, fix at source |
| [triforge](libraries/triforge.md) | @triforge Three.js suite (3D/three-js) — package picking, FINDINGS workflow |

## meta/ — maintaining the library itself
| Skill | Purpose |
|---|---|
| [skill-writer](meta/skill-writer.md) | The quality bar for writing new skills — triggers, checkable rules, loop |
| [mod-writer](meta/mod-writer.md) | Quality bar for Claude Code mods — mod vs script vs hook, fail-open rules, validate/test loop, API traps. Claude Code only |
| [mod-setup](meta/mod-setup.md) | Opt-in installer for the kit's mods in [`mods/`](../mods/) — version/surface check, review of what each mod touches, install, confirm. Claude Code only |
| [install-kit](meta/install-kit.md) | Install, update, uninstall, archive/unarchive or merge git hooks into any project — all at once, hand-picked, auto-detected, or by named stack preset (Astro/Next.js/Laravel); `cli.js` does the mechanical copy/move deterministically, `verify.js` mechanically re-checks the result before the install is reported done; click-to-answer in Claude Code, its own arrow-key terminal menu elsewhere; runs from the library, never copied into the target project |
| [skill-scope](meta/skill-scope.md) | Canonical pinned/conditional-pinned/archivable classification — install-kit and handover both read this, edited nowhere else |
| [misfire-log](meta/misfire-log.md) | Opt-in add-on — logs a misfire (a skill/mod/addon that should have fired but didn't, or got bypassed) the moment one is noticed; `misfire-log.report.js` ranks the repeat offenders for the next kit update |

## commands/ — optional slash-command templates

Not skills: plain command files that `install-kit` copies to `.claude/commands/` or `.opencode/commands/` on request. Each carries `disable-model-invocation: true`, so Claude Code keeps their descriptions out of the model's context (about 320 tokens per session if all are installed) while you can still type them. Most run a kit script and hand the output to the agent, so no skill has to be matched first; a couple (`/kit`, `/eta`) are pure instruction templates with nothing to run. The full usage tables are in the [root README](../README.md#slash-commands).

| Command | Runs | Needs |
|---|---|---|
| `/audit` | `code-audit` script | `code-audit` |
| `/commit-check` | `pre-commit` check on the staged change | `pre-commit` |
| `/token-report` | ledger report | `session-budget` |
| `/quiet <cmd>` | a command with shortened output | `session-budget` |
| `/stale` | stale-memory report | `memory-gardener` |
| `/githooks` | git-hook status | `pre-commit` |
| `/pickup` | loads `handover.md` as the project state (reads only) | `handover` |
| `/wrap-up` | rewrites `handover.md` in place | `handover` |
| `/resolve-conflicts` | conflict set + role scope, then guided resolution | `resolve-conflicts` |
| `/responsive-check` | viewport plan or breakpoint report, then check | `responsive-check` |
| `/optimize-assets` | asset scan, convert, compress, pre-compress | `optimize-assets` |
| `/ctx` | set up, analyze and check the project-context docs folder | `project-context` |
| `/persona` | choose the reply persona: gender and skill level, off, status | `personality` |
| `/narration` | mute, voice, volume, speed, pitch for reply narration | `narrate` |
| `/figma` | exported Figma PNG/SVG files into `project-context/design/figma.md`, no MCP | `project-context` |
| `/kit` | cheat sheet, no script | none |
| `/eta` | restates the active task's time estimate/checkpoint, no script | `plan-first` |
| `/format` | sets the response shape (table, bullets, oneline, bool), no script | none |

## Installing into a new project

**Quick start (the intended flow):** dump this `skills/` folder — and `coding-standards/` if the project should have the standards system — into the new project's root, then tell Claude:

> read skills/README.md and install

**The agent, when given that instruction:** read `meta/install-kit.md` in this folder and follow it as the installation procedure. In short: offer **everything**, an **interactive pick** (catalog below), **auto-detect** (scans the project, cites the signal before pinning anything), or a **stack preset** (name the stack directly — Astro, Next.js, Laravel), detect which coding tool the session is running in (infer from the project, confirm with the user), run `install-kit.cli.js install --library <this folder's parent> --root <target> --tool <detected>` with the resolved skill list — it copies chosen skills to that tool's skill root as `<skill-root>/<name>/SKILL.md` (flat — never category subfolders), never copies `learnings.md` files, wires `coding-standards/CLAUDE.example.md` into the tool's own session file — `CLAUDE.md` for Claude Code, `AGENTS.md` for OpenCode — if standards were chosen (merge, never overwrite), and runs `install-kit.verify.js` against the result internally, so nothing is reported done while it fails. In Claude Code, every choice above is a click (`AskUserQuestion`) rather than typed prose. After install, the dumped `skills/` folder may be kept as the in-project library copy or deleted — ask the user. `install-kit` itself is never copied into the target's skill root; it always runs from wherever the library lives.

Alternative flows: from a session that can see both projects, ask Claude to run `install-kit.cli.js` against the target path; running the script directly — in OpenCode, Codex, or a bare terminal with no chat tool in the loop — drops into its own arrow-key/checkbox terminal menu (via `prompts`) for any flag left out, instead of typed prose or an error. Or manually copy any single `<category>/<name>.md` to `<skill-root>/<name>/SKILL.md`. For a skill with a `.js` companion, also place a `package.json` containing `{ "type": "commonjs" }` at the skill root, so the script still runs in a project whose own `package.json` says `"type": "module"`.
