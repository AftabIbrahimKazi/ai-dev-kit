---
description: Responsive check on RULE 17 zones; custom ranges, widths, --detect
allowed-tools: Bash(node:*)
---
Viewport plan or breakpoint report:

!`node {{skill-root}}/responsive-check/probes.js $ARGUMENTS`

Use the `responsive-check` skill if it is installed. Without a URL in the arguments, ask the user for the page URL before measuring. Show this plan in one line, then run `measure.js` on the plan's viewport values. If the output ends with CONFIRM, ask the user before measuring. If it only printed a `--detect` report, show it and ask which ladder to use. Report grouped findings, propose fixes as RULE 17 ranges, and apply none until the user approves.
