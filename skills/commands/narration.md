---
description: Control reply narration: play, pause, mode, mute, voice, volume, speed, alerts, status
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Narration settings:

!`node {{skill-root}}/narrate/speak.js --$ARGUMENTS`

Report the line above in one sentence. Arguments are `play` (read the latest reply), `pause` / `resume` (hold and continue from the same spot), `mode manual|auto`, `mute`, `unmute`, `stop` (cut speech and clear the queue), `replay`, `status`, `voice male|female`, `volume 0-100`, `speed 0.5-2`, `pitch -12..12`, `maxSeconds 30-1800`, `alerts on|off` (spoken alert in a second voice when a reply ends on a question), `alertVoice male|female`, `alertIdle 0-600`.
Reply in at most 2 lines.
