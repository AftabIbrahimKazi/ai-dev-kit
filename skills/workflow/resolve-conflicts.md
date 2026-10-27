---
name: resolve-conflicts
description: Use whenever a merge, rebase, cherry-pick or pull stops with conflicts, or the user says "fix the merge". Load this BEFORE editing a conflicted file.
---

# Resolve Conflicts — Safe Resolution With Role Guardrails

A conflict resolved by guessing silently drops one side's work, or edits code the developer does not own. This skill fixes the mode, the pace and the scope before the first edit.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a conflict shape that needed a different mode, or a guardrail that fired. Merge instead of duplicating; delete disproven bullets.

## Step 1 — Read the conflict set
Run `node <skill-root>/resolve-conflicts/scope.js list [--role R]`. It prints which branch is **ours** and which is **theirs**, then one row per file: hunks, `code` or `generated`, and `scope` (`in`, `out`, or `-` with no role). It also saves the set for Step 4. State the legend to the user in one line before any edit: the words "incoming" and "outgoing" change meaning between merge and rebase, so use only **ours** and **theirs**.

## Step 2 — Choose the mode (default: both)
| Mode | Result |
|---|---|
| `both` (default) | Keep the work of both sides. See "Both" below. |
| `ours` | Take our side for the chosen files. Before editing, list in one line per hunk what the other side loses. |
| `theirs` | Take their side. List what ours loses in the same way. |

`ours` and `theirs` never run silently. The dropped content is shown first, so the user can stop it.

## Step 3 — Choose the pace
| Pace | Behavior |
|---|---|
| `all` | One mode for every conflicted file. No questions. |
| `auto` | Decide per file or hunk. Start from the mode, deviate only for a stated reason (for example `generated` files). Report every deviation in one line. |
| `step` | Stop at every file, and at every hunk with more than one change, and ask the user which mode to apply. Do not continue until answered. |

If the user gave no pace, use `auto`. Free text after `--note` is an extra instruction: follow it, and name it in the report when it changed a result.

## Both: how to merge safely
1. **Independent changes** (different lines, an import plus a function, two list items): keep both, in the order the file already uses.
2. **Overlapping changes** (both sides edit the same logic): write one merged version, state it in two lines, and mark it `REVIEW` in the report. Do not paste both blocks one after the other.
3. **`generated` files** (lockfiles, `dist/`, `*.min.*`): do not merge text. Take either side, then regenerate with the project's own command (`npm install`, `composer install`, the build), and say so.
4. **Delete versus modify:** ask the user. Do not choose.
5. After the last file: run the project's test or build command if one exists and report the result. Do not run `git commit`, `git merge --continue` or `git rebase --continue` unless asked.

## Roles: guardrails by who the developer is
The role file `conflict-roles.json` (in `.claude/`, `.opencode/` or `.agents/`, whichever the project uses) maps a role to `in` and `out` path globs and an `outOfScope` policy. `roles.example.json` in this skill's folder (`resolve-conflicts.roles.example.json` in the kit library) ships `frontend` and `backend`; copy it to that folder as `conflict-roles.json` and adjust the globs. Pass `--role backend` or set `default`.
- **`in` files:** resolve with the chosen mode and pace.
- **`out` files:** apply the policy, never the mode.
  - `leave` (default): do not touch the file. List it as left for its owner.
  - `ours` or `theirs`: take that side whole, no merge of text.
  - Under pace `step`, ask the user for each `out` file instead.
- **No role file and no `--role`:** every file is `in`. Say that in the report.
- An unknown role name is an error. Do not guess a role.

## Step 4 — Verify
Run `node <skill-root>/resolve-conflicts/scope.js check [--role R]`. Exit 1 means one of: a conflict marker remains in an `in` file, an `out` file was resolved against `leave`, or an `out` file does not match the side its policy names. Fix and re-run until it exits 0.

## Report format
One line per file: `path  mode  note`. Then the counts: resolved, left for the owner, `REVIEW` items. No other summary.

## Failure mode this prevents
A "keep both" that concatenates two versions of one function, a lockfile merged by hand, a frontend developer's resolution that rewrites a backend query, or a one-sided pick that nobody noticed dropped a colleague's change.
