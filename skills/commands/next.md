---
description: Queue the next task (tsk-note) or start it (tsk-start); loads only the skills it needs
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Skill scope result:

!`node {{skill-root}}/skill-scope/auto.js apply $ARGUMENTS`

Arguments: $ARGUMENTS

The first word is the mode: `tsk-note` or `tsk-start`; the rest is the task. The scope engine already ignored the mode word. If the first word is neither mode, ask which was meant and stop; record nothing.

Do these in order, in both modes:
1. Say in one line what was archived and which skills are active for the task. If a skill the task needs is not listed as active, say so and name it; never restore it by hand.
2. Record the task in `handover.md` in the project root under `## Next task`, as one line `<mode>: <task>`, replacing any previous text there. Add the section after `## Current state` if it is missing, and create the file if there is none. If a `handover/` folder exists, follow the `role-session` skill and write the per-role file instead. Touch no other part of the file.
3. Confirm in one line that it is recorded.

Then, by mode:
- `tsk-note`: stop. Read no files, make no plan, edit nothing, start nothing. The task waits for the user or for `/pickup` in a later session.
- `tsk-start`: declare the project standards per the contract before the first edit. If the task is vague or touches several files, follow `plan-first` or `intent-capture` before editing. Then begin the task.

Use the `skill-scope` skill if it is installed. This moves skill folders and writes only the `## Next task` line.
