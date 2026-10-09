import { expect, mock, test } from 'claude-code/testing'

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, model: 'claude-test' }

// Stubs every host call the mod makes; `files` is the fake disk, `written` the paths written.
function stubs(on: any, files: Map<string, string>, opts: { failWrite?: boolean; reads?: { n: number } } = {}) {
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 10, 0, 0) })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'USERPROFILE' ? '/home/u' : undefined }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, percent: 12 }, rateLimits: [], cost: { usd: 0.42 } } }))
  // e.path arrives absolute, with Windows separators on Windows: normalise before comparing
  const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
  on('fs.exists', (_$: any, e: any) => ({ value: [...files.keys()].some((k) => norm(e.path).endsWith(norm(k))) }))
  on('fs.read', (_$: any, e: any) => {
    if (opts.reads) opts.reads.n++
    return { value: [...files.entries()].find(([k]) => norm(e.path).endsWith(norm(k)))?.[1] ?? '' }
  })
  on('fs.write', (_$: any, e: any) => {
    if (opts.failWrite) return { deny: 'disk full' }
    files.set(e.path, e.text)
    return { value: undefined }
  })
}

const rows = (files: Map<string, string>) =>
  [...files.values()].flatMap((t) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l)))

test('a turn writes one row with usage, cost, context and tool sizes', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('tool.call', (_$: any, e: any) => ({ result: 'x', text: e.tool === 'Read' ? 'a'.repeat(4000) : 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const read = await $.tool.call({ tool: 'Read', file_path: 'src/a.ts' })
  expect(read.text).toBe('a'.repeat(4000)) // the mod returns the result untouched
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1500, isAborted: false, reason: 'answer', usage })

  const all = rows(files)
  expect(all.length).toBe(1)
  expect(all[0]).toMatchObject({ v: 1, sid: 'sess-1', turnId: 't1', model: 'claude-test', in: 100, out: 20, cr: 900, cw: 50, ms: 1500, usd: 0.42, ctxPct: 12 })
  expect(all[0].tools).toEqual([{ t: 'Read', k: 'src/a.ts', c: 4000 }, { t: 'Bash', k: 'npm test', c: 2 }])
  expect([...files.keys()][0].split(String.fromCharCode(92)).join('/').endsWith('/home/u/.ai-dev-kit/ledger/2026-10-09-sess-1.jsonl')).toBe(true)
})

test('turns that complete at the same time are both kept', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await Promise.all([
    $.turn.complete({ turnId: 'main-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage }),
    $.turn.complete({ turnId: 'sub-1', agentId: 'agent-a', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage }),
  ])
  expect(rows(files).map((r) => r.turnId).sort()).toEqual(['main-1', 'sub-1'])
})

test('the ledger never reads a file back: after a reload it continues in a new part', async ($, on) => {
  const old = '{"v":1,"turnId":"t0"}\n'
  const files = new Map<string, string>([['/home/u/.ai-dev-kit/ledger/2026-10-09-sess-1.jsonl', old]])
  const reads = { n: 0 }
  stubs(on, files, { reads })
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage })
  expect(reads.n).toBe(0)
  expect(files.get('/home/u/.ai-dev-kit/ledger/2026-10-09-sess-1.jsonl')).toBe(old) // untouched
  const part2 = [...files.keys()].find((k) => k.split(String.fromCharCode(92)).join('/').endsWith('2026-10-09-sess-1.2.jsonl'))
  expect(part2).toBeDefined()
  expect(JSON.parse(files.get(part2!)!.trim()).turnId).toBe('t1')
})

test('a second turn appends and does not repeat the first turn tools', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('tool.call', () => ({ result: 'x', text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  await $.tool.call({ tool: 'Grep', pattern: 'foo' })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage })
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage })

  const all = rows(files)
  expect(all.map((r) => r.turnId)).toEqual(['t1', 't2'])
  expect(all[0].tools.length).toBe(1)
  expect(all[1].tools.length).toBe(0)
})

test('a turn without usage writes nothing', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: true, reason: 'aborted' })
  expect(files.size).toBe(0)
})

test('a failing disk does not break the turn', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files, { failWrite: true })
  on('turn.complete', () => ({ text: 'kept' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage })
  expect(r.text).toBe('kept')
})

test('/budget falls back to the in-memory summary when no report script exists', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer', usage })
  const r = await $.command.run({ command: 'budget', args: '' })
  expect(r.text).toContain('no report script found')
  expect(r.text).toContain('1 turns')
})

test('/budget runs the report script when one exists', async ($, on) => {
  const files = new Map<string, string>([['.claude/skills/session-budget/report.js', '// stub']])
  stubs(on, files)
  on('process.run', (_$: any, e: any) => ({ value: { exitCode: 0, stdout: 'REPORT via ' + e.argv.join(' '), stderr: '' } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.command.run({ command: 'budget', args: '' })
  expect(r.text).toContain('REPORT via node')
  expect(r.text.split(String.fromCharCode(92)).join('/')).toContain('.claude/skills/session-budget/report.js')
  expect(r.text).toContain('--sid sess-1') // this session, not the newest one in the folder
})
