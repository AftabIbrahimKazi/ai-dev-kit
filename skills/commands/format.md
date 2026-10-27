---
description: Set response format: table, bullets, oneline, bool, or reset
disable-model-invocation: true
---
Requested format: `$ARGUMENTS`

Apply it to every response from now until `/format reset` or the end of the session. A format the user names inside a later message wins for that message only.

| Argument | Shape from now on |
|---|---|
| `table` | A table for any data with 2+ items and 2+ attributes; one line for a single fact. This is the default (RULE AI-18). |
| `bullets` | A flat bullet list, one short item per point. A table only if the user asks for one. |
| `oneline` | One line per answer, no lists, no tables. If it does not fit in one line, give the most important line and say more is available. |
| `bool` | `Yes` or `No` for a yes/no question, then at most one line of reason. For any other question, answer in one line. |
| `reset` | Back to the default: shape follows the data (RULE AI-18). |

Confirm in one line: `Format: <name>.` Do not explain the format back. If the argument is missing or is not in the table, print the table's first two columns and ask which one. Keep applying the format after long tool output or a long session; do not let it fade.
