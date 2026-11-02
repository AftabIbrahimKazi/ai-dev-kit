---
description: Set the next task and load only the skills it needs
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Skill scope result:

!`node {{skill-root}}/skill-scope/auto.js apply $ARGUMENTS`

Say in one line what was archived and which skills are active for the task. Then start the task. If a skill the task needs is not listed as active, say so and name it; never restore it by hand. Use the `skill-scope` skill if it is installed. This moves skill folders only; it edits no project file.
