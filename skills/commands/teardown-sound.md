---
description: Write or measure a teardown simulator's score as a WAV file
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Teardown sound report:

!`node {{skill-root}}/teardown-sound/cli.js $ARGUMENTS`

Use the `teardown-sound` skill if it is installed. By argument:
- `sound <dir> --dry-run`: report the output file and the hum frequency, or that there is none.
- `sound <dir>`: report the file, length, loudness and peak exactly as printed. Never describe how it sounds.
- `measure <file.wav>`: report the same three numbers for any 16-bit mono 48 kHz WAV.
- No argument or a bad one: show the usage line and the two words.
It writes only the WAV and never commits. Keep the reply under 15 lines.
