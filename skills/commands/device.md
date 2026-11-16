---
description: Scan this machine and say which kit preset fits: Have / Missing / Next
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Device check (read-only, installs nothing):

!`node {{skill-root}}/skill-scope/device.js $ARGUMENTS`

Relay the report as is. Do not run any command from the Next list: each one downloads files, so the user runs them, or says which one to run. Keep the reply under 25 lines.
