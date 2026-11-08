---
description: Archive skills you do not need this session (with no names, every archivable skill)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Result:

!`node {{skill-root}}/skill-scope/auto.js drop $ARGUMENTS`

Arguments: $ARGUMENTS

Relay the script's lines unchanged. Only skills in the archivable set move; a pinned skill is reported as "pinned, not moved" and stays. With no names the script archived every archivable skill that was active. Do nothing else. Reply in at most 4 lines.
