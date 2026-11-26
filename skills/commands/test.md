---
description: Run tests, get the verdict only. Optional case words; a model is used only on a failure
argument-hint: '[case words] [--model auto|none|local|kaggle|unified|claude[:haiku|sonnet|opus]]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Agent
---
!`node {{skill-root}}/test-run/cli.js $ARGUMENTS`

Relay it in under 8 lines; never rerun the tests. DELEGATE: spawn exactly one subagent with the model and effort it names. NEEDS APPROVAL: start no agent, ask the user its three options, run the command it gives for their pick. Never choose opus or fable.
