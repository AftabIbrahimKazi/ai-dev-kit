import type { Register } from 'claude-code'
import { DEFAULT_RULES, hintFor, mergeRules, scriptFor, type Manifest, type Rules } from './match'

// Hint only. On each typed prompt, matches keywords (code, no model call) and attaches one line naming skills that may apply.
// It never loads, archives or restores anything, and says nothing for slash commands or for a skill already hinted this session.
// For the few skills in SCRIPT_RUNS it also runs that skill's read-only script once per session and attaches the table, so
// the facts arrive without a skill load. Fails open: any read or run problem means no hint and no table.
let seen = new Set<string>()
let ran = new Set<string>()
let rules: Rules | null = null
let roleSeen = new Set<string>()
const MAX_TABLE_LINES = 60

async function runScript($: any, text: string, r: Rules, m: Manifest | null): Promise<string | null> {
  const run = scriptFor(text, r, m, ran)
  if (!run) return null
  const file = `${m?.skillRoot ?? '.claude/skills'}/${run.skill}/${run.script}`
  if (!(await $.fs.exists(file))) return null
  const res = await $.process.run(['node', file, ...run.args], { timeoutMs: 30000 })
  const out = String(res.stdout ?? '').trim()
  if (res.exitCode !== 0 || !out) return null
  const lines = out.split('\n')
  const body = lines.length > MAX_TABLE_LINES ? [...lines.slice(0, MAX_TABLE_LINES), `… ${lines.length - MAX_TABLE_LINES} more lines; rerun the script for the rest`].join('\n') : out
  return `${run.header}\n${body}`
}

// Role loadout: skill-scope/role.js names a role the prompt states or implies and prints one line (skills, standards, commands).
// Same cost rule as the hint: once per role per session, nothing for a prompt that names no role.
async function roleLine($: any, text: string, m: Manifest | null): Promise<string | null> {
  const file = `${m?.skillRoot ?? '.claude/skills'}/skill-scope/role.js`
  if (!(await $.fs.exists(file))) return null
  const args = ['resolve']
  if (m?.skills) args.push('--skills', Object.keys(m.skills).join(','))
  if (m?.archived) args.push('--archived', Object.keys(m.archived).join(','))
  const res = await $.process.run(['node', file, ...args, text], { timeoutMs: 5000 })
  const out = String(res.stdout ?? '').trim()
  if (res.exitCode !== 0 || !out) return null
  const key = /role (.+?) \(/.exec(out)?.[1] ?? out
  if (roleSeen.has(key)) return null
  roleSeen.add(key)
  return out
}

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
    ran = new Set()
    roleSeen = new Set()
    rules = null
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    try {
      if (!e.command && e.text.trim().length >= 4 && (!e.origin || ['composer', 'bridge', 'sdk'].includes(e.origin.kind))) {
        const r = await loadRules($)
        const m = await readManifest($)
        const add: string[] = []
        const line = hintFor(e.text, r, m, seen)
        if (line) add.push(line)
        let table: string | null = null
        try { table = await runScript($, e.text, r, m) } catch { /* fail open: the hint line still goes */ }
        if (table) add.push(table)
        try { const rl = await roleLine($, e.text, m); if (rl) add.push(rl) } catch { /* fail open */ }
        if (add.length) return next({ ...e, context: [...(e.context ?? []), ...add] })
      }
    } catch { /* fail open */ }
    return next(e)
  }).catch(($, e, next) => next(e))
}
