---
name: skill-scope
description: Canonical two-mechanism classification for every skill in the library — permanent-pinned (decided once at setup, AI-scanned, user-overridable only by explicit statement) vs. per-session archivable (toggled case by case from the stated next task). Referenced by install-kit (setup-stage scan) and handover (per-session toggle) — edit here, not in either.
metadata:
  type: reference
---

# Skill Scope — Permanent-Pinned vs. Per-Session Archivable

Every skill in the library falls into exactly one of two mechanisms. The mechanism determines *when* the pin/archive decision gets made, by what signal, and who can override it.

## The two mechanisms

| Mechanism | Meaning | Decided when | Decided by | Override |
|---|---|---|---|---|
| **Permanent-pinned** | Fixed for the project's lifetime — either universal, or matched to the project's stack/tooling/model at setup | Once, at install (re-run only if the project's actual stack changes) | AI scan of project files (build files, manifests, config, README/CLAUDE.md) | User can pin-in or pin-out anything from this set, but only by stating it explicitly in-session — never inferred silently by the AI |
| **Per-session archivable** | A boolean toggle, decided fresh each session from the specific task at hand | Every session, by `handover` | The stated next task | Same rule — explicit statement overrides the default toggle for that session |

**The override rule applies to both mechanisms identically: the AI never unpins a permanent skill or force-includes an archivable one on its own inference. It only acts on what the user has clearly said in the session.**

## Classification rule (apply to any new skill, not just the list below)

1. Does the skill's trigger condition depend on the project's stack/tooling/model, or on the specific task at hand, or neither?
   - Neither (fires on a task-agnostic event: a diff exists, an ask is ambiguous, a bug appears) → **Permanent-pinned, universal**.
   - Stack/tooling/model → **Permanent-pinned, conditional** (scanned once at setup).
   - Specific task instance → **Per-session archivable**.
2. For the conditional-pinned case, the AI scan must cite the file/signal it found before pinning — never pin on a guess.

## Current classification

### Permanent-pinned — universal (installed always, never scanned for)
`handover`, `coding-standards`, `session-budget`, `agent-usage`, `mode-kernel`, `pre-merge-gate`, `pre-commit`, `debug-protocol`, `intent-capture`, `plan-first`, `interpretation-checkpoint`

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
| `fable-5` / `opus-4-8` / `sonnet-5` / `haiku-4-5` / `claude-all-models` / `opus-as-fable` | which model(s) the project states it's driven by (CLAUDE.md, or asked at install if not file-observable) |
| `models/opencode/*` (all) | presence of OpenCode config/usage, or asked at install |
| `hooks-enforcement` | `.claude/settings.json` hooks already present, or asked at install |

Re-scan trigger: only if the project's actual stack changes — never per-task or per-session.

### Per-session archivable (handover toggles from the stated next task)
`perf-audit`, `role-session`, `e2e-scaffold`, `memory-gardener`, `skill-ablation`, `skill-writer`, `install-kit`

Each fires only on a specific task instance nameable in a next-task line, not a fixed property of the stack.

## Mechanism split (who actually moves files, and where the override hook lives)

- **install-kit**, at install or explicit re-detect: installs all universal Permanent-pinned skills unconditionally; scans for conditional-pinned signals and installs matches, citing the signal found; asks once for anything not file-observable. Before finalizing, asks the user for any explicit overrides ("also always pin X" / "never pin Y even though the scan matched") and records them.
- **handover**, every session end: given the stated next task, archives per-session-archivable skills the task doesn't need to `.claude/skills-archive/`, records the archived list + paths in `handover.md`. If the user explicitly states an override for that session ("keep `perf-audit` pinned this time even though it's not a perf task"), handover honors it and notes the override was explicit, not inferred.

Neither mechanism silently second-guesses the other, and neither silently second-guesses a user's explicit statement.
