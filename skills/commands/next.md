---
description: Queue the next task (tsk-note) or start it (tsk-start); loads only the skills it needs
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Skill scope result:

!`node {{skill-root}}/skill-scope/auto.js apply --require-task $ARGUMENTS`

Arguments: $ARGUMENTS

The first word is the mode: `tsk-note` or `tsk-start`; the rest is the task. The scope engine already ignored the mode word, and moves nothing when the mode word or the task is missing. If its result says no skills moved for that reason, ask which mode and what task were meant and stop; record nothing.

Do these in order, in both modes:
1. List by name what was archived, what was restored and which skills are active for the task, as the result names them; if nothing was archived or restored, say "no skills moved". If a skill the task needs is not listed as active, say so and name it; never restore it by hand.
2. Record the task in `handover.md` in the project root under `## Next task`, as one line `<mode>: <task>`, replacing any previous text there. Also write the skills the result named as moved into a `## Skills` section (replace the old one; lines `archived: …` and `restored: …`, omit an empty line, write nothing if no skills moved). Add the section after `## Current state` if it is missing, and create the file if there is none. If a `handover/` folder exists, follow the `role-session` skill and write the per-role file instead. Touch no other part of the file.
3. Confirm in one line that it is recorded.

Then, by mode:
- `tsk-note`: stop. Read no files, make no plan, edit nothing, start nothing. The task waits for the user or for `/pickup` in a later session.
- `tsk-start`: declare the project standards per the contract before the first edit. If the task is vague or touches several files, follow `plan-first` or `intent-capture` before editing. Then begin the task.

Use the `skill-scope` skill if it is installed. This moves skill folders and writes only the `## Next task` line.
