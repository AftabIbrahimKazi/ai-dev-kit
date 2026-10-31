import type { Register } from 'claude-code'
import {
  boardScope, classify, commandHit, detectRole, filterSearchResult, hiddenNote, hitMessage, noLayers, offTaskFolders,
  parseAiIgnore, pathsToGlobs, unlockKey, type Layers, type RoleCfg,
} from './rules'

// Keeps the AI out of what it should not read, in four layers: .aiignore (always), the active role's
// out-of-lane paths (conflict-roles.json), the current task's scope (/focus, else the role's board row)
// and folders the local Laya model judges clearly unrelated to the prompt. The first touch of an ignored
// path is denied with the reason and the way in; the exact retry goes through (role, scope and Laya
// denials unlock the whole top-level folder). An unscoped Grep/Glob is not denied: ignored files are
// dropped from what it returns. Fails open: if the mod itself breaks, or Laya is absent, the call goes through.
const NAME = 'aiignore-guard'
const MIN_TASK_CHARS = 25 // a shorter prompt is a follow-up: keep the last task's folders
const MAX_DIRS = 12 // CPU Laya scores about 3 candidates a second
const MIN_DIRS = 4
const LAYA_TIMEOUT_MS = 8000
const SKIP_DIRS = /^(node_modules|dist|build|vendor|coverage|out|target|__pycache__|venv)$/i

type Roles = Record<string, RoleCfg>
// Module state: a reload starts it over. Role, focus and Laya's folders are re-detected from the next prompt.
let baseP: Promise<string[]> | null = null
let rolesP: Promise<Roles> | null = null
let role: string | null = null
let focus: string[] | null = null
let board: string[] = []
let off: string[] = []
const warned = new Set<string>()

function baseList($: any): Promise<string[]> {
  // one shared promise: tool calls arrive in parallel, and a "loaded yet?" flag lets the second run before the first finished reading
  baseP ??= (async () => {
    try { return (await $.fs.exists('.aiignore')) ? parseAiIgnore(await $.fs.read('.aiignore')) : [] } catch { return [] }
  })()
  return baseP
}

function rolesConfig($: any): Promise<Roles> {
  rolesP ??= (async () => {
    for (const dir of ['.claude', '.opencode', '.agents']) {
      try {
        const f = `${dir}/conflict-roles.json`
        if (await $.fs.exists(f)) return (JSON.parse(await $.fs.read(f)).roles ?? {}) as Roles
      } catch { /* a broken roles file means no roles */ }
    }
    return {}
  })()
  return rolesP
}

async function layers($: any): Promise<Layers> {
  const roles = await rolesConfig($)
  return {
    base: await baseList($),
    role: role && roles[role]?.out ? pathsToGlobs(roles[role].out as string[]) : [],
    mine: role && roles[role]?.in ? pathsToGlobs(roles[role].in as string[]) : [],
    others: role ? Object.entries(roles).filter(([n]) => n !== role).flatMap(([, c]) => pathsToGlobs(c.in ?? [])) : [],
    scope: focus ?? board,
    off,
  }
}

async function readBoard($: any): Promise<void> {
  board = []
  if (!role) return
  try { if (await $.fs.exists('handover/board.md')) board = boardScope(await $.fs.read('handover/board.md'), role) } catch { /* no board */ }
}

// ---- Laya: which top-level folders are clearly not needed for this prompt (loopback only, never a hosted key) ----
const timeout = (ms: number): Promise<never> => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))

async function layaBase($: any): Promise<string | null> {
  if (await $.env.get('SYSTEM1_API_KEY')) return null // a hosted provider is configured instead
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const laya = (await $.env.get('LAYA_HOME')) || `${home}/.ai-dev-kit/laya`
  const base = (await $.env.get('SYSTEM1_BASE_URL')) || ((await $.fs.exists(`${laya}/venv`)) ? `http://127.0.0.1:${(await $.env.get('LAYA_PORT')) || '8000'}` : null)
  if (!base) return null
  let url: URL
  try { url = new URL(base) } catch { return null }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null // host checked in code, not trusted from the env var
  return base.replace(/\/+$/, '')
}

