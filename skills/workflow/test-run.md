---
name: test-run
description: Run the project's tests and read only the verdict, not the log. Load when the user asks to run tests, check a specific case, or route test runs to an agent or a free model.
---

# Test Run — Verdict First, Raw Log Never

Raw test output is the biggest avoidable context cost in a build loop. A script runs the tests and returns a verdict plus capped failure excerpts. Measured: a green 70-test run is 96,993 characters raw and 40 digested.

```
node <skill-root>/test-run/cli.js [<case words>] [--model auto|none|local|kaggle|unified|claude[:haiku|sonnet|opus]] [--cmd "<command>"] [--log <file>]
```

- The script always runs first. No case words: the whole suite. Case words ("login expired token"): only the test files whose name or titles match; says so when none match, then write the test first.
- A pass is one line and ends there. Only a failure can involve a model, and `--model` is the one choice:
  - `auto` (default): the chain, never skipped: local Ollama, the `LOCAL_LLM_URL` endpoint (Kaggle tunnel; digest leaves the machine, secrets masked), the free router (`unified`), then one Claude subagent. An unreachable or failing step hands over to the next. `tests` in `.claude/ai-backends.json` limits the steps (empty: Claude only; no list: local and kaggle). A digest of 25 lines or fewer stays as is; the subagent joins only when it was cut off or holds 4+ distinct errors.
  - Claude tier in auto: haiku at low effort; sonnet at low effort when the log is over 40k tokens or has 4+ distinct errors. Never fable. Opus only by explicit `--model claude:opus`.
  - Anything above sonnet low (higher effort) is never started on its own: the script prints NEEDS APPROVAL (exit 4). Ask the user, then rerun with `--from-log <saved log> --model claude --allow sonnet:medium` (no tests rerun). Ask at the planning stage when a plan includes test runs, so the answer can be stored once as `"allow": "sonnet:medium"` in `.claude/test-gate.json`; if that was skipped, this stop is the fallback ask.
  - `none`, `local`, `kaggle`, `unified`, `claude[:...]` force one step, no chain.
- A pass never starts an agent or a model: the script decides from its own output, and a pass has nothing to condense.

Laya was tried for tier choice and cannot judge a test report. The model arms and the tier thresholds are unmeasured: no A/B has shown they beat the digest alone.

## Stop hook (optional)
Register `node <skill-root>/test-run/cli.js gate` as a Stop hook. It runs the tests once per changed working tree, stays silent on a pass, and blocks the stop with the digest on a failure. It never re-enters (`stop_hook_active`) and skips unchanged trees. Without a configured command it does nothing.

## Rules
Never paste raw test output into the reply. After a failure, read the named file:line, fix, rerun the same command.
