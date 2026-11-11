---
description: Convert an exported Figma SVG to pixel-matched HTML and CSS, gated by a pixel diff
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
figma-code report:

!`node {{skill-root}}/figma-code/cli.js $ARGUMENTS --no-fail`

Use the `figma-code` skill if it is installed. If the user attached or pasted an SVG instead of giving a path, tell them to give the file's path (an attached export can be 15 MB and overflows the prompt). Relay the report. By argument:
- `build <file.svg>`: say fonts first (missing fonts explain a failing diff), then the diff and its worst regions, then what was kept as inline SVG. A failing gate: install the missing font or re-export with "Outline text" unchecked; never raise `--max-diff` to pass.
- `standards <dir>` and `adapt <dir>`: say which rules applied or were reverted and which files were written. Run `adapt --dry-run` first when the target folder is unclear.
- `diff <a> <b>`, `detect`: relay as is.
- No argument or a bad one: show the usage line and the five commands.
Write nothing beyond what the report names, and never commit. Keep the reply under 15 lines.
