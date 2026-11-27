---
name: web-search
description: Opt-in. Use for a quick web search answered from the free router's search engines, as a compact hit list instead of Claude's own search. Load BEFORE running a web search that way.
---

# Web search: one query, a compact hit list

**Opt-in only, never part of a default install.** It needs the free router running with its key in `~/.ai-dev-kit/.env` (or `UNIFIED_API_KEY` in your shell). The router picks the search engine (it lists `parallel` and `keenable`); the kit sends the query and nothing else. Without the router or the key it says "skip" and Claude's own WebSearch does the job as usual.

## First run (a person typing, no experience needed)
1. Check what is ready: `node <skill-root>/web-search/cli.js check`. It prints two lines: router key set or missing, and the router address.
2. Search: `node <skill-root>/web-search/cli.js node.js 24 release date`.
3. You get one line of JSON with a `hits` list (title, url, a short snippet each). A line starting with `skip:` says why nothing came back (no key, router down, no hits). Nothing is broken; Claude's own search covers it.

## The tool
`node <skill-root>/web-search/cli.js <query...> [--max 5] [--allow a.com,b.org] [--block x.com]` or `check`. Plain Node, no dependencies, no model call. Code does all the work: one POST to `<router>/v1/search`, tracking parameters stripped from URLs, duplicates dropped, domain filters applied, and each hit cut to the 360-character window of its page text that holds the most query words. Exit code 2 means "not done, let Claude's own tool run". A key is read, never printed.

## The mod (optional, makes it automatic)
`install-kit mods --root <project> --web-search on` installs the `web-search` mod at project scope. It answers a WebSearch call with this script's hit list and falls through to Claude's own WebSearch on any failure, no key, no hits, or an `extended` (thorough) search. `--web-search off` removes it. The mod does nothing without this skill installed.

## Rules
- **Hits, not answers.** You get titles, links and short snippets; open a page (WebFetch, or the `web-digest` add-on) when a snippet is not enough.
- **Thorough searches stay with Claude.** A request marked extended is never taken over.
- **Measured, not assumed.** In the kit's own A/B (Haiku, three fact questions, two runs each) total cost fell 74% with the mod, answers stayed correct 6 of 6 and wall time fell about 15%; the model made a few more tool calls (20 turns against 16). See `findings/2026-11-27-web-search.md`.

## Credit
The search engines sit behind FreeLLMAPI (MIT), which the kit uses as an external tool and never bundles. See `CREDITS.md`.
