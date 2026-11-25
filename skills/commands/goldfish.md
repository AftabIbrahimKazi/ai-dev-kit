---
description: Review a plan with fresh-context goldfish reviewers
argument-hint: prepare <plan.md> | local <plan.md> [--delay <seconds>]
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Goldfish review:

!`node {{skill-root}}/plan-first/goldfish.js $ARGUMENTS`

If the output starts with `goldfish prepare`, follow it: run each stage yourself, inline, in order. Start subagents only if the user asked for them (agent-usage policy). Say these are inline reviews, not fresh-context ones. Then resolve the findings yourself and edit the plan. If it ran `local`, relay the stage lines in under 10 lines. Never put the plan's author context into a reviewer.
