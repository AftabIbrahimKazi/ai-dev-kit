---
description: Find hidden state machines (boolean flags, scattered toggles) in UI code
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Implicit state audit:

!`node {{skill-root}}/skill-scope/auto.js run implicit-state-audit scan.js $ARGUMENTS`

Relay the table as is. For each FAIL, name the one state variable that replaces the flags. A WARN on truly independent flags is a false alarm: say so in one line. Edit nothing unless the user asks. Keep the reply under 12 lines.
