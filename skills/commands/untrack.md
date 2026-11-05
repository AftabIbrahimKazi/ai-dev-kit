---
description: Hide files from git status and the VS Code Changes tree (hide), bring them back (show), or list what is hidden
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Untrack result:

!`node {{skill-root}}/untrack/hide.js $ARGUMENTS`

Report the lines above in three lines or fewer. If a tracked file was hidden, add once that `git pull` will refuse while upstream changes it, and `/untrack show <path>` fixes that. If the output is a usage error, show the usage: `/untrack hide <path|folder|glob>…`, `/untrack show <path>…`, `/untrack list`. Do not stage, commit or edit `.gitignore`.
