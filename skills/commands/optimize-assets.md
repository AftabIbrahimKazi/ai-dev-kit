---
description: Scan, convert, compress or pre-compress assets; originals untouched
allowed-tools: Bash(node:*)
---
Asset report:

!`node {{skill-root}}/optimize-assets/convert.js $ARGUMENTS`

With no arguments this scans the project for heavy assets. Other forms: `convert <paths> --to webp,avif`, `compress <paths>`, `precompress <paths>`, `tools`, `refs <assets>`, and `--preset vision` or `web`. Use the `optimize-assets` skill if it is installed. Show the result as a table. If this was a scan, ask which assets and which target before converting. After a conversion run `refs`, and edit references only if the user approves. Never delete an original unless asked.
