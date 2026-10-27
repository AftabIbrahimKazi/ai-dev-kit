---
description: Resolve merge conflicts: mode, pace and role guardrails
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git status:*), Bash(git diff:*)
---
Conflict set (ours/theirs legend, hunks, kind, role scope):

!`node {{skill-root}}/resolve-conflicts/scope.js list $ARGUMENTS`

Arguments may contain a mode (`both` default, `ours`, `theirs`), a pace (`all`, `auto` default, `step`), `--role <name>`, `--out leave|ours|theirs` and `--note "<instruction>"`. Pass only `--role` and `--out` to the script; read the rest yourself. Use the `resolve-conflicts` skill if it is installed; otherwise resolve in that order: state the legend, apply the mode and pace, leave out-of-scope files per policy, regenerate lockfiles instead of merging them. If the list is empty, say there is nothing to resolve. Run the script's `check` before reporting done. Do not run `git commit` or any `--continue` unless asked.
