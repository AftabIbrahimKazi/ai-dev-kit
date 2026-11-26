import type { Register } from 'claude-code'

// After Edit/Write of UI code, run the implicit-state-audit skill's scan.js on the file and hand the model only the
// findings (as a reminder after the tool result). A clean file adds nothing, so it costs no model tokens.
// The engine is a skill companion; if it is not installed this mod does nothing. If the project asked for a second
// reviewer ("review" in .claude/ai-backends.json: code, ollama, kaggle, unified) and the scan flagged the file, the reviewer is
// asked too. "code" is the free scan; with only models listed, the scan is skipped and the model reads each edited UI file.
// Nothing listed means the scan alone: no model and no network. Files under handover/ are skipped before any process starts.
const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
const inHandover = (p: string) => /(^|\/)handover\//.test(norm(p))
const CODE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/i

async function find($: any, rel: string): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  for (const c of [`.claude/skills/${rel}`, `${home}/.claude/skills/${rel}`]) if (await $.fs.exists(c)) return c
  return null
}

const MODELS = ['ollama', 'kaggle', 'unified']

// What the project allows for the hidden-state review. ai-backends.json wins; an old state-audit.json "reviewer" of
// "ollama" or "auto" still means the local model. Nothing listed is the free scan alone.
async function reviewChoice($: any): Promise<{ scan: boolean; models: string[] }> {
  let want: string[] = []
  try {
    if (await $.fs.exists('.claude/ai-backends.json')) {
      const c = JSON.parse(await $.fs.read('.claude/ai-backends.json'))
      want = Array.isArray(c?.review) ? c.review : []
    } else if (await $.fs.exists('.claude/state-audit.json')) {
      const c = JSON.parse(await $.fs.read('.claude/state-audit.json'))
      want = c && (c.reviewer === 'auto' || c.reviewer === 'ollama') ? ['code', 'ollama'] : []
    }
  } catch {
    want = []
  }
  const models = MODELS.filter((m) => want.includes(m))
  return { scan: want.includes('code') || !models.length, models }
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      if (!CODE.test(e.file_path) || inHandover(e.file_path)) return ran
      const choice = await reviewChoice($)
      let out = ''
      if (choice.scan) {
        const scan = await find($, 'implicit-state-audit/scan.js')
        if (!scan) return ran
        const r = await $.process.run(['node', scan, '--hook', e.file_path], { timeoutMs: 20000 })
        out = r.stdout.trim()
        if (r.exitCode !== 1 || !out) return ran
      }
      let extra = ''
      if (choice.models.length) {
        const reviewer = await find($, 'plan-first/reviewer.js')
        const prompt = await find($, 'implicit-state-audit/ask.txt')
        if (reviewer && prompt) {
          const v = await $.process.run(['node', reviewer, '--prompt', prompt, '--file', e.file_path], { timeoutMs: 90000 })
          if (v.exitCode === 1 && v.stdout.trim()) extra = `\nSecond reviewer:\n${v.stdout.trim()}`
        }
      }
      if (!out) return extra ? { ...ran, context: [...('context' in ran && ran.context ? ran.context : []), `state-audit second reviewer on ${e.file_path}:${extra}`] } as typeof ran : ran
      const head = /^FAIL/m.test(out)
        ? `state-audit found impossible states in ${e.file_path}. Replace the flags with one state variable before any other step; do not report the task done with a FAIL open:\n${out}${extra}`
        : `state-audit found hidden state in ${e.file_path}. Fix it, or say why it is acceptable (independent flags are a false alarm):\n${out}${extra}`
      const prior = 'context' in ran && ran.context ? ran.context : []
      return { ...ran, context: [...prior, head] } as typeof ran
    } catch {
      return ran // an audit problem must never turn a good edit into an error
    }
  }).catch(($, e, next) => next(e))
}
