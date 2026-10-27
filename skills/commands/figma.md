---
description: Read a Figma file into project-context/design/ (read-only)
---
Figma source: `$ARGUMENTS`

This needs the `project-context` add-on and the Figma connector. If `project-context/design/` does not exist, say so and suggest `/ctx init`. If no Figma connector or MCP server is available and authorized in this tool, say so and stop; authorizing is done in the tool's own connector or MCP settings.

With a Figma URL or file key, read the file through the connector, read-only, and write `project-context/design/figma.md` as tables: file name and link; pages and frames; components with variants; colors, type styles and spacing as tokens, mapped to the project's token prefix if a token file exists. Condense, do not paste raw output. With no argument, re-read the link already in `figma.md` and show what changed. Then run `/ctx analyze design`. Never write back to Figma, and keep the content out of commits and published pages.
