import type { Register } from 'claude-code'
import { fresh, noteCall, type State } from './tracker'

// Reminder-only enforcement of plan-first's time-estimate/checkpoint rule: nudges immediately when a
// Bash/PowerShell call is backgrounded, and every 10 minutes of wall-clock task time after the first 5.
// Never blocks, never computes the estimate itself (that stays the model's judgment call, per
// plan-first) -- this only guarantees the reminder fires instead of depending on memory.
let state: State = fresh()

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    state = fresh()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      if ('agentId' in e && e.agentId) return ran // a subagent's own turn, not the main task's clock
      const isBackground = (e.tool === 'Bash' || e.tool === 'PowerShell') && 'run_in_background' in e && e.run_in_background === true
      const now = await $.clock.now()
      const note = noteCall(state, now, isBackground)
      if (note) {
        const prior = 'context' in ran && ran.context ? ran.context : []
        return { ...ran, context: [...prior, note] } as typeof ran
      }
    } catch { /* fail open: a tracking problem must never touch the tool result */ }
    return ran
  }).catch(($, e, next) => next(e))
}
