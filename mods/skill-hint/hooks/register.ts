import type { Register } from 'claude-code'
import { DEFAULT_RULES, hintFor, mergeRules, type Manifest, type Rules } from './match'

// Hint only. On each typed prompt, matches keywords (code, no model call) and attaches one line naming skills that may apply.
// It never loads, archives or restores anything, and says nothing for slash commands or for a skill already hinted this session.
// Fails open: any read problem means no hint.
let seen = new Set<string>()
let rules: Rules | null = null

async function loadRules($: any): Promise<Rules> {
  if (rules) return rules
  let scope: unknown = null
  try {
    const m = (await readManifest($)) as { skillRoot?: string } | null
    const p = `${m?.skillRoot ?? '.claude/skills'}/skill-scope/triggers.json`
    if (await $.fs.exists(p)) scope = JSON.parse(await $.fs.read(p))
  } catch { /* defaults only */ }
  rules = mergeRules(DEFAULT_RULES, scope)
  return rules
}

async function readManifest($: any): Promise<Manifest | null> {
  try { return (await $.fs.exists('.ai-dev-kit.json')) ? (JSON.parse(await $.fs.read('.ai-dev-kit.json')) as Manifest) : null } catch { return null }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    seen = new Set()
    rules = null
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    try {
      if (!e.command && e.text.trim().length >= 4 && (!e.origin || ['composer', 'bridge', 'sdk'].includes(e.origin.kind))) {
        const line = hintFor(e.text, await loadRules($), await readManifest($), seen)
        if (line) return next({ ...e, context: [...(e.context ?? []), line] })
      }
    } catch { /* fail open */ }
    return next(e)
  }).catch(($, e, next) => next(e))
}
