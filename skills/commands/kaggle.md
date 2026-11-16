---
description: Run a finished plan on a Kaggle GPU model, then review the result
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Kaggle executor:

!`node {{skill-root}}/kaggle/cli.js $ARGUMENTS`

Relay the output in under 12 lines. Subcommands: `setup`, `plan <plan.md>`, `run <plan.md>`, `fetch`, `retry`, `status`, `stop`, `usage`, `review`, `learn` (after copy-in: saves staged-vs-repo differences as a local dataset of (bad, fixed) pairs). Never run `run` or `retry` unless the user typed it: they use GPU quota. After a run, the staged files are in the staging folder the output names, not in the repo: review each failure line yourself, fix what is left, and copy files into the repo only after checking them. Never review the model's work with the model.
