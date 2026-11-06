---
description: Archive skills you do not need this session (or list what is archived with no names)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Result:

!`node {{skill-root}}/skill-scope/auto.js drop $ARGUMENTS`

Arguments: $ARGUMENTS

Relay the script's lines unchanged. Only skills in the archivable set move; a pinned skill is reported as "pinned, not moved" and stays. With no names the script printed the archive list. Do nothing else. Reply in at most 4 lines.
