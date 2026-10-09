import type { Register } from 'claude-code'
import { fresh, noteBash, noteEdit, type State } from './tracker'

// Reminder-only. Watches edits and verification commands in the main loop and nudges once at the
// second failed fix. Fails open; never blocks; never touches handover/.
let state: State = fresh()

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    state = fresh()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      const ok = !('deny' in ran && ran.deny) && !('isError' in ran && ran.isError)
      if (ok && !('agentId' in e && e.agentId)) noteEdit(state, e.file_path)
    } catch { /* tracking must never touch the edit */ }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('agentId' in e && e.agentId) return ran
      const failed = 'isError' in ran && ran.isError === true
      const note = noteBash(state, e.command, failed)
      if (note) {
        const prior = 'context' in ran && ran.context ? ran.context : []
        return { ...ran, context: [...prior, note] } as typeof ran
      }
    } catch { /* fail open */ }
    return ran
  }).catch(($, e, next) => next(e))
}