async function refreshOff($: any, task: string, current: Layers): Promise<void> {
  const base = await layaBase($)
  if (!base) return
  const health: any = await Promise.race([$.http.fetch(`${base}/health`), timeout(800)])
  if (!health.ok) return
  const dirs: { name: string; hint: string }[] = []
  for (const e of (await $.fs.list('.')) as { name: string; kind: string }[]) {
    if (e.kind !== 'dir' || e.name.startsWith('.') || SKIP_DIRS.test(e.name) || e.name === 'handover') continue
    if (classify(e.name, '', { ...current, scope: [], off: [] }, true)) continue // already ignored by a firmer layer
    const inside = ((await $.fs.list(e.name)) as { name: string }[]).slice(0, 6).map((x) => x.name).join(', ')
    dirs.push({ name: e.name, hint: inside })
    if (dirs.length >= MAX_DIRS) break
  }
  if (dirs.length < MIN_DIRS) { off = []; return }
  const states = dirs.map((d) => `Task: ${task.slice(0, 1500)}. Candidate folder: ${d.name}/ (contains: ${d.hint})`)
  const questions = { q: { type: 'noul', instructions: 'Does the candidate folder need to be read or changed to complete the task?' } }
  const r: any = await Promise.race([
    $.http.fetch(`${base}/v1/systemone/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ states, questions }) }),
    timeout(LAYA_TIMEOUT_MS),
  ])
  if (!r.ok) return
  const results = JSON.parse(r.text)?.results
  if (!Array.isArray(results) || results.length !== dirs.length) return
  off = offTaskFolders(dirs.map((d) => d.name), results)
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    baseP = rolesP = null // re-read the files on each session start and reload
    role = focus = null
    board = []
    off = []
    warned.clear()
    try {
      await $.command.register({ name: 'focus', description: 'Limit this session to some paths: /focus src/styles api/routes   (/focus off clears, /focus shows)' })
      const wanted = await $.env.get('AI_ROLE') // a session can also be started with its role set
      const names = Object.keys(await rolesConfig($))
      role = names.find((n) => n.toLowerCase() === String(wanted ?? '').toLowerCase()) ?? null
      await readBoard($)
    } catch { /* the layers beyond .aiignore are optional */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // /focus: an explicit task scope, the firmest source. Paths outside it are denied once, then the retry goes through.
  on('command.run', { command: 'focus' }, async ($, e) => {
    const raw = (Array.isArray((e as any).args) ? (e as any).args.join(' ') : String((e as any).args ?? '')).trim()
    if (raw === '' ) return { text: focus ? `focus: ${focus.join(', ')}` : board.length ? `no /focus set; using the ${role} board row: ${board.join(', ')}` : 'no focus set' }
    if (/^(off|clear|none)$/i.test(raw)) { focus = null; warned.clear(); return { text: 'focus cleared' } }
    focus = pathsToGlobs(raw.split(/[\s,]+/))
    warned.clear()
    return { text: `focus: ${focus.join(', ')}. Anything outside it is denied once, and the exact retry goes through.` }
  })

  // A new prompt: pick up a role it names, refresh the role's board row, and let Laya mark unrelated folders for this task.
  on('prompt.submit', async ($, e, next) => {
    try {
      if (!e.command) {
        const names = Object.keys(await rolesConfig($))
        const found = detectRole(e.text, names)
        if (found && found !== role) { role = found; warned.clear() }
        await readBoard($)
        if (e.text.trim().length >= MIN_TASK_CHARS) await refreshOff($, e.text, await layers($))
      }
    } catch { off = [] /* Laya or a file was unavailable: the other layers still apply */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A shell command that names a path the .aiignore or role layer excludes.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const L = await layers($)
    const hit = commandHit(e.command, (await $.session.cwd()) as string, L)
    if (!hit) return next(e)
    const key = unlockKey(hit, 'command')
    if (warned.has(key)) return next(e)
    warned.add(key)
    return { deny: `${NAME}: ${hitMessage(hit, 'command')}` }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Read', 'Edit', 'Write', 'NotebookEdit', 'Grep', 'Glob'] }, async ($, e, next) => {
    const a = e as unknown as Record<string, unknown>
    const isSearch = e.tool === 'Grep' || e.tool === 'Glob'
    const path = String(isSearch ? a.path ?? '' : a.file_path ?? a.notebook_path ?? '')
    const L = await layers($)
    const cwd = (await $.session.cwd()) as string

    let unlocked = false
    const hit = path ? classify(path, cwd, L, isSearch) : null
    if (hit) {
      const key = unlockKey(hit, 'path')
      if (!warned.has(key)) {
        warned.add(key)
        return { deny: `${NAME}: ${hitMessage(hit, 'path')}` }
      }
      unlocked = true // the second try: a real snag, let it through
    }
    if (!isSearch || unlocked) return next(e)

    // A search that names no excluded path: let it run, then drop ignored and out-of-role files from what it found.
    // The scope and Laya layers only deny direct touches: a search is how the model finds what is in scope.
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      if (!('result' in ran)) return ran
      const firm: Layers = { ...L, scope: [], off: [] }
      const { result, hidden } = filterSearchResult(ran.result as any, cwd, (p) => classify(p, cwd, firm) !== null)
      if (!hidden) return ran
      const prior = 'context' in ran && ran.context ? ran.context : []
      // Not the object core gave back: its text and ref describe the unfiltered result.
      return { result, context: [...prior, hiddenNote(hidden)] } as unknown as typeof ran
    } catch {
      return ran // a filtering problem must never turn a good search into an error
    }
  }).catch(($, e, next) => next(e))
}
