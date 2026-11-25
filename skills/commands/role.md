---
description: Pick a job role (frontend, backend, seo, devops...) and load its skills and standards; no argument lists the roles
argument-hint: '[frontend|backend|fullstack|qa|seo|devops|security|performance|designer|accessibility|docs|refactor]  (none = list)'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Role loadout:

!`node {{skill-root}}/skill-scope/role.js $ARGUMENTS`

If the line above is a usage or unknown-role error, show the role list it printed and stop. Otherwise the script already restored the role's archived skills. Repeat its result in your reply (the user cannot see tool output), name the skills and standards files, and read only the standards the next task touches. Do not start any other work. Keep the reply to at most 6 lines.
