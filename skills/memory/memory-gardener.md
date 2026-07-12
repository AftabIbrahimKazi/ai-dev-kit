---
name: memory-gardener
description: Prune and merge learnings.md files, memory-bank, and memory indexes so knowledge compounds without bloat. Trigger on clean/garden/prune skills or memory, or when a learnings.md exceeds ~30 bullets.
---

# Memory Gardener — Keep the Compounding Compounding

Self-improving skills only work if their learnings stay short, true, and deduplicated. Unpruned, a learnings file becomes a per-use context tax full of stale one-offs. This skill is the maintenance pass.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a pruning heuristic that worked, a class of bullet that always turns out stale. Merge instead of duplicating; delete disproven bullets.

## Scope
Glob for every `learnings.md` under the skills directories (`.claude/skills/*/`), the project's `memory-bank/` (INDEX.md + entries — see the `memory-bank` skill), plus the user's persistent memory index if present. Report per-file bullet counts first; garden the files over ~15 bullets or explicitly named.

## Gardening rules — per file
**Merge:** bullets teaching the same lesson in different words become one bullet with the strongest phrasing. Two data points for the same pattern make it a *rule*; note that ("seen 3×").

**Promote:** a lesson that has held up repeatedly stops being a dated anecdote and moves to the top as a standing rule — or, if it's universal enough, gets proposed as an edit to the skill body itself (the highest form of promotion: learning → skill text). Propose body edits, apply on approval.

**Demote/delete:**
- Contradicted by a later bullet → delete the loser, keep the winner with a note.
- One-off tied to a specific bug/file/date with no general pattern after N sessions → delete.
- Facts that were verified stale (old API shapes, prices, versions) → delete or update from current docs — never leave a stale fact because it's "historical".
- Anything the skill body now already says → delete (it's been promoted, the duplicate is a tax).

**Rewrite:** every surviving bullet should be one line, imperative or cause→effect form, understandable without the session that produced it. "Venus counters broke" is dead weight; "IntersectionObserver callbacks fire before layout settles on MPA nav — re-measure in rAF" survives.

## Hard targets
- Post-garden: each learnings file ≤ 15 bullets, each bullet ≤ 2 lines.
- Never delete silently in bulk: show a short before/after summary (merged N, deleted M with one-line reasons, promoted K).
- Memory index (if gardening user memory): one line per entry, no content in the index, entries whose target file no longer exists get removed.

## Cadence
Suggest a garden when any file crosses ~30 bullets, or roughly every 10–15 sessions of active skill use. Gardening is cheap; reading bloat every session is not.
