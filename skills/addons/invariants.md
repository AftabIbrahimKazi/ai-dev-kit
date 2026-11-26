---
name: invariants
description: Opt-in. Use to prove a project rule with a check shown to fail when the code is broken (e.g. "never charge twice"), or to test whether a check is real. Load before editing invariants/invariants.json.
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
| (no command) | Runs `run`, `probe` and `stale` in one report. This is what `/invariants` does. |
| `probe [--target F] [--max N]` | Auto-generates mutants (flipped comparisons, `&&`/`||`, defaults, exit codes) of each covered `.js` file and runs every rule that covers it. A `SURVIVED file:line op` is a spot no rule notices. Skips comments, strings, regex and compiler helper code. Add `file:line:op` to `invariants/probe-ignore.json` to hide a harmless one. Exit 1 on a survivor. |
| `run [--id ID] [--json]` | Runs checks and mutations. Exit 1 on `FAIL`, `VACUOUS` or `BADMUTATION`. |
| `stamp [--id ID]` | Runs, then records the current commit as `verified` for rules that fully passed. |
| `stale [--json]` | Lists rules whose covered files changed since `verified`. Exit 1 if any. |
| `check` | Validates the rules file only. |

A covered file is edited only for the length of one mutation run, and the original bytes are always restored, also on Ctrl-C. Before each mutation the original is copied to `<file>.invariants-bak`; if a run is killed outright (a timeout, a crash), the next run restores the file from that copy and says so. The script writes `invariants.json` only for `stamp`. Commit your work before the first run anyway.

## Closing a survivor
1. Read the line the report names. Ask: if this edit were a real bug, would anyone notice?
2. If yes, add one rule or one assertion that fails on it, with its own `mutate`, and rerun until the survivor is `killed`.
3. If the edit changes nothing (an equivalent change), add its `file:line:op` to `invariants/probe-ignore.json`. Line numbers shift when code moves, so rerun after big edits.
Survivors need a model only to draft the new rule; finding them never does.

## Rules for Claude
- The user owns the rule sentence. Draft wording, never reword a rule to make a check pass.
- Do not weaken a check or a mutation to turn `VACUOUS` or `FAIL` green. Report it.
- Say what a rule does not cover. A passing check proves only the rule as written.
- Run `stale` before relying on an old `PASS`. Run `stamp` only after the user has seen a clean `run`.
- Never run a model-based step here. If a check needs one, say so and stop.
