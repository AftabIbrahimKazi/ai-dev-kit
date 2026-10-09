import type { Register } from 'claude-code'
import { ASK, checkBash, checkPath, type Config } from './rules'

// Deliberate denies for protected files and destructive commands. If the guard itself breaks, the
// call goes through (fails open), so a bug here cannot stop all work. Never touches handover/.
let cfg: Config | null = null

async function config($: any): Promise<Config> {
  if (cfg) return cfg
  cfg = {}
  try {
    if (await $.fs.exists('.claude/guard.json')) cfg = JSON.parse(await $.fs.read('.claude/guard.json')) as Config
  } catch {
    cfg = {} // a broken config file leaves only the built-in rules
  }
  return cfg
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    cfg = null // re-read the config on each session start and reload
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const a = e as unknown as Record<string, unknown>
    const path = String(a.file_path ?? a.notebook_path ?? '')
    const why = path ? checkPath(path, await config($)) : null
    return why ? { deny: `guard: editing ${path} is blocked (${why}).${ASK}` } : next(e)
  }).catch(($, e, next) => next(e))

  // PowerShell too: on Windows the model may run git through it, and a Bash-only guard would be skipped.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const c = await config($)
    let branch: string | undefined
    if ((c.protectedBranches?.length ?? 0) > 0 && /\bpush\b/.test(e.command)) {
      const r = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
      if (r.exitCode === 0) branch = r.stdout.trim()
    }
    const why = checkBash(e.command, c, branch, e.tool === 'PowerShell')
    return why ? { deny: `guard: blocked (${why}).${ASK}` } : next(e)
  }).catch(($, e, next) => next(e))
}
