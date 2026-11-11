---
description: Turn exported Figma PNG/SVG files into project-context/design/figma.md (no MCP)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Figma intake from exported files: `$ARGUMENTS`

!`node {{skill-root}}/project-context/figma.js $ARGUMENTS`

Needs the `project-context` add-on and no Figma connector. Export frames from Figma (SVG with "Outline text" unchecked for colors, fonts and text; PNG for a visual reference) into a folder and pass it, optionally with `--link <figma url>` and `--tokens <css file>`. The report above is the draft; its Token column is already matched to the project's tokens.

- No argument: ask for the export folder. `project-context/design/` missing: suggest `/ctx init`.
- To save: rerun with `--write`, then `node {{skill-root}}/project-context/scan.js changed design`, add the draft's tables to `design/INDEX.md` and run `scan.js stamp design`.
- Open a PNG only for a layout question, one at a time. Never paste raw SVG. Keep the content out of commits and published pages.
Under 20 lines.
