---
description: Rewrite handover.md in place so the next session resumes cold
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Facts (header line, commits and uncommitted files, session journal when present, size check; made by script):

!`node {{skill-root}}/handover/draft.js --journal`

Skills for the next task (the script moves nothing when no task was given after /wrap-up):

!`node {{skill-root}}/skill-scope/auto.js wrap $ARGUMENTS`

Skills moved since the last wrap-up (the script also starts the next window):

!`node {{skill-root}}/skill-scope/auto.js report --mark`

Paste the `Updated:` line from the facts as the first line of `handover.md`, and paste the skills lines (and any skills the `wrap` line names as archived or restored) under `## Skills`, replacing the old section, so `/pickup` can show them. Pinned skills are always active and are not listed.

Write only the judgment sections yourself, in place and without appending a log (create the file if missing; if a `handover/` folder exists, follow the `role-session` skill and write the per-role file). Keep these sections, under 120 lines in total:

1. **Current state:** 2 to 4 sentences, what works and what is mid-flight.
2. **Last session:** what was done, in outcomes from the commits and journal above, not a tool-call log. Keep one `## Last session` block.
3. **Decisions & why:** only decisions a later session could accidentally reverse, one line each. Keep every existing one that is still true.
4. **Known issues**, **Next steps** (in order), **Don't touch / gotchas.**

Keep an existing `## Next task` section exactly as it is, unless this session completed that task: then delete it. It is the one line `/next` wrote for the next session, so never rewrite or merge it into Next steps.

If the size check lists a problem, fix it in this rewrite (demote or delete per the `handover` skill). Delete anything shipped, fixed or no longer true. Do not commit unless asked. Anything the user added after "/wrap-up" is the next task: put it first under Next steps. $ARGUMENTS
