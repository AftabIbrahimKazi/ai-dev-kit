---
description: Resume from handover.md without re-explaining
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Handover file (printed as NO_HANDOVER_FILE if there is none):

!`node -e "try{process.stdout.write(require('fs').readFileSync('handover.md','utf8'))}catch(e){console.log('NO_HANDOVER_FILE')}"`

Treat the handover above as the authoritative current state: do not re-read files it already summarizes. In 8 lines or fewer say where things stand, what is in flight, and the next step; verify only what it flags as in flight (for example `git status` if it mentions uncommitted work). If the file is missing, say so; if a `handover/` folder exists instead, follow the `role-session` skill. Edit nothing.
