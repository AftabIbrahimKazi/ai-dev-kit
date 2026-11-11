---
description: Mechanical check of staged changes before commit
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git status:*)
---
Staged-change check (secrets, sensitive and stray files, debug leftovers, version bump, message when given):

!`node {{skill-root}}/pre-commit/check.js --staged --no-fail --verdict --version-check $ARGUMENTS`

Relay the report and its verdict line as is. On STOP, list the BLOCK findings and stop. Pass a draft message as `--message "<text>"` to have its format checked too. Do not run `git commit` unless asked. Keep the reply under 10 lines.
