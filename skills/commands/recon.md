---
description: Security recon map: routes, auth, env reads, sinks, secrets, obvious things
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Recon map (locations, not findings):

!`node {{skill-root}}/skill-scope/auto.js run security-audit recon.js --summary $ARGUMENTS`

Relay the map as is. Name no vulnerability from it; a finding needs the five parts the `security-audit` skill lists. For the full inventory with file:line, rerun the script without `--summary`. Keep the reply under 20 lines.
