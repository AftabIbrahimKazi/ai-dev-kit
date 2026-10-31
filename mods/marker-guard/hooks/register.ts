import type { Register } from 'claude-code'
import { notice, PROTOCOL_FILES } from './marker'

// Reporter only. Shows one warning line beneath a main-loop answer that lacks the [CX] marker. Fails open;
// never writes the marker, never blocks, never touches handover/.
let protocol: string | null = null
let compacted = false // set by a real compaction, cleared once the notice has been shown

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    protocol = null
    compacted = false
    try {
      for (const f of PROTOCOL_FILES) if (await $.fs.exists(f)) { protocol = (await $.fs.read(f)) as string; break }
    } catch { /* no protocol file: do nothing */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // `precompute` only prepares a summary (a later trigger applies it), and a skip changes nothing.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.agentId && e.trigger !== 'precompute' && !('skip' in r && r.skip)) compacted = true
    } catch { /* fail open */ }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      if (e.agentId || e.reason !== 'answer') return out
      const shown = notice(protocol, out.text, compacted)
      if (compacted) compacted = false
      if (shown) return { ...out, text: shown } // the host shows a text that differs from the answer beneath it
    } catch { /* fail open */ }
    return out
  }).catch(($, e, next) => next(e))
}
