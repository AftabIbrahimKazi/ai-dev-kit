import { expect, test } from 'claude-code/testing'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
type World = { script?: boolean; run?: { exit: number; out: string } }

function world(on: any, w: World) {
  const calls: string[][] = []
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('web-digest/cli.js') ? w.script !== false : false }))
  on('process.run', (_$: any, e: any) => {
    calls.push([...e.argv])
    const r = w.run ?? { exit: 0, out: JSON.stringify({ url: 'https://example.com/', bytes: 1302, result: 'A reserved example domain.', durationMs: 900 }) }
    return { value: { exitCode: r.exit, stdout: r.out, stderr: '' } }
  })
  on('tool.call', () => ({ result: { bytes: 1, code: 200, codeText: 'OK', result: 'claude own', durationMs: 1, url: 'u' }, text: 'ok' }))
  return calls
}
const fetchCall = ($: any, extra: object = {}) => $.tool.call({ tool: 'WebFetch', url: 'https://example.com/', prompt: 'what is this', ...extra })

test('answers the call itself with the digest', async ($: any, on: any) => {
  const calls = world(on, {})
  const r = await fetchCall($)
  expect(r.result.result).toBe('A reserved example domain.')
  expect(r.result.code).toBe(200)
  expect(calls.length).toBe(1)
})

test('script exit 2 falls through to Claude own tool', async ($: any, on: any) => {
  world(on, { run: { exit: 2, out: '' } })
  expect((await fetchCall($)).result.result).toBe('claude own')
})

test('script missing falls through without running anything', async ($: any, on: any) => {
  const calls = world(on, { script: false })
  expect((await fetchCall($)).result.result).toBe('claude own')
  expect(calls.length).toBe(0)
})

test('garbage output falls through', async ($: any, on: any) => {
  world(on, { run: { exit: 0, out: 'not json' } })
  expect((await fetchCall($)).result.result).toBe('claude own')
})

test('a read-on request with offset is left to Claude', async ($: any, on: any) => {
  const calls = world(on, {})
  expect((await fetchCall($, { offset: 5000 })).result.result).toBe('claude own')
  expect(calls.length).toBe(0)
})
