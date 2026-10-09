import type { Register } from 'claude-code'

// One row per turn goes to <home>/.ai-dev-kit/ledger/<YYYY-MM-DD>-<session>.jsonl (then .2.jsonl, ... past 1 MiB).
// The report script (session-budget skill, report.js) reads every .jsonl there; this mod only observes.
// A file per session means parallel sessions never share one; the queue below means this session's own
// writes never race; and the file is never read back, so $.fs.read's 4 MiB limit cannot stop the ledger.
type Call = { t: string; k: string; c: number; e?: 1 }

const pending = new Map<string, Call[]>() // tool calls seen since the last turn.complete, by loop
const totals = { turns: 0, in: 0, out: 0, cr: 0, cw: 0 } // fallback for /budget when no report script is installed
const PART_MAX = 1024 * 1024 // each write rewrites the part file, so keep parts small
const parts = new Map<string, { n: number; text: string }>() // per <date>-<session>: current part and its text
let queue: Promise<void> = Promise.resolve()

const partFile = (dir: string, key: string, n: number) => `${dir}/${key}${n > 1 ? '.' + n : ''}.jsonl`

async function appendRow($: any, dir: string, key: string, line: string): Promise<void> {
  let p = parts.get(key)
  if (!p) {
    let n = 1 // after a reload, continue in a fresh part rather than reading an old one back
    while (await $.fs.exists(partFile(dir, key, n))) n++
    p = { n, text: '' }
    parts.set(key, p)
  }
  if (p.text && p.text.length + line.length > PART_MAX) { p.n += 1; p.text = '' }
  p.text += line
  await $.fs.write(partFile(dir, key, p.n), p.text)
}

const keyOf = (a: Record<string, unknown>): string =>
  String(a.file_path ?? a.pattern ?? a.skill ?? a.name ?? a.command ?? a.url ?? a.query ?? '').slice(0, 120)

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'budget', description: 'Show token use, cost, cache and waste for this session' })
    return next(e)
  }).catch(($, e, next) => next(e))

  // Observe every tool call: record its size, return the result untouched.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const a = e as unknown as Record<string, unknown>
      const loop = String(a.agentId ?? '')
      const call: Call = { t: String(a.tool), k: keyOf(a), c: (ran as { text?: string }).text?.length ?? 0 }
      if ((ran as { isError?: boolean }).isError) call.e = 1
      pending.set(loop, [...(pending.get(loop) ?? []), call])
    } catch {
      // a ledger problem must never touch the tool call
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const loop = e.agentId ?? ''
      const calls = pending.get(loop) ?? []
      pending.delete(loop)
      if (!e.usage) return result
      const u = e.usage
      totals.turns += 1
      totals.in += u.input_tokens
      totals.out += u.output_tokens
      totals.cr += u.cache_read_input_tokens
      totals.cw += u.cache_creation_input_tokens

      const usage = await $.session.usage()
      const now = await $.clock.now()
      const sid = await $.session.id()
      const row = {
        v: 1,
        ts: new Date(now).toISOString(),
        sid,
        turnId: e.turnId,
        ...(e.agentId ? { agentId: e.agentId } : {}),
        model: u.model,
        in: u.input_tokens,
        out: u.output_tokens,
        cr: u.cache_read_input_tokens,
        cw: u.cache_creation_input_tokens,
        ms: e.durationMs,
        usd: usage.cost?.usd ?? null,
        ctxPct: usage.context?.percent ?? null,
        tools: calls,
      }
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
      const key = `${row.ts.slice(0, 10)}-${String(sid).replace(/[^\w-]/g, '')}`
      const job = queue.then(() => appendRow($, `${home}/.ai-dev-kit/ledger`, key, JSON.stringify(row) + '\n'))
      queue = job.catch(() => undefined) // one failed write must not block the next
      await job
    } catch {
      // never let logging break a turn
    }
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'budget' }, async ($) => {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
    const candidates = [
      '.claude/skills/session-budget/report.js',
      `${home}/.claude/skills/session-budget/report.js`,
      'skills/workflow/session-budget.report.js',
    ]
    for (const script of candidates) {
      if (await $.fs.exists(script)) {
        // this session, not whichever session started last (parallel sessions share the ledger folder)
        const r = await $.process.run(['node', script, '--sid', String(await $.session.id())], { timeoutMs: 15000 })
        return { text: r.exitCode === 0 ? r.stdout : `report failed (${r.exitCode}): ${r.stderr || r.stdout}` }
      }
    }
    return {
      text: `no report script found (install the session-budget skill). Since load: ${totals.turns} turns, in ${totals.in}, out ${totals.out}, cache read ${totals.cr}, cache write ${totals.cw}`,
    }
  }).catch(() => ({ text: 'budget-ledger: /budget failed' }))
}
