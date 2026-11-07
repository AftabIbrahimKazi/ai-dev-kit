import type { Register } from 'claude-code'
import { extractGaps, FILE, MAX_FILE, toRows } from './gaps'

// Observer. When a main-loop answer contains "STANDARDS GAP: <what is not covered>", one row goes to .claude/standards-gaps.jsonl, so the
// gaps in the standards pile up where the maintainer can read them. Adds no text to the answer or the context. Fails open; never blocks.
const seen = new Set<string>() // gaps already logged this session

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    seen.clear()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      if (e.agentId || e.reason !== 'answer') return out
      const gaps = extractGaps(e.answer || out.text).filter((g) => !seen.has(g))
      if (!gaps.length) return out
      const now = await $.clock.now()
      const sid = await $.session.id()
      let old = ''
      if (await $.fs.exists(FILE)) old = (await $.fs.read(FILE)) as string
      if (old.length > MAX_FILE) return out // a full log stops growing rather than risk the read limit
      await $.fs.write(FILE, old + toRows(gaps, new Date(now).toISOString(), String(sid)))
      gaps.forEach((g) => seen.add(g))
    } catch { /* a logging problem must never touch the answer */ }
    return out
  }).catch(($, e, next) => next(e))
}
