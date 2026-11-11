---
description: Queue the next task (tsk-note) or start it (tsk-start); loads only the skills it needs
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Skill scope result:

!`node {{skill-root}}/skill-scope/auto.js apply --require-task $ARGUMENTS`

The script moved the skills and wrote `## Next task` and `## Skills` in `handover.md`. Relay its result in one or two lines. If it says no skills moved because the mode word or task is missing, ask which mode and what task were meant and stop. If it says the `handover/` folder exists, write the `## Next task` line (`<mode>: <task>`) in the per-role file per the `role-session` skill. If a skill the task needs is not active, name it; never restore it by hand.

- `tsk-note`: stop. Read no files, make no plan, edit nothing, start nothing.
- `tsk-start`: declare the project standards per the contract before the first edit. If the task is vague or touches several files, follow `plan-first` or `intent-capture`. Then begin the task.

$ARGUMENTS
