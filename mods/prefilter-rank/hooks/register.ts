import type { Register } from 'claude-code'

// Automatic half of system1-prefilter's local-Laya path: ranks a Grep/Glob result by relevance to the
// task so the model can skip low-relevance files instead of reading all of them. Loopback-only, by a
// host check in code (never trust SYSTEM1_BASE_URL alone) -- never the hosted provider path, never
// removes a result, only adds a reminder. When Laya is set up but not running, the first qualifying
// Grep/Glob starts it in the background (laya-ctl.js start) and goes unranked; later ones are ranked
// once it is up. Fails open on anything unexpected: a slow or absent Laya costs nothing beyond its own
// short timeout, never blocks the Grep/Glob call itself.
const MIN_CANDIDATES = 5
// Measured 2026-11-20 (10 tasks, 36 scripts, CPU Laya): path + purpose line with a cutoff of top/3 (floor 0.2) put the right file
// in the read-first set 10 of 10 times (average set 10.6 of 36); path only with an absolute 0.5 cutoff did so 2 of 10 times and
// stayed silent in 6 of 10. About 0.58 s per candidate with the purpose line, so the cap is 24 files (about 14 s).
const MAX_RANKED = 24
const HEALTH_TIMEOUT_MS = 800
const RANK_TIMEOUT_MS = 20000
const CUT_FLOOR = 0.2
const CUT_SHARE = 1 / 3
const SCAN_LINES = 200
const PURPOSE_CHARS = 260
const COMMENT = /^\s*(\/\/(?![#@])|\/\*|\*)/
const RESTART_AFTER_MS = 5 * 60 * 1000 // do not respawn a start that is still loading or failed
let lastStartAt = 0

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

async function loopbackBase($: any): Promise<string | null> {
  const key = await $.env.get('SYSTEM1_API_KEY')
  if (key) return null // a hosted provider is configured instead -- never touch it from here
  const base = (await $.env.get('SYSTEM1_BASE_URL')) || ((await layaSetUp($)) ? `http://127.0.0.1:${(await $.env.get('LAYA_PORT')) || '8000'}` : null)
  if (!base) return null
  let url: URL
  try { url = new URL(base) } catch { return null }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null // host checked in code, not trusted from the env var
  return base.replace(/\/+$/, '')
}

async function userHome($: any): Promise<string> {
  return (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
}

// Laya is "set up" when laya-ctl.js setup has built its venv (default location, or LAYA_HOME).
async function layaSetUp($: any): Promise<boolean> {
  const laya = (await $.env.get('LAYA_HOME')) || `${await userHome($)}/.ai-dev-kit/laya`
  return (await $.fs.exists(`${laya}/venv`)) as boolean
}

async function layaCtl($: any): Promise<string | null> {
  const home = await userHome($)
  for (const f of ['.claude/skills/system1-prefilter/laya-ctl.js', `${home}/.claude/skills/system1-prefilter/laya-ctl.js`, 'skills/addons/system1-prefilter.laya-ctl.js']) {
    if (await $.fs.exists(f)) return f
  }
  return null
}

// Fire and forget: laya-ctl start waits for the model to load (up to minutes), so this must not be awaited.
async function startLaya($: any): Promise<void> {
  if (Date.now() - lastStartAt < RESTART_AFTER_MS) return
  const ctl = await layaCtl($)
  if (!ctl || !(await layaSetUp($))) return
  lastStartAt = Date.now()
  try { Promise.resolve($.process.run(['node', ctl, 'start'], { timeoutMs: 600000 })).catch(() => {}) } catch { /* fail open */ }
}

async function isUp($: any, base: string): Promise<boolean> {
  try {
    const r: any = await Promise.race([$.http.fetch(`${base}/health`), timeout(HEALTH_TIMEOUT_MS)])
    return !!r.ok
  } catch { return false }
}

// Mirrors ladder.js's fromLaya()+resolveBoolean() inline -- the hooks module has no Node, so ladder.js
// cannot be required; this is the same handful of comparisons, not new logic.
// Laya's yes-probabilities run low even for the right file, so the cutoff is relative to the best score: read what scores at
// least a third of the top (floor 0.2); a candidate between half that cutoff and the cutoff is borderline, check it directly.
function rank(ids: string[], results: { answers: { q: { noul: number } } }[]) {
  const scores = ids.map((_, i) => results[i]?.answers?.q?.noul)
  const known = scores.filter((s): s is number => typeof s === 'number')
  if (known.length !== ids.length) return { toRead: [] as string[], toReVerify: [] as string[] }
  const cut = Math.max(CUT_FLOOR, Math.max(...known) * CUT_SHARE)
  const toRead = ids.filter((_, i) => (scores[i] as number) >= cut)
  const toReVerify = ids.filter((_, i) => (scores[i] as number) < cut && (scores[i] as number) >= cut / 2)
  return { toRead, toReVerify }
}

async function lastUserTask($: any): Promise<string | null> {
  try {
    const messages = await $.session.messages()
    if (!Array.isArray(messages)) return null
    const last = [...messages].reverse().find((m: any) => m.role === 'user' && typeof m.text === 'string' && m.text.trim())
    return last ? String(last.text).slice(0, 4000) : null
  } catch { return null }
}

// Never name a file .aiignore hides (aiignore-guard may run before or after this mod).
async function withoutIgnored($: any, ids: string[]): Promise<string[]> {
  try {
    if (!(await $.fs.exists('.aiignore'))) return ids
    const lines: string[] = String(await $.fs.read('.aiignore')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    const res = lines.map((l) => l.replace(/^\//, '').replace(/\/$/, '/**')).map((g) => new RegExp('(^|/)' + g
      .replace(/[\\.+^${}()|[\]]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
      .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*') + '$'))
    return ids.filter((id) => { const p = id.split(String.fromCharCode(92)).join('/'); return !res.some((r) => r.test(p)) })
  } catch { return ids }
}

// The first comment block of a code file, or the description or first heading of a markdown file: a small chunk that says what
// the file is for. A file Laya sees only by name ranks far worse than one it sees with this line.
async function purposeOf($: any, id: string): Promise<string> {
  try {
    const lines = String(await $.fs.read(id)).split('\n').slice(0, SCAN_LINES)
    if (/\.mdx?$/i.test(id)) {
      const line = lines.find((l) => /^description:/.test(l)) ?? lines.find((l) => /^#\s/.test(l)) ?? ''
      return line.replace(/^(description:|#)\s*/, '').trim().slice(0, PURPOSE_CHARS)
    }
    let first: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!COMMENT.test(lines[i] ?? '')) continue
      const block: string[] = []
      while (i < lines.length && COMMENT.test(lines[i] ?? '')) block.push(lines[i++] ?? '')
      if (block.length >= 2) { first = block; break }
      if (first.length === 0) first = block
    }
    return first.slice(0, 3).map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*+)\s?/, '').trim()).filter(Boolean).join(' ').slice(0, PURPOSE_CHARS)
  } catch { return '' }
}

async function rankCandidates($: any, base: string, task: string, ids: string[], purposes: string[]) {
  const states = ids.map((id, i) => `Task: ${task}. Candidate file: ${id}${purposes[i] ? ` - ${purposes[i]}` : ''}`)
  const questions = { q: { type: 'noul', instructions: 'Does the candidate file need to be read or changed to complete the task?' } }
  const r: any = await Promise.race([
    $.http.fetch(`${base}/v1/systemone/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ states, questions }) }),
    timeout(RANK_TIMEOUT_MS),
  ])
  if (!r.ok) return null
  const parsed = JSON.parse(r.text)
  if (!Array.isArray(parsed?.results)) return null
  return parsed.results
}

function reminder(toRead: string[], toReVerify: string[], skipped: string[]) {
  const lines = [`prefilter (local Laya): read first (${toRead.length}): ${toRead.join(', ') || 'none'}.`]
  if (skipped.length) lines.push(`${skipped.length} others ranked lower: skip unless they turn out needed.`)
  if (toReVerify.length) lines.push(`Low confidence either way -- don't trust this ranking for these, read/check directly: ${toReVerify.join(', ')}.`)
  lines.push('Ranking only, not a security/correctness judgment -- never skip a file this would normally flag as relevant to a security/auth/payment check.')
  return lines.join('\n')
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Grep', 'Glob'] }, async ($, e, next) => {
    const ran = await next(e)
    try {
      if ('deny' in ran && ran.deny) return ran
      if ('isError' in ran && ran.isError) return ran
      const result = 'result' in ran ? (ran.result as any) : null
      const all: string[] | undefined = result?.filenames
      const ids = Array.isArray(all) ? await withoutIgnored($, all) : all
      if (!Array.isArray(ids) || ids.length < MIN_CANDIDATES || ids.length > MAX_RANKED) return ran

      const base = await loopbackBase($)
      if (!base) return ran
      if (!(await isUp($, base))) {
        await startLaya($) // base is already verified loopback above
        return ran
      }

      const task = await lastUserTask($)
      if (!task) return ran

      const purposes = await Promise.all(ids.map((id) => purposeOf($, id)))
      if (purposes.filter(Boolean).length * 2 < ids.length) return ran // names alone rank too poorly to tell the model to skip anything
      const results = await rankCandidates($, base, task, ids, purposes)
      if (!results || results.length !== ids.length) return ran

      const { toRead, toReVerify } = rank(ids, results)
      if (toRead.length === 0 || toRead.length === ids.length) return ran // nothing to narrow either way
      const skipped = ids.filter((id) => !toRead.includes(id))

      const prior = 'context' in ran && ran.context ? ran.context : []
      return { ...ran, context: [...prior, reminder(toRead, toReVerify, skipped)] } as typeof ran
    } catch {
      return ran // a prefilter problem must never turn a good Grep/Glob result into an error, or block it
    }
  }).catch(($, e, next) => next(e))
}
