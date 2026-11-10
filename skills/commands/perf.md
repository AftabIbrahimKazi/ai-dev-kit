---
description: Weigh a build's payload: heavy chunks, images, fonts, blocking scripts
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Static payload weigh-in:

!`node {{skill-root}}/skill-scope/auto.js run perf-audit weigh.js $ARGUMENTS`

Use the `perf-audit` skill if it is installed. Rank the findings by bytes in a table of at most 7 rows: finding, measured size, fix, effort (S/M/L). Lead with the single heaviest item. If the output says no build folder was found, say so and ask whether to build first. Do not open files the table does not name, and apply no fix unless asked.
