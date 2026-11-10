---
name: shopify-toolkit-install
description: "setup for shopify", "install shopify skills", "shopify ai toolkit". Load BEFORE fetching anything.
---

# Shopify Toolkit Install — Live Pull, Not a Fork

Shopify publishes its own skills (Liquid, Shopify CLI, storefront GraphQL, partner, dev, onboarding) at `github.com/Shopify/Shopify-AI-Toolkit`. `ai-dev-kit` never stores a copy of these — doing so would misattribute Shopify-authored content inside an MIT/self-authored repo and fork their telemetry hook onto every future kit install. This skill is a thin installer that clones the live source straight into the target project instead, the same install-time-only relationship `install-kit` has with this repo's own skills.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a source-repo path change, a skill list update, a telemetry-opt-out step that changed). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Source (verify, don't assume)
`github.com/Shopify/Shopify-AI-Toolkit`, `skills/` folder. This is Shopify's repo, not this kit's — confirm it still exists and the `skills/` path is current before cloning; if it moved, update this line and note the change in `learnings.md`, don't silently guess a new URL.

## Procedure

### 1. Confirm scope
Ask which of the toolkit's skill folders to install (default: all) — typical set: `shopify-liquid`, `shopify-dev`, `shopify-use-shopify-cli`, `shopify-storefront-graphql`, `shopify-partner`, `shopify-onboarding-dev`. Only proceed once the project is confirmed to be a Shopify theme/app (has `shopify.theme.toml`, a `templates/`+`sections/` Liquid layout, or the user just said so).

### 2 and 3. Pull with the script
```
node <skill-root>/shopify-toolkit-install/get.js list                      # what is upstream, and its commit
node <skill-root>/shopify-toolkit-install/get.js install --root <project> [--skills a,b] [--dry-run]
```
`install` shallow-clones the source to a scratch folder (never into the skill root, so a failed clone cannot corrupt existing skills), copies each chosen `skills/<name>/` folder whole into the routed skill root (from `.ai-dev-kit.json`, else the tool folder present, else `.claude/skills`), deletes the clone, writes the Step 5 note and prints the Step 4 telemetry text. Existing folders are kept unless `--force`. `--source <url>` only when the Source line above changed. Keep the `shopify-*` naming as-is; it already avoids collision with ai-dev-kit skill names.

### 4. Flag the telemetry hook before wiring anything
The toolkit's scripts send usage telemetry (queries, code, model identifiers) to shopify.dev by default. Before finishing, tell the user this plainly and give the two opt-out mechanisms Shopify documents: set `OPT_OUT_INSTRUMENTATION=true`, or create an empty file at `~/.config/shopify-ai-toolkit/opt-out`. Ask whether to apply the opt-out now — never silently leave a phone-home default active without surfacing it, and never enable/wire any hook config on the user's behalf without asking first (same bar as `hooks-enforcement`'s treatment of its own sample hooks).

### 5. Record the snapshot, not a live link
This is a point-in-time copy, no auto-update mechanism (the toolkit's own `.mcp.json` was empty at last check — no MCP server wiring either). Note in the project's session-protocol file (`CLAUDE.md`/`AGENTS.md`) (a short line, following the pattern already used in Shopify theme projects installed from this kit) that these skills are Shopify-authored, installed via this skill, and should be re-pulled by re-running this skill rather than hand-edited for upstream changes.

### 6. Report
List what was installed (skill names + count), the telemetry decision made, and the re-pull instruction (re-run this skill to refresh).

## Hard rules
- Never copy these files into the `ai-dev-kit` repo itself — this skill's only job is to move Shopify's files into someone else's project, live, each time it runs.
- Never modify the pulled skills' content (strip/rewrite) — they are Shopify's, used as-is; if telemetry or content changes are objectionable, that's an opt-out or a decision not to install, not a silent fork.
- Never wire the telemetry opt-out or any hook without asking first.
