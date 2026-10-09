import type { Register } from 'claude-code'
import { chainFor, declaredStd, denyMessage, missing, norm, relTo, type Config, type Std } from './rules'

// Gate: the first Edit/Write of a file is denied until the model has Read that file's coding-standards chain
// (index, discipline file, role partial when the path shows the role, framework file). Does nothing when the
// project has no coding-standards/ folder. Deliberate deny; fails open on its own errors. Never touches handover/.
type Project = { cwd: string; cfg: Config; declared?: Std; active: boolean }
let project: Project | null = null
const reads = new Map<string, Set<string>>() // who read what: 'main' or a subagent id

async function load($: any): Promise<Project> {
  if (project) return project
  const cwd = norm(await $.session.cwd())
  let cfg: Config = {}
  try {
    if (await $.fs.exists('.claude/standards-chain.json')) cfg = JSON.parse(await $.fs.read('.claude/standards-chain.json')) as Config
  } catch {
    cfg = {} // a broken config file leaves the defaults
  }
  const dir = norm(cfg.dir ?? 'coding-standards')
  let declared: Std | undefined
  if (cfg.script === undefined) {
    for (const f of ['CLAUDE.md', 'AGENTS.md']) {
      try {
        if (await $.fs.exists(f)) declared = declaredStd(await $.fs.read(f)) ?? declared
      } catch { /* an unreadable protocol file just means no declaration */ }
    }
  }
  project = { cwd, cfg, declared, active: cfg.mode !== 'off' && (await $.fs.exists(`${dir}/index.md`)) }
  return project
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    project = null // re-read config and declaration on each session start and reload
    reads.clear()
    return next(e)
  }).catch(($, e, next) => next(e))

  // After a compaction the standards text has left the context, so the chain must be read again.
  // `precompute` only prepares a summary (a later trigger applies it), and a skip changes nothing.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.trigger !== 'precompute' && !('skip' in r && r.skip)) reads.delete(e.agentId ? String(e.agentId) : 'main')
    } catch { /* fail open */ }
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      const p = norm(e.file_path)
      if (!/\.md$/i.test(p)) return ran
      const who = 'agentId' in e && e.agentId ? String(e.agentId) : 'main'
      const pr = await load($)
      const abs = /^([a-z]:)?\//i.test(p) ? p : `${pr.cwd}/${p.replace(/^\.\//, '')}`
      if (!reads.has(who)) reads.set(who, new Set())
      reads.get(who)!.add(abs)
    } catch { /* tracking must never touch the read */ }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    try {
      const pr = await load($)
      if (!pr.active) return next(e)
      const rel = relTo(pr.cwd, e.file_path)
      const chain = rel ? chainFor(rel, pr.cfg, pr.declared) : null
      if (!rel || !chain) return next(e)
      const who = 'agentId' in e && e.agentId ? String(e.agentId) : 'main'
      const todo = missing(chain.files, reads.get(who) ?? [], pr.cfg)
      if (todo.length) return { deny: denyMessage(rel, chain, todo, pr.cfg) }
    } catch {
      return next(e) // a broken gate must not block unrelated work
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
