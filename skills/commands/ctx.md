---
description: Set up and maintain the private project-context/ docs folder
allowed-tools: Bash(node:*)
---
Project-context report:

!`node {{skill-root}}/project-context/scan.js $ARGUMENTS`

Use the `project-context` skill if it is installed. By argument:
- `init`: if the output shows setup options, ask the user to pick A, B or C and whether to copy existing docs, then run `scan.js init --folders <list> [--copy]`. If `--folders` was given, report what was created.
- `analyze [folder]`: read only the NEW and MODIFIED files listed, update that folder's `INDEX.md`, then run `scan.js stamp <folder>`. If the report says nothing to analyze, say so.
- `status` (default), `detect`, `add <folder> <file>`: show the result as a table. Flag a missing gitignore entry or tracked files first.
Never print the content of a private doc outside the index, and never commit this folder.
