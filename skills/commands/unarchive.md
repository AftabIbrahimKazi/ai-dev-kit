---
description: Bring archived skills back now (or list what is archived with no names)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Result:

!`node {{skill-root}}/skill-scope/auto.js add $ARGUMENTS`

Arguments: $ARGUMENTS

With skill names, the script restored them and printed the SKILL.md paths: read each path it names, then say in one line which skills are now active. With no names it printed the archive list: relay it unchanged and ask nothing. A name the script calls "not installed" is reported as is; never restore anything by hand. Reply in at most 4 lines.
