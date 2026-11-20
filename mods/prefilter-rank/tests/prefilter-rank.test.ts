import { expect, test } from 'claude-code/testing'

// A noul answer's "yes" probability per candidate; built in the same order as `ids`.
function world(on: any, opts: {
  baseUrl?: string | null; apiKey?: string | null; up?: boolean; nouls?: number[]; httpFails?: boolean;
  lastUserText?: string | null; result?: any; setUp?: boolean; aiignore?: string; files?: Record<string, string>;
} = {}) {
  const calls: string[] = []
  const states: string[] = []
  ;(calls as any).states = states
  on('env.get', (_$: any, e: any) => {
    if (e.name === 'SYSTEM1_API_KEY') return { value: opts.apiKey ?? undefined }
    if (e.name === 'SYSTEM1_BASE_URL') return { value: opts.baseUrl === undefined ? 'http://127.0.0.1:8000' : (opts.baseUrl ?? undefined) }
    return { value: undefined }
  })
  on('http.fetch', (_$: any, e: any) => {
    calls.push(e.url)
    if (opts.httpFails) throw new Error('network down')
    if (e.url.endsWith('/health')) return { value: { ok: opts.up !== false, status: 200, headers: {}, text: '' } }
    if (e.url.endsWith('/v1/systemone/batch')) {
      const body = JSON.parse(e.init.body)
      states.push(...body.states)
      const results = body.states.map((_: string, i: number) => ({ answers: { q: { noul: (opts.nouls ?? [])[i] ?? 0 } } }))
      return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify({ results }) } }
    }
    return { value: { ok: false, status: 404, headers: {}, text: '' } }
  })
  const started: string[][] = []
  ;(calls as any).started = started
  on('fs.exists', (_$: any, e: any) => { const p = String(e.path).split(String.fromCharCode(92)).join('/'); return { value: (opts.aiignore !== undefined && p.endsWith('/.aiignore')) || (!!opts.setUp && (p.endsWith('/venv') || p.endsWith('laya-ctl.js'))) } })
  on('fs.read', (_$: any, e: any) => {
    const p = String(e.path)
    if (p.endsWith('.aiignore')) return { value: opts.aiignore ?? '' }
    if (!opts.files) return { value: '// Purpose one.\n// Purpose two.\n' }
    const norm = p.split(String.fromCharCode(92)).join('/')
    const key = Object.keys(opts.files).find((k) => norm.endsWith(k))
    return { value: key ? opts.files[key] : '' }
  })
  on('process.run', (_$: any, e: any) => { started.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } })
  on('session.messages', () => ({ value: opts.lastUserText === null ? [] : [{ role: 'user', text: opts.lastUserText ?? 'find the auth bug' }] }))
  on('tool.call', () => opts.result ?? { result: { filenames: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'] }, text: '5 files' })
  return calls
}
const grep = ($: any) => $.tool.call({ tool: 'Grep', pattern: 'auth' })
const glob = ($: any) => $.tool.call({ tool: 'Glob', pattern: '**/*.js' })

test('ranks and adds a read-order reminder when results split high/low confidence', async ($, on) => {
  world(on, { nouls: [0.9, 0.1, 0.85, 0.2, 0.3] })
  const r: any = await grep($)
  expect(r.context).toBeTruthy()
  expect(r.context.length).toBe(1)
  expect(r.context[0]).toContain('a.js')
  expect(r.context[0]).toContain('c.js')
  expect(r.context[0]).toContain('ranked lower')
})

test('Glob is ranked the same way as Grep', async ($, on) => {
  world(on, { nouls: [0.9, 0.1, 0.85, 0.2, 0.3], result: { result: { filenames: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'] }, text: '5 files' } })
  const r: any = await glob($)
  expect(r.context[0]).toContain('a.js')
})

test('low-confidence candidates are flagged for direct re-verification, not trusted either way', async ($, on) => {
  world(on, { nouls: [0.9, 0.2, 0.1, 0.05, 0.95] }) // top 0.95 -> cutoff 0.317; b.js at 0.2 is between half the cutoff and the cutoff
  const r: any = await grep($)
  expect(r.context[0]).toContain("don't trust this ranking")
  expect(r.context[0]).toContain('b.js')
})

test('fewer than 5 candidates: no process started, nothing added', async ($, on) => {
  const calls = world(on, { result: { result: { filenames: ['a.js', 'b.js'] }, text: '2 files' } })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('every candidate ranked the same way (all read or all skip): nothing added, no narrowing to offer', async ($, on) => {
  world(on, { nouls: [0.9, 0.9, 0.9, 0.9, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
})

test('SYSTEM1_API_KEY set (hosted provider configured instead): never contacted', async ($, on) => {
  const calls = world(on, { apiKey: 'sk-something', nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('SYSTEM1_BASE_URL unset: never contacted', async ($, on) => {
  const calls = world(on, { baseUrl: null, nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('a non-loopback SYSTEM1_BASE_URL is refused even though the env var names it', async ($, on) => {
  const calls = world(on, { baseUrl: 'http://evil.example.com:8000', nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('Laya not healthy: the health check runs, the batch call never does', async ($, on) => {
  const calls = world(on, { up: false, nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(1)
  expect(calls[0]).toContain('/health')
})

test('Laya set up but down: starts it once in the background, this Grep goes unranked', async ($, on) => {
  const calls = world(on, { up: false, setUp: true, baseUrl: null, nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect((calls as any).started.length).toBe(1)
  expect((calls as any).started[0][0]).toBe('node')
  expect((calls as any).started[0][2]).toBe('start')
  await grep($)
  expect((calls as any).started.length).toBe(1) // not respawned while it loads
})

test('Laya not set up: never started, nothing contacted when no URL is configured', async ($, on) => {
  const calls = world(on, { up: false, setUp: false, baseUrl: null })
  await grep($)
  expect((calls as any).started.length).toBe(0)
  expect(calls.length).toBe(0)
})

test('Laya set up and up, no URL configured: ranks on the default local port', async ($, on) => {
  const calls = world(on, { setUp: true, baseUrl: null, nouls: [0.9, 0.1, 0.85, 0.2, 0.3] })
  const r: any = await grep($)
  expect(r.context.length).toBe(1)
  expect(calls[0]).toContain('127.0.0.1:8000')
  expect((calls as any).started.length).toBe(0)
})

test('no identifiable last user message: fails open before any http call', async ($, on) => {
  const calls = world(on, { lastUserText: null, nouls: [0.9, 0.1, 0.9, 0.1, 0.9] })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(1) // health check already happened; the task-text check comes after
})

test('a network failure fails open, never turns the Grep/Glob result into an error', async ($, on) => {
  world(on, { httpFails: true })
  const r: any = await grep($)
  expect(r.result.filenames).toEqual(['a.js', 'b.js', 'c.js', 'd.js', 'e.js'])
  expect(r.context).toBeUndefined()
})

test('a denied or errored call is returned untouched, no process started', async ($, on) => {
  const calls = world(on, { result: { deny: 'no' } })
  expect((await grep($)).deny).toBe('no')
  expect(calls.length).toBe(0)
})

test('more than 40 candidates: skipped, not chunked', async ($, on) => {
  const many = Array.from({ length: 41 }, (_, i) => `f${i}.js`)
  const calls = world(on, { result: { result: { filenames: many }, text: '41 files' } })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('files .aiignore hides are never ranked or named in the reminder', async ($, on) => {
  const six = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js']
  world(on, { aiignore: 'b.js', nouls: [0.9, 0.9, 0.1, 0.1, 0.1], result: { result: { filenames: six }, text: '6 files' } })
  const r: any = await grep($)
  expect(r.context[0]).toContain('a.js')
  expect(r.context[0]).not.toContain('b.js')
})

test('each candidate is sent with its purpose line: a comment block for code, the description for markdown', async ($, on) => {
  const calls = world(on, {
    nouls: [0.9, 0.1, 0.1, 0.1, 0.1],
    result: { result: { filenames: ['a.js', 'x.md', 'c.js', 'd.js', 'e.js'] }, text: '5 files' },
    files: { 'a.js': '"use strict";\n// Alpha does one thing.\n// More.\ncode', 'x.md': '---\nname: x\ndescription: Does X\n---\n# X', 'c.js': '// C.\n// C2.', 'd.js': '// D.\n// D2.', 'e.js': '// E.\n// E2.' },
  })
  await grep($)
  const states = (calls as any).states as string[]
  expect(states[0]).toContain('Candidate file: a.js - Alpha does one thing. More.')
  expect(states[1]).toContain('Candidate file: x.md - Does X')
})

test('a relative cutoff reads what scores near the top even when nothing reaches 0.5', async ($, on) => {
  world(on, { nouls: [0.4, 0.35, 0.3, 0.1, 0.05] })
  const r: any = await grep($)
  expect(r.context).toBeTruthy()
  expect(r.context[0]).toContain('a.js, b.js, c.js')
  expect(r.context[0]).toContain('2 others ranked lower')
})

test('more than 24 candidates: not ranked (too slow, and names alone are unreliable)', async ($, on) => {
  const filenames = Array.from({ length: 25 }, (_, i) => `f${i}.js`)
  const calls = world(on, { result: { result: { filenames }, text: '25 files' } })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('most candidates without a purpose line: Laya is not asked, nothing is added', async ($, on) => {
  const calls = world(on, { nouls: [0.9, 0.1, 0.1, 0.1, 0.1], files: {} })
  const r: any = await grep($)
  expect(r.context).toBeUndefined()
  expect(calls.some((c) => c.endsWith('/v1/systemone/batch'))).toBe(false)
})
