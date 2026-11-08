---
description: Bring archived skills back now (with no names, every archived skill)
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Result:

!`node {{skill-root}}/skill-scope/auto.js add $ARGUMENTS`

Arguments: $ARGUMENTS

With or without names, the script restored them and printed the SKILL.md paths: read each path it names, then say in one line which skills are now active. A name the script calls "not installed" is reported as is; never restore anything by hand. Reply in at most 4 lines.
