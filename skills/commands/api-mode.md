---
description: Switch Claude Code between the free unified router and the subscription (applies next session)
argument-hint: '[free | claude]  (none = current mode)'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
API mode switch:

!`node {{skill-root}}/skill-scope/api-mode.js $ARGUMENTS`

Relay the output verbatim, then add one line: the change applies from the NEXT session — the current session keeps the backend it launched with. If the output says "refused", relay the reason as is. Keep the reply under 6 lines.
