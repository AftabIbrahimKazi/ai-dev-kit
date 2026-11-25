---
description: Prove project rules can fail, probe for thin checks, flag stale rules
argument-hint: '[run | probe | stale | stamp | check] [--target F] [--max N]  (none = everything)'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Invariants report:

!`node {{skill-root}}/invariants/cli.js $ARGUMENTS`

Use the `invariants` skill if it is installed. No argument runs everything: `== rules`, `== probe`, `== stale`.
- `PASS` and `0 survived` mean nothing to do. Say so in one line.
- `VACUOUS`, `FAIL` or `BADMUTATION`: name the rule and the fix. Never weaken a check or a mutation to turn it green.
- `SURVIVED file:line op`: a spot no rule notices. Read that line. If the edit would be a real bug, propose one rule or check (the user approves the wording); if it changes nothing, offer to add `file:line:op` to `invariants/probe-ignore.json`.
- `stale`: the covered files changed since the rule was verified. Offer `stamp` only after a clean run.
- Other arguments (`run`, `probe`, `stale`, `stamp`, `check`, `--target F`, `--max N`) pass straight to the script.
It edits covered files only for a moment and restores them, and never commits. Keep the reply under 15 lines.
