---
description: Detect, scaffold, check, build or photograph a 3D machine simulator
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Teardown report:

!`node {{skill-root}}/teardown/cli.js $ARGUMENTS`

Use the `teardown` skill if it is installed. By argument:
- `detect [--about "text"] [--model file.glb]`: list the open questions. Ask them in one message and ask for a reference. Install packages only after the user agrees.
- `init <name>`: report the files written.
- `check <dir>`: report errors first, then warnings and `triforge:` notes.
- `build <dir>`: report the folder written and that it needs a static server.
- `sheet <dir>`: read the sheet it names, then fix what the tiles show. Never call the machine done without reading it.
- `probe <dir>`: report each check; any FAIL is a bug in the page, fix it.
- No argument or a bad one: show the usage line and the six words.
It writes only inside `teardown/<name>/` and `teardown-out/<name>/`, and never commits. Keep the reply under 15 lines.
