---
description: Rewrite handover.md in place so the next session resumes cold
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Repository state:

!`node -e "process.stdout.write(require('child_process').execFileSync('git',['status','--short','--branch'],{encoding:'utf8'}))"`

Size check (empty means within limits):

!`node {{skill-root}}/handover/size.js check`

Skills for the next task (the script moves nothing when no task was given after /wrap-up):

!`node {{skill-root}}/skill-scope/auto.js wrap $ARGUMENTS`

Skills moved since the last wrap-up (the script also starts the next window):

!`node {{skill-root}}/skill-scope/auto.js report --mark`

Paste those lines into `handover.md` under `## Skills` (replace the old section), so `/pickup` can show them. Pinned skills are always active and are not listed.

If the size check lists a problem, fix it in this rewrite (demote or delete per the `handover` skill, keep one `## Last session` block). Update `handover.md` in the project root in place, replacing stale content instead of appending a log (create it if missing; if a `handover/` folder exists, follow the `role-session` skill and write the per-role file instead). Keep these sections, under 120 lines in total:

1. `Updated: <date> · Branch: <branch>`
2. **Current state:** 2 to 4 sentences, what works and what is mid-flight.
3. **Last session:** what was done, in outcomes, not a tool-call log.
4. **Decisions & why:** only decisions a later session could accidentally reverse, one line each.
5. **Known issues**, **Next steps** (in order), **Don't touch / gotchas.**

Keep an existing `## Next task` section exactly as it is, unless this session completed that task: then delete it. It is the one line `/next` wrote for the next session, so never rewrite or merge it into Next steps.

Delete anything shipped, fixed or no longer true. Keep the file under 40 lines. Do not commit unless asked. Anything the user added after "/wrap-up" is the next task: put it first under Next steps. $ARGUMENTS
