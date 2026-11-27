import { expect, test } from 'claude-code/testing'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
type World = { script?: boolean; run?: { exit: number; out: string } }

function world(on: any, w: World) {
  const calls: string[][] = []
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('web-search/cli.js') ? w.script !== false : false }))
  on('process.run', (_$: any, e: any) => {
    calls.push([...e.argv])
    const r = w.run ?? { exit: 0, out: JSON.stringify({ query: 'q', provider: 'parallel', durationMs: 1000, hits: [{ title: 'T', url: 'https://a.com/x', snippet: 'S' }] }) }
    return { value: { exitCode: r.exit, stdout: r.out, stderr: '' } }
  })
  on('tool.call', () => ({ result: { query: 'q', results: ['claude own'], durationSeconds: 1 }, text: 'ok' }))
  return calls
}
const search = ($: any, extra: object = {}) => $.tool.call({ tool: 'WebSearch', query: 'node 24 release', mode: 'standard', ...extra })

test('answers the call itself with the hit list', async ($: any, on: any) => {
  const calls = world(on, {})
  const r = await search($)
  expect(r.result.results[0].content[0].url).toBe('https://a.com/x')
  expect(r.result.searchCount).toBe(1)
  expect(calls.length).toBe(1)
})

test('a sifted digest becomes one text result with the facts inside', async ($: any, on: any) => {
  world(on, { run: { exit: 0, out: JSON.stringify({ query: 'q', provider: 'p', durationMs: 4000, digest: 'Fact one. https://a.com/x', hits: [{ title: 'T', url: 'https://a.com/x', snippet: 'S' }] }) } })
  const r = await search($)
  expect(typeof r.result.results[0]).toBe('string')
  expect(r.result.results[0]).toContain('Fact one. https://a.com/x')
})

test('a cache id adds one line telling the model how to read more, and no id adds nothing', async ($: any, on: any) => {
  world(on, { run: { exit: 0, out: JSON.stringify({ query: 'q', provider: 'p', durationMs: 1000, cacheId: 'ab12cd', hits: [{ title: 'T', url: 'https://a.com/x', snippet: 'S' }] }) } })
  const r = await search($)
  const last = r.result.results[r.result.results.length - 1]
  expect(typeof last).toBe('string')
  expect(last).toContain('ab12cd')
  expect(last).toContain('more ab12cd --hit')
})

test('domain filters are passed to the script', async ($: any, on: any) => {
  const calls = world(on, {})
  await search($, { allowed_domains: ['a.com', 'b.org'], blocked_domains: ['x.com'] })
  expect(calls[0].join(' ')).toContain('--allow a.com,b.org')
  expect(calls[0].join(' ')).toContain('--block x.com')
})

test('script exit 2 falls through to Claude own tool', async ($: any, on: any) => {
  world(on, { run: { exit: 2, out: '' } })
  expect((await search($)).result.results[0]).toBe('claude own')
})

test('script missing falls through without running anything', async ($: any, on: any) => {
  const calls = world(on, { script: false })
  expect((await search($)).result.results[0]).toBe('claude own')
  expect(calls.length).toBe(0)
})

test('an extended (thorough) search is left to Claude', async ($: any, on: any) => {
  const calls = world(on, {})
  expect((await search($, { mode: 'extended' })).result.results[0]).toBe('claude own')
  expect(calls.length).toBe(0)
})

test('empty hits and garbage output fall through', async ($: any, on: any) => {
  world(on, { run: { exit: 0, out: JSON.stringify({ query: 'q', hits: [], durationMs: 1 }) } })
  expect((await search($)).result.results[0]).toBe('claude own')
})
