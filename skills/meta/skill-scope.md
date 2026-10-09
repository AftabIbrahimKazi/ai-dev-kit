---
name: skill-scope
description: Canonical skill classification — permanent-pinned (universal or stack-conditional), per-session archivable, opt-in addon. Trigger when classifying, installing, pinning or archiving a skill. Read by install-kit and handover; edit here only.
metadata:
  type: reference
---

# Skill Scope — Permanent-Pinned vs. Per-Session Archivable

Every skill in the library falls into exactly one of two mechanisms. The mechanism determines *when* the pin/archive decision gets made, by what signal, and who can override it.

## The two mechanisms

| Mechanism | Meaning | Decided when | Decided by | Override |
|---|---|---|---|---|
| **Permanent-pinned** | Fixed for the project's lifetime — either universal, or matched to the project's stack/tooling/model at setup | Once, at install (re-run only if the project's actual stack changes) | AI scan of project files (build files, manifests, config, README, session-protocol file) | User can pin-in or pin-out anything from this set, but only by stating it explicitly in-session — never inferred silently by the AI |
| **Per-session archivable** | A boolean toggle, decided fresh each session from the specific task at hand | Every session, by `handover` | The stated next task | Same rule — explicit statement overrides the default toggle for that session |

**The override rule applies to both mechanisms identically: the AI never unpins a permanent skill or force-includes an archivable one on its own inference. It only acts on what the user has clearly said in the session.**

## Classification rule (apply to any new skill, not just the list below)

1. Does the skill's trigger condition depend on the project's stack/tooling/model, or on the specific task at hand, or neither?
   - Neither (fires on a task-agnostic event: a diff exists, an ask is ambiguous, a bug appears) → **Permanent-pinned, universal**.
   - Stack/tooling/model → **Permanent-pinned, conditional** (scanned once at setup).
   - Specific task instance → **Per-session archivable**.
2. For the conditional-pinned case, the AI scan must cite the file/signal it found before pinning — never pin on a guess.

## A fourth category: opt-in addons

Some skills aren't universal, aren't stack-detectable, and aren't task-instance-toggled — they exist only because the user explicitly chose to turn on an optional capability (an external dependency, a paid/keyed service). These are **user-opted addons**: invisible until explicitly requested at install or later, and once configured, stay pinned (the user's choice is durable, not re-derived per session or per stack-scan). `system1-prefilter` is the first of this kind.

## Current classification

### Permanent-pinned — universal (installed always, never scanned for)
`skill-scope`, `handover`, `coding-standards`, `comment-style`, `session-budget`, `agent-usage`, `mode-kernel`, `pre-merge-gate`, `pre-commit`, `debug-protocol`, `intent-capture`, `plan-first`, `interpretation-checkpoint`

`skill-scope` itself is pinned for a structural reason, not a task-agnostic-trigger reason: both `install-kit` and `handover` reference it by name at runtime in the target project, so its absence silently breaks both mechanisms. Never let it be deselected in Pick mode.

Each fires on a task-agnostic event or is the mechanism doing the classifying itself — none can be predicted-absent from a stated next task.

### Permanent-pinned — conditional (install-kit scans for the signal shown, pins on match)
| Skill | Signal to scan for |
|---|---|
| `threejs-scene` | `three` in package.json dependencies |
| `astro-page` | `astro.config.*` present, `astro` dependency |
| `strata-css` | Strata reference in package.json/CSS imports |
| `triforge` | `@triforge/*` dependency |
| `shopify-toolkit-install` + its pulled-in Shopify skills | Shopify theme structure (`shopify.theme.toml`, `sections/`, `snippets/`), `.shopifycli` |
| `memory-bank` | existing `memory-bank/` folder, or explicit user choice at install |
| `fable-5-1` / `opus-5-5` / `sonnet-5-5` / `haiku-5-5` / `haiku-4-5` / `fable-5` / `opus-5` / `opus-4-8` / `sonnet-5` / `claude-all-models` / `opus-as-fable` | which model(s) the project states it's driven by (session-protocol file, or asked at install if not file-observable) |
| `models/opencode/*` (all) | presence of OpenCode config/usage, or asked at install |
| *Exclusivity rule* | A project detected as **OpenCode-only** (`.opencode/`/`opencode.json` present, no `.claude/` or `CLAUDE.md`, user confirms) is a negative signal for the Claude model lineup — do not pin `fable-5`/`opus-4-8`/`sonnet-5`/`haiku-5-5`/`haiku-4-5`/`claude-all-models`/`opus-as-fable`/`hooks-enforcement`/`mod-writer`/`mod-setup` unless the user explicitly asks. Mirror: a Claude Code-only project does not pin `models/opencode/*`. A project using both pins both lineups. |
| `hooks-enforcement` | `.claude/settings.json` hooks already present, or asked at install |

Re-scan trigger: only if the project's actual stack changes — never per-task or per-session.

### Per-session archivable (handover toggles from the stated next task)
`perf-audit`, `code-audit`, `role-session`, `e2e-scaffold`, `memory-gardener`, `skill-ablation`, `skill-writer`, `mod-writer`, `install-kit`

`code-audit` is archivable like `perf-audit`: it fires on a cleanup or audit task. `pre-merge-gate`'s `edit-check.js` uses its engine when present and falls back to its own frozen copy of the per-edit rules when it is archived, so archiving breaks nothing.

Each fires only on a specific task instance nameable in a next-task line, not a fixed property of the stack.

### Opt-in addons (never offered by default; install only on explicit request)
`system1-prefilter`, `mcp-manager` (+ its per-server companions, e.g. `stitch`), `mod-setup` (+ the `mods/` folder it installs from)

`mcp-manager` is the opt-in router for every MCP server: one skill, one companion file per server, chosen individually in its own setup interview. Adding a server never adds a skill or a classification row.

`mod-setup` is the same for Claude Code mods (`compat: claude-code-only`): one skill, one folder per mod under `mods/`, each chosen individually after a review of what it touches. Adding a mod adds no skill and no classification row. Three mods run an engine script, a companion of a universal skill that installs with it: `precommit-gate` (`pre-commit`), `edit-check` (`pre-merge-gate`) and `budget-ledger`'s `/budget` (`session-budget`). `guard`, `debug-nudge` and `standards-chain` carry their own rules and need no engine.

Once requested and configured, treat as permanent-pinned — the user's own choice is durable, not re-derived per session or stack-scan.

## Mechanism split (who actually moves files, and where the override hook lives)

- **install-kit**, at install or explicit re-detect: installs all universal Permanent-pinned skills unconditionally; scans for conditional-pinned signals and installs matches, citing the signal found; asks once for anything not file-observable. Before finalizing, asks the user for any explicit overrides ("also always pin X" / "never pin Y even though the scan matched") and records them.
- **handover**, every session end: given the stated next task, archives per-session-archivable skills the task doesn't need to `<tool-dir>/skills-archive/` (`.claude/` or `.opencode/`, matching the skill root), records the archived list + paths in `handover.md`. If the user explicitly states an override for that session ("keep `perf-audit` pinned this time even though it's not a perf task"), handover honors it and notes the override was explicit, not inferred.
- **Opt-in addons** own their own setup — install-kit and handover never ask an addon's configuration questions on its behalf; they only route the request to that addon's own Setup section.

Neither mechanism silently second-guesses the other, and neither silently second-guesses a user's explicit statement.
