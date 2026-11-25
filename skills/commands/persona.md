---
description: Choose how replies are phrased: persona set female|male novice|mid|pro, off, status, list
argument-hint: set female|male novice|mid|pro | off | status | list
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Personality settings:

!`node {{skill-root}}/personality/inject.js --$ARGUMENTS`

Quote the line above verbatim (the user cannot see tool output), then add at most one sentence. Arguments are `set female|male novice|mid|pro`, `off`, `status`, `list`. A new choice applies from the next session.
Reply in at most 2 lines.
