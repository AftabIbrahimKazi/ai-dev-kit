import type { Register } from 'claude-code'

// After Edit/Write, run the pre-merge-gate skill's edit-check.js on the file and hand the model only the
// problems (as a reminder after the tool result). Clean file: adds nothing, so costs no model tokens.
// The engine is a skill companion; if it is not installed this mod does nothing. Files under handover/
// (notes and role-session lane state) are skipped before any process starts: no check applies to them.
const inHandover = (p: string) => /(^|\/)handover\//.test(p.split(String.fromCharCode(92)).join('/'))
async function findEngine($: any): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const candidates = [
    '.claude/skills/pre-merge-gate/edit-check.js',
    `${home}/.claude/skills/pre-merge-gate/edit-check.js`,
    'skills/workflow/pre-merge-gate.edit-check.js',
  ]
  for (const c of candidates) if (await $.fs.exists(c)) return c
  return null
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      if (inHandover(e.file_path)) return ran
      const engine = await findEngine($)
      if (!engine) return ran
      const r = await $.process.run(['node', engine, e.file_path], { timeoutMs: 40000 })
      const out = r.stdout.trim()
      if (r.exitCode !== 1 || !out) return ran
      const prior = 'context' in ran && ran.context ? ran.context : []
      return { ...ran, context: [...prior, `edit-check found problems in ${e.file_path}. Fix them, or say why they are acceptable:\n${out}`] } as typeof ran
    } catch {
      return ran // a checker problem must never turn a good edit into an error
    }
  }).catch(($, e, next) => next(e))
}
