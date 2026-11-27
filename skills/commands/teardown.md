---
description: Detect, scaffold, check, build, photograph, film or score a 3D machine simulator
argument-hint: detect | init <name> | check <dir> | build <dir> | sheet <dir> | probe <dir> | film status [<dir>] | film <dir> [--dry-run|--preview] | sound <dir> [--dry-run] | sound measure <file.wav>
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
- `film status [<dir>]`: report what is ready and what is missing. If ffmpeg is missing, give the one install line and stop.
- `film <dir> --dry-run`: report the frame count and the output file. Say so if a long run will be slow.
- `film <dir> --preview`: report the file written. Check a frame before calling it good.
- `sound <dir> --dry-run`: report the output file and the hum frequency, or that there is none.
- `sound <dir>`: report the file, length, loudness and peak exactly as printed. Never describe how it sounds.
- `sound measure <file.wav>`: report the same three numbers for any 16-bit mono 48 kHz WAV.
- `film` and `sound` run the opt-in `teardown-film` and `teardown-sound` add-ons. If the script says one is not installed, say so and name the install line it prints.
- No argument or a bad one: show the usage line and the eight words.
It writes only inside `teardown/<name>/` and `teardown-out/<name>/`, and never commits. Keep the reply under 15 lines.
