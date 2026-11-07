---
description: Check or record a teardown simulator's tour as an MP4
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Teardown film report:

!`node {{skill-root}}/teardown-film/cli.js $ARGUMENTS`

Use the `teardown-film` skill if it is installed. By argument:
- `status [<dir>]`: report what is ready and what is missing. If ffmpeg is missing, give the one install line and stop.
- `film <dir> --dry-run`: report the frame count and the output file. Say so if a long run will be slow.
- `film <dir> --preview`: report the file written. Check a frame before calling it good.
- No argument or a bad one: show the usage line and the two words.
It writes only the video file and never commits. Keep the reply under 15 lines.
