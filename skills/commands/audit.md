---
description: Standards audit of the whole project (runs the code-audit script, then summarizes)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Audit summary (worst rules, worst files, biggest fix):

!`node {{skill-root}}/skill-scope/auto.js run code-audit audit.js --no-fail --summary $ARGUMENTS`

Relay the summary as is. Open a file only when a finding needs judgment; rerun with `--rule <id>` for the full list of one rule.
