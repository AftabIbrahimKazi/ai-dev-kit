---
description: Rewrite handover.md in place so the next session resumes cold
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Repository state:

!`node -e "process.stdout.write(require('child_process').execFileSync('git',['status','--short','--branch'],{encoding:'utf8'}))"`

Update `handover.md` in the project root in place, replacing stale content instead of appending a log (create it if missing; if a `handover/` folder exists, follow the `role-session` skill and write the per-role file instead). Keep these sections, under 120 lines in total:

1. `Updated: <date> · Branch: <branch>`
2. **Current state:** 2 to 4 sentences, what works and what is mid-flight.
3. **Last session:** what was done, in outcomes, not a tool-call log.
4. **Decisions & why:** only decisions a later session could accidentally reverse, one line each.
5. **Known issues**, **Next steps** (in order), **Don't touch / gotchas.**

Delete anything shipped, fixed or no longer true. Keep the file under 40 lines. Do not commit unless asked. Anything the user added after "/wrap-up" is the next task: put it first under Next steps. $ARGUMENTS
