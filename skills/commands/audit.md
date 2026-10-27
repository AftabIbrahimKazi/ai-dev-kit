---
description: Standards audit of the whole project (runs the code-audit script, then summarizes)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Audit report (counts, worst files first):

!`node {{skill-root}}/code-audit/audit.js --no-fail --top 15 $ARGUMENTS`

Summarize the report in under 12 lines: the worst rules, the worst files, and the one fix with the biggest effect. Open a file only when a finding needs judgment.
