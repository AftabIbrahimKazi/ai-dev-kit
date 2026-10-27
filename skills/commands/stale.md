---
description: List memory and handover bullets that name files which no longer exist (report only)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Stale-memory report:

!`node {{skill-root}}/memory-gardener/stale.js $ARGUMENTS`

For each candidate, say in one line whether the lesson was only about that file (delete) or still holds in general (keep or rewrite). Do not edit anything unless asked.
