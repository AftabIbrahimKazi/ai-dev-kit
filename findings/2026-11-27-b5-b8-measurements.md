# B5-B8 measurements (2026-11-27)

House rule: nothing ships without a measured token or quota effect. Source: 47 real Claude Code transcripts (991 turns, 6,148 tool calls) from all non-scratch projects on this machine, read by throwaway scripts that print counts only. Zero model tokens spent. Caveat: one developer, mostly authoring work on the kit itself.

| Item | What was measured | Result | Verdict |
|---|---|---|---|
| B5 light-model routing | Turns with no edit tool, no thinking block, no Bash, no subagent ("light") | 12.1% of turns, but 0.5% of all tokens, 1.1% of billable tokens (cache reads excluded), 0.3% of output tokens. 102 had no tools at all. | Do not build. Routing them elsewhere would save about 1% at best, and the rule has to be right every time or quality drops. |
| B6 web search migration | WebSearch, WebFetch and browser tool use | 21 calls of 6,148 (0.34%): 17 WebSearch, 4 WebFetch. 58 KB of 47 MB of tool results (0.12%). | Do not build the search mod now. Nothing to save. Obscura stays an opt-in external (registered, hash-pinned, credited) in case page reads grow. |
| B7 command consolidation | Always-on cost of the 40 command descriptions and hints | 5,720 characters, about 2,100 tokens if every command were installed (a default install has fewer). Merging four toggle commands would save about 200 tokens per session. | Do not merge. A saving this small is invisible next to millions of cached tokens per session, and merged modes cost clarity. |
| B8 compaction in api mode | Compactions and session length in real transcripts | 6 compactions in 47 sessions (1 session). Median 183 assistant messages, p90 703, max 1,012. No api-mode transcripts to learn from. | Do not build a compaction scheme. It is rare here. Revisit if `feature-usage` logs show api-mode sessions compacting often; the test would be the 10/50/100-turn scored run on the router. |

Reproduce: the classifier reads `~/.claude/projects/*/*.jsonl`, groups assistant messages into turns between real user prompts, and sums `usage` fields. Throwaway scripts, not shipped (they read private transcripts).

What did ship from the same plan, because it fixed real failures rather than saving tokens: the `/api-mode` switch-back fix, the PowerShell-safe command launcher, the installer protocol-file and exit-code fixes, the external-tools registry and the credits.
