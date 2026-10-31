import type { Register } from 'claude-code'
import { candidates, note } from './rules'

// A skill's first step is "read learnings.md if it exists". This adds the file to the Skill call's result
// instead, once per skill per session, so the model spends no tool call (and no failed read) on it.
// Reminder-style context only; never blocks; fails open.
const done = new Set<string>()

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    done.clear()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      const skill = String((e as unknown as Record<string, unknown>).skill ?? '').split(':').pop() ?? ''
      if (!skill || done.has(skill)) return ran
      done.add(skill)
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
      for (const f of candidates(skill, home)) {
        if (!(await $.fs.exists(f))) continue
        const n = note(skill, await $.fs.read(f))
        if (!n) return ran
        const prior = 'context' in ran && ran.context ? ran.context : []
        return { ...ran, context: [...prior, n] } as typeof ran
      }
    } catch { /* fail open: a missing or unreadable file changes nothing */ }
    return ran
  }).catch(($, e, next) => next(e))
}
