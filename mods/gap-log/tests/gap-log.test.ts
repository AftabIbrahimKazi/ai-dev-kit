import { expect, mock, test } from 'claude-code/testing'
import { extractGaps, toRows } from '../hooks/gaps'

test('it finds each STANDARDS GAP line, cleans markdown, drops repeats and empty ones, and caps the count', () => {
  const text = [
    '[CX] built the page',
    'STANDARDS GAP: no rule for **bulk delete** confirmation',
    'some prose',
    'STANDARDS GAP: no rule for `bulk delete` confirmation',
    'STANDARDS GAP:',
    'STANDARDS GAP: ab',
    ...[1, 2, 3, 4, 5, 6].map((n) => `STANDARDS GAP: gap number ${n}`),
  ].join('\n')
  const gaps = extractGaps(text)
  expect(gaps[0]).toBe('no rule for bulk delete confirmation')
  expect(gaps.length).toBe(5)
  expect(new Set(gaps).size).toBe(5)
  expect(extractGaps('no gap here')).toEqual([])
  expect(extractGaps(undefined)).toEqual([])
  expect(extractGaps('STANDARDS GAP: ' + 'x'.repeat(500))[0].length).toBe(300)
})

test('rows are one JSON object per line', () => {
  const rows = toRows(['a gap', 'another gap'], '2026-11-06T10:00:00.000Z', 's1').trim().split('\n').map((l) => JSON.parse(l))
  expect(rows).toEqual([
    { ts: '2026-11-06T10:00:00.000Z', session: 's1', gap: 'a gap' },
    { ts: '2026-11-06T10:00:00.000Z', session: 's1', gap: 'another gap' },
  ])
})

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')

function world(on: any, files: Map<string, string>, opts: { failWrite?: boolean } = {}) {
  mock.clock(on, { now: Date.UTC(2026, 10, 6, 10, 0, 0) })
  on('session.start', () => ({ cwd: '/work' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.exists', (_$: any, e: any) => ({ value: [...files.keys()].some((k) => norm(e.path).endsWith(norm(k))) }))
  on('fs.read', (_$: any, e: any) => ({ value: [...files.entries()].find(([k]) => norm(e.path).endsWith(norm(k)))?.[1] ?? '' }))
  on('fs.write', (_$: any, e: any) => {
    if (opts.failWrite) return { deny: 'disk full' }
    const existing = [...files.keys()].find((k) => norm(e.path).endsWith(norm(k)))
    files.set(existing ?? norm(e.path), e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: 'shown to the user' }))
}
const done = ($: any, answer: string, extra: object = {}) => $.turn.complete({ turnId: 't1', answer, durationMs: 1, isAborted: false, reason: 'answer', usage, ...extra })
const logged = (files: Map<string, string>) => [...files.values()].flatMap((t) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

test('an answer with a gap writes a row and leaves what the user sees untouched', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files)
  await start($)
  const r = await done($, '[CX] ok\nSTANDARDS GAP: no rule for drag handles on mobile')
  expect(r.text).toBe('shown to the user')
  const rows = logged(files)
  expect(rows.length).toBe(1)
  expect(rows[0].gap).toBe('no rule for drag handles on mobile')
  expect(rows[0].session).toBe('sess-1')
  expect(rows[0].ts).toBe('2026-11-06T10:00:00.000Z')
})

test('the same gap is logged once per session, and rows append to an existing log', async ($, on) => {
  const files = new Map<string, string>([['.claude/standards-gaps.jsonl', '{"ts":"t","session":"old","gap":"older"}\n']])
  world(on, files)
  await start($)
  await done($, 'STANDARDS GAP: a new hole')
  await done($, 'STANDARDS GAP: a new hole')
  expect(logged(files).map((r) => r.gap)).toEqual(['older', 'a new hole'])
})

test('no gap, a sub-agent answer or a non-answer turn writes nothing', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files)
  await start($)
  await done($, 'plain answer')
  await done($, 'STANDARDS GAP: from a sub-agent', { agentId: 'sub-1' })
  await done($, 'STANDARDS GAP: mid-task', { reason: 'tool' })
  expect(files.size).toBe(0)
})

test('a failing write never changes or blocks the answer (fails open)', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files, { failWrite: true })
  await start($)
  const r = await done($, 'STANDARDS GAP: hole')
  expect(r.text).toBe('shown to the user')
})

test('a log past 1 MB stops growing', async ($, on) => {
  const files = new Map<string, string>([['.claude/standards-gaps.jsonl', 'x'.repeat(1_000_001)]])
  world(on, files)
  await start($)
  await done($, 'STANDARDS GAP: hole')
  expect([...files.values()][0].length).toBe(1_000_001)
})
