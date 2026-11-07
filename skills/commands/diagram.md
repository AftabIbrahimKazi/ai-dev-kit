---
description: Detect, check or build a stack or structure diagram
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Diagram report:

!`node {{skill-root}}/diagram/cli.js $ARGUMENTS`

Use the `diagram` skill if it is installed. By argument:
- `detect [--structure]`: list the open questions. Ask the user to confirm guessed edges in one message, then edit the spec and run `check <spec>`.
- `check <spec>`: report errors first, then warnings.
- `build <spec>`: report the files written and print the README snippet. Look at the result before calling it done.
- `icons <name>...`: downloads logos from the network. Run it only after the user agrees.
- No argument or a bad one: show the usage line and the four words.
It writes only the spec and the files named in the report, and never commits. Keep the reply under 15 lines.
