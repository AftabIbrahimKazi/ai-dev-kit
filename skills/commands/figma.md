---
description: Turn exported Figma PNG/SVG files into project-context/design/figma.md (no MCP)
allowed-tools: Bash(node:*)
---
Figma intake from exported files: `$ARGUMENTS`

!`node {{skill-root}}/project-context/figma.js $ARGUMENTS`

This needs the `project-context` add-on and no Figma connector. The user exports frames from Figma (File, Export, SVG for colors, fonts and text; PNG for a visual reference) into a folder and passes it, optionally with `--link <figma url>`. The report above is the draft.

- If it says `project-context/design/` is missing, suggest `/ctx init`. If no argument was given, ask for the export folder.
- To save it, run the same command with `--write`, then `/ctx analyze design`. Add the draft's tables to `design/INDEX.md`; map colors and type sizes to the project's token names if a token file exists.
- Do not open PNG files unless a layout question needs them; open one at a time. Never paste raw SVG into the reply. Keep the content out of commits and published pages.
