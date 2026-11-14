---
description: Scan for legacy web patterns and list modern replacements
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Modern web scan:

!`node {{skill-root}}/modern-web/cli.js $ARGUMENTS`

Relay the table as is. Each row is a candidate: open a file only to check its keepWhen note, drop vendor code and fallbacks, and never edit unless the user asked to modernize. Where a row says the kit's standard wins, follow the kit. If the scan was skipped, say why in one line. Keep the reply under 12 lines.
