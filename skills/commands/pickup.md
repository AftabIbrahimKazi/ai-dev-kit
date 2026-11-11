---
description: Resume from handover.md without re-explaining
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Handover, queued task and archived skills (to bring one back: `/unarchive <name>`):

!`node {{skill-root}}/skill-scope/auto.js pickup`

The handover above is the authoritative state: do not re-read files it summarizes. Say the NEXT TASK line (the `## Next task` section) first; this command never starts it. Then in 8 lines or fewer give where things stand and the next step; run `git status` only if it flags uncommitted work. NO_HANDOVER_FILE means say so and stop; if it names a `handover/` folder, follow the `role-session` skill. Edit nothing.
