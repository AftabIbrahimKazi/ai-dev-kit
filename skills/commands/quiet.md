---
description: Run a noisy command with shortened output; failures kept
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Compacted output (the last line is the command's exit code):

!`node {{skill-root}}/session-budget/compact.js --report-exit -- $ARGUMENTS`

State pass or fail and quote each failure line. The full output is saved under `~/.ai-dev-kit/raw` if more is needed.
