---
description: Choose how replies are phrased: persona set female|male novice|mid|pro, off, status, list
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Personality settings:

!`node {{skill-root}}/personality/inject.js --$ARGUMENTS`

Report the line above in one sentence. Arguments are `set female|male novice|mid|pro`, `off`, `status`, `list`. A new choice applies from the next session.
