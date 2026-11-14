---
description: Review a plan with fresh-context goldfish reviewers
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Goldfish review:

!`node {{skill-root}}/plan-first/goldfish.js $ARGUMENTS`

If the output starts with `goldfish prepare`, follow it: start one fresh subagent per stage (Read, Grep and Glob only, no CLAUDE.md, no conversation), collect each report, then resolve the findings yourself and edit the plan. If you cannot start subagents, stop and say so. If it ran `local`, relay the stage lines in under 10 lines. Never put the plan's author context into a reviewer.
