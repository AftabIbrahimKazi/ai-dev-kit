---
description: Security recon map: routes, auth, env reads, sinks, secrets, obvious things
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Recon inventory (locations, not findings):

!`node {{skill-root}}/skill-scope/auto.js run security-audit recon.js $ARGUMENTS`

Use the `security-audit` skill if it is installed. Turn the inventory into a half-page map: entry points, which of them show no auth marker, data stores, outbound calls, the sink classes present, and any secret or obvious item to check first. Name no vulnerability from this output alone; a finding needs the five parts the skill lists. Under 20 lines.
