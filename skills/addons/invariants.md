---
name: invariants
description: Opt-in add-on. Use when the user wants a project rule proven by a check that is shown to fail when the code is broken (e.g. "never charge twice"), or asks whether a rule's check is real or stale. Load before writing or editing invariants/invariants.json.
---

# Invariants — Checks Proven Able to Fail

**This is opt-in only, never part of any default install.** A script runs each rule's check, breaks the code on purpose, confirms the check goes red, restores the file, and lists rules whose files changed since they were last verified. No model runs in any of these steps. Claude only drafts rules and mutations, and the user approves the rule wording.

## First run (a person typing, no experience needed)
1. Check Node is installed: type `node -v` and press Enter. A version number such as `v24.12.0` means yes.
2. In your project, create `invariants/invariants.json` holding one rule:
   ```json
   [{ "id": "INV-1", "rule": "An order is never charged twice.", "covers": ["src/charge.js"],
      "check": "node test/no-double-charge.js",
      "mutate": { "file": "src/charge.js", "find": "if (seen.has(id)) return false;", "replace": "" } }]
   ```
   `check` is any command that exits 0 when the rule holds. `mutate` is a small edit that breaks the rule: `find` text is replaced by `replace`.
3. Type `/invariants run` (or `node <skill-root>/invariants/cli.js run`) and press Enter.
4. `PASS` means green on the code and red when broken. Anything else is explained below.

## Reading the result
| Status | Meaning | Do |
|---|---|---|
| `PASS` | Check passes, and fails when the code is broken. | Nothing. |
| `VACUOUS` | Check still passes with the code broken. It proves nothing. | Fix the check so it actually tests the rule. |
| `FAIL` | Check fails on the current code. | Fix the code or the check. |
| `UNPROVEN` | Passes, but no `mutate` was given. | Add a mutation. |
| `BADMUTATION` | The `find` text is not in the file. | Update `find` to match the code. |

## The tool
`node <skill-root>/invariants/cli.js <command>` (plain Node, no dependencies, no network).

| Command | Does |
|---|---|
| `run [--id ID] [--json]` | Runs checks and mutations. Exit 1 on `FAIL`, `VACUOUS` or `BADMUTATION`. |
| `stamp [--id ID]` | Runs, then records the current commit as `verified` for rules that fully passed. |
| `stale [--json]` | Lists rules whose covered files changed since `verified`. Exit 1 if any. |
| `check` | Validates the rules file only. |

A covered file is edited only for the length of one mutation run, and the original bytes are always restored, also on Ctrl-C. The script writes `invariants.json` only for `stamp`. Commit your work before the first run anyway.

## Rules for Claude
- The user owns the rule sentence. Draft wording, never reword a rule to make a check pass.
- Do not weaken a check or a mutation to turn `VACUOUS` or `FAIL` green. Report it.
- Say what a rule does not cover. A passing check proves only the rule as written.
- Run `stale` before relying on an old `PASS`. Run `stamp` only after the user has seen a clean `run`.
- Never run a model-based step here. If a check needs one, say so and stop.
