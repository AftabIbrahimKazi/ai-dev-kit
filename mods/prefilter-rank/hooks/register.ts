import type { Register } from 'claude-code'

// Automatic half of system1-prefilter's local-Laya path: ranks a Grep/Glob result by relevance to the
// task so the model can skip low-relevance files instead of reading all of them. Loopback-only, by a
// host check in code (never trust SYSTEM1_BASE_URL alone) -- never the hosted provider path, never
// removes a result, only adds a reminder. When Laya is set up but not running, the first qualifying
// Grep/Glob starts it in the background (laya-ctl.js start) and goes unranked; later ones are ranked
// once it is up. Fails open on anything unexpected: a slow or absent Laya costs nothing beyond its own
// short timeout, never blocks the Grep/Glob call itself.
const MIN_CANDIDATES = 5
const MAX_CANDIDATES = 40 // Laya's own batch cap (system1-prefilter.prefilter-mcp.js)
const HEALTH_TIMEOUT_MS = 800
const RANK_TIMEOUT_MS = 20000 // CPU Laya scores about 3 candidates a second (measured 17 in 5.4-6.3 s); a 40-candidate batch fits
const CONFIDENCE_FLOOR = 0.7
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
function rank(ids: string[], results: { answers: { q: { noul: number } } }[]) {
  const toRead: string[] = []
  const toReVerify: string[] = []
  ids.forEach((id, i) => {
    const noul = results[i]?.answers?.q?.noul
    if (typeof noul !== 'number') return
    const confidence = Math.max(noul, 1 - noul)
    if (noul >= 0.5) toRead.push(id)
    if (confidence < CONFIDENCE_FLOOR) toReVerify.push(id)
  })
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

async function rankCandidates($: any, base: string, task: string, ids: string[]) {
  const states = ids.map((id) => `Task: ${task}. Candidate file: ${id}`)
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
  if (skipped.length) lines.push(`Lower relevance, skip unless they turn out needed (${skipped.length}): ${skipped.join(', ')}.`)
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
      const ids: string[] | undefined = result?.filenames
      if (!Array.isArray(ids) || ids.length < MIN_CANDIDATES || ids.length > MAX_CANDIDATES) return ran

      const base = await loopbackBase($)
      if (!base) return ran
      if (!(await isUp($, base))) {
        await startLaya($) // base is already verified loopback above
        return ran
      }

      const task = await lastUserTask($)
      if (!task) return ran

      const results = await rankCandidates($, base, task, ids)
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
