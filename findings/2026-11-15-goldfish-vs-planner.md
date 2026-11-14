# Goldfish review versus an external planner, 2026-11-15

## What each path is

- **Goldfish** (Google's Elephant-Goldfish Model, Apache-2.0; github.com/google/elephant-goldfish-model): fresh reviewers with no conversation read the plan and the files it names. Five stages: zoom-out, comprehension test (plan alone, paraphrase it), critic review (design, structure, style), intermediate zoom-out, implementation readiness. Reviewers must be fresh subagent contexts; if none can be started, the protocol says to stop. Our stage prompts and code are our own wording.
- **External planner** (the delegation summary's alternative path): a free or local model drafts the plan in turns (product, risk, tech lead), then Claude executes it.

They act at different times (author versus review), so they do not conflict in principle.

## Measurement

Task: add pagination to a small orders API and list component. Claude = Haiku, plan mode, tools Read/Glob/Grep. 3 runs per arm. Planner = local `qwen2.5:1.5b` on CPU through Ollama (no Gemini key exists on this machine).

| Arm | Claude cost per plan | Turns | Output tokens | Plan quality |
|---|---|---|---|---|
| A: Claude plans alone | $0.105 | 8 | about 2,360 | 7 steps, 4 of 4 paths real |
| B: 1.5B drafts, Claude verifies and fixes | $0.119 (+13%) | 8 | about 2,600 | draft: 3 steps, 1 invented path, runaway repeated lines; final after Claude's fix: 4 to 5 steps, 4 of 4 paths real |

Planner time 205 s of CPU. Claude read the project in both arms, so verifying a weak draft cost as much as planning. Gate: ship only if planning tokens drop. They rose, so the external planner is not shipped (`/plan-ext` removed). Not measured: a stronger planner (Gemini Flash) where the draft might need little checking. The draft code and harness are kept in `findings/harness/plan-ext.planext.draft.txt` and `plan-ext.ab-run.draft.txt` for that retest.

Two bugs the measurement found in the shared reviewer, both fixed: a 25 s hook timeout cut off a CPU model drafting a plan (planning and goldfish calls now allow 240 s), and an uncapped small model rambled until the timeout (calls now cap output tokens: 600 for verdicts, 1,500 for free text, `maxTokens` in `.claude/state-audit.json`).

## Shipped

`/goldfish prepare <plan.md>`: writes the bundle (plan plus the files it names; never secrets, CLAUDE.md or handover) and the five stage prompts outside the project, and prints how to start fresh read-only subagents. This costs Claude tokens by design. `/goldfish local <plan.md>`: runs the same stages on Gemini then Ollama, 0 Claude tokens, quality bounded by the model.

Not measured: goldfish review cost on Claude subagents, and the quality of local-model reviews. A 1.5B model is expected to be shallow; use Gemini or a larger Ollama model for `local`.
