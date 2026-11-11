---
description: Weigh a build's payload: heavy chunks, images, fonts, blocking scripts
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Static payload weigh-in, ranked by bytes:

!`node {{skill-root}}/skill-scope/auto.js run perf-audit weigh.js --summary $ARGUMENTS`

Relay the table as is. If it says no build folder was found, ask whether to build first. Open no file it does not name and apply no fix unless asked.
