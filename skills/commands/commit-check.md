---
description: Mechanical pre-commit check of what is staged (secrets, stray files, debug leftovers, message format)
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git status:*)
---
Staged-change check:

!`node {{skill-root}}/pre-commit/check.js --staged --no-fail $ARGUMENTS`

If the report has a BLOCK finding, list it and stop. Otherwise check the message, version bump and stray files by hand (use the `pre-commit` skill if it is installed) and say whether the commit is safe to run. Do not run `git commit` unless asked.
