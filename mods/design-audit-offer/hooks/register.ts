import type { Register } from 'claude-code'
import { fresh, NOTE, noteUiEdit, SOURCES, type State } from './offer'

// Reminder-only. Counts distinct UI files edited in the main loop and, once a design source exists, adds one
// line asking the model to offer a UI/UX audit. Fails open; never blocks; never touches handover/.
let state: State = fresh()

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    state = fresh()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      if ('agentId' in e && e.agentId) return ran
      if (!noteUiEdit(state, e.file_path)) return ran
      let found = false
      for (const f of SOURCES) if (await $.fs.exists(f)) { found = true; break }
      if (!found) return ran
      state.offered = true
      const prior = 'context' in ran && ran.context ? ran.context : []
      return { ...ran, context: [...prior, NOTE] } as typeof ran
    } catch { /* fail open */ }
    return ran
  }).catch(($, e, next) => next(e))
}
