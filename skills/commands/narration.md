---
description: Control reply narration: mute, unmute, voice male|female, volume, speed, pitch, status
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Narration settings:

!`node {{skill-root}}/narrate/speak.js --$ARGUMENTS`

Report the line above in one sentence. Arguments are `mute`, `unmute`, `stop`, `replay`, `status`, `voice male|female`, `volume 0-100`, `speed 0.5-2`, `pitch -12..12`, `maxSeconds 30-1800`.
