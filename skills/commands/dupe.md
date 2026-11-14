---
description: Copy a marked block into other files, swapping per-file values
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Dupe result:

!`node {{skill-root}}/plan-first/dupe.js $ARGUMENTS`

Relay the result as is. The command edits the target files; add `--dry-run` first to preview. It never edits the source file and never runs git. If it printed a usage line, show it and stop. Keep the reply under 8 lines.
