---
name: mod-setup
description: Installing, enabling, reviewing or removing mods, setting up budget-ledger, or mods not loading. Load BEFORE any plugin command.
compat: claude-code-only
---

# Mod Setup — Install Kit Mods Safely

**This is Claude Code-only: it needs Claude Code mods (v2.1.287 or later).** Every mod is optional. No kit rule depends on one.

A mod runs with the user's permissions and sees every prompt and tool call. Install only after the user has seen what it does and said yes.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a check that failed, a surface that behaved differently, an install step that was missing). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Step 1 — Check the environment
1. Version: run `claude --version` (VS Code: the bundled `claude.exe` under `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/`). Below 2.1.287: stop and tell the user to update.
2. Surface: ask where the user works. Terminal and Desktop draw mod UI; the VS Code chat panel runs hooks and draws nothing. The kit's mods are behavioural, so all surfaces work, but a pane or status line mod would show nothing in VS Code.
3. Mods off? If `disableAllHooks` is true, `--safe-mode`/`--bare` is used, or managed settings block mods, report that and stop.

## Step 2 — Pick mods
Offer the list from `mods/.claude-plugin/marketplace.json` with each entry's description. Install nothing the user did not choose. Wave order for a new user: `budget-ledger` first (it measures the rest). When the project has a `CLAUDE.md`/`AGENTS.md` that defines the `[CX]` marker, recommend `marker-guard` second: without it a dropped marker (AI-01) passes silently. `guard` overlaps Claude Code's own `permissions.deny` rules: plain file paths (`.env`, lockfiles) can live in `settings.json`; keep `guard` for parsed destructive commands (force push, `reset --hard`, root-like deletes) across Bash and PowerShell.

## Step 3 — Install the engine skills first
Four mods run a script that ships with a skill: `precommit-gate` (`pre-commit`), `edit-check` (`pre-merge-gate`), `budget-ledger`'s `/budget` report (`session-budget`) and `output-compact` (`session-budget`'s `compact.js`). `guard`, `debug-nudge`, `standards-chain`, `eta-nudge`, `design-audit-offer`, `marker-guard` and `aiignore-guard` need no script (`aiignore-guard` reads the project's `.aiignore`, which `code-audit` also uses, and optionally `conflict-roles.json`, the role-session board and local Laya; it does nothing without them). Check that the skill is installed in `<project>/.claude/skills/<skill>/` or `~/.claude/skills/<skill>/`. If missing, install it with `install-kit` first. A mod whose engine is missing does nothing, by design.

`prefilter-rank` is different: it needs no installed script, but needs the `system1-prefilter` addon's local-Laya path actually configured and running (`SYSTEM1_BASE_URL` set to a loopback address, `SYSTEM1_API_KEY` unset, Laya's `/health` answering) — offer it only alongside or after that addon's own Setup, never before. It calls Laya locally (`$.http.fetch` to `127.0.0.1` only, checked in code) to rank Grep/Glob results; it does nothing if the addon isn't configured that way, including if a hosted provider's key is set instead.

**One commit gate only.** If `precommit-gate` is chosen and the project already has the `hooks-enforcement` settings-hook gate (`.claude/hooks/pre-commit-gate.sh` in `.claude/settings.json`), both would gate every `git commit` and the marker prompts would double up. Ask which to keep and remove the other. Likewise, a mod whose engine skill is missing loads fine but does nothing, so confirm the engine path in Step 6.

## Step 4 — Review before install (mandatory)
1. Run `claude plugin validate <mods/name>` and show the `hooks:` and `calls:` lines. Explain in one sentence each what the mod can touch (files, processes, env vars).
2. Flag anything beyond the mod's stated purpose: network calls, env reads other than those its `plugin.json` description names ("Reads env: ..."), `$.process.run` of anything but the engine, any write under `handover/` or read of `handover/locks.d/`. A mod that does any of these is not installed.
3. Get an explicit yes per mod.

## Step 5 — Install
Add the kit marketplace once, then install by name:
```
claude plugin marketplace add <path-to-ai-dev-kit>/mods
claude plugin install <name>@ai-dev-kit-mods
```
Scope: user scope applies to every project; project scope writes the project's settings. Ask which. For a trial in one session only: `claude --plugin-dir <path-to-ai-dev-kit>/mods/<name>`. After installing from a shell while a session is open, run `/reload-plugins`.

## Step 6 — Confirm it loaded
- Run `/plugin` → Installed tab; the line "N mod active" names it. For `budget-ledger`, run `/budget` after one turn.
- If nothing loads: `claude --debug`, then check version, trust prompt, `disableAllHooks` and the engine path.
- Report the exact scope and how to turn it off.

## Turn off or remove
- One mod: disable it in `/plugin` → Installed, or `claude plugin uninstall <name>@ai-dev-kit-mods`.
- All mods this session: start with `--safe-mode`. All sessions: `"disableAllHooks": true` in `~/.claude/settings.json` (this also stops settings hooks and a custom status line).
- A mod's data stays: the ledger lives in `~/.ai-dev-kit/ledger/`. Delete it by hand if wanted.

## Updating
Mods version in `plugin.json`. After the kit updates a mod, run `claude plugin update <name>@ai-dev-kit-mods` and `/reload-plugins`. An unchanged version number means no update, so bump `version` on every change.

## Staleness guard
Plugin and mod commands change between Claude Code releases. Confirm against `claude plugin --help` and the live docs (code.claude.com/docs/en/plugins/mods/overview) before relying on a flag. Log corrections in `learnings.md`.
