import type { Register } from 'claude-code'

// The RTK-style half of session-budget: runs its compact.js engine on every Bash/PowerShell result
// before the model reads it, instead of leaving compaction to a skill call the agent may or may not
// make. compact.js already no-ops under 40 lines or under 15% savings, and guarantees every
// failure-looking line survives (its own tested contract) -- this mod adds no new judgment, it just
// makes that engine run on every call instead of an optional one. The engine is a skill companion; if
// it is not installed this mod does nothing.
async function findEngine($: any): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const candidates = [
    '.claude/skills/session-budget/compact.js',
    `${home}/.claude/skills/session-budget/compact.js`,
    'skills/workflow/session-budget.compact.js',
  ]
  for (const c of candidates) if (await $.fs.exists(c)) return c
  return null
}

// compact.js's own floor is 40 lines; skip the process call entirely for text nowhere near that,
// so a short `ls` or `git status` never pays for a round trip it cannot possibly shrink.
const MIN_LEN = 2000

async function shrink($: any, engine: string, text: string): Promise<string | null> {
  if (!text || text.length < MIN_LEN) return null
  const r = await $.process.run(['node', engine], { stdin: text, timeoutMs: 15000 })
  if (r.exitCode !== 0) return null
  const out = r.stdout.endsWith('\n') ? r.stdout.slice(0, -1) : r.stdout
  return out !== text ? out : null
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      const result = 'result' in ran ? (ran.result as any) : null
      if (!result || typeof result.stdout !== 'string') return ran
      const engine = await findEngine($)
      if (!engine) return ran

      const stdout = result.stdout as string
      const stderr = typeof result.stderr === 'string' ? (result.stderr as string) : ''
      const [newStdout, newStderr] = await Promise.all([
        shrink($, engine, stdout),
        stderr ? shrink($, engine, stderr) : Promise.resolve(null),
      ])
      if (newStdout == null && newStderr == null) return ran

      const outStdout = newStdout ?? stdout
      const outStderr = newStderr ?? stderr
      const text = outStdout + (outStderr ? '\n' + outStderr : '')
      return { ...ran, result: { ...result, stdout: outStdout, stderr: outStderr }, text } as typeof ran
    } catch {
      return ran // a compaction problem must never turn a good command result into an error
    }
  }).catch(($, e, next) => next(e))
}
