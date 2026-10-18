import { expect, test } from 'claude-code/testing'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
const LONG = 'line\n'.repeat(500) // well past the 40-line floor; never matched by any noise pattern, so compact.js leaves it unchanged -> savings 0%, no-op

function world(on: any, opts: { engine?: boolean; stdoutOut?: string; stderrOut?: string; exit?: number; result?: any } = {}) {
  const runs: string[] = []
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('session-budget/compact.js') && opts.engine !== false }))
  on('process.run', (_$: any, e: any) => {
    const stdin = e.init?.stdin ?? ''
    runs.push(stdin)
    if (stdin.includes('STDOUT-INPUT')) return { value: { exitCode: opts.exit ?? 0, stdout: (opts.stdoutOut ?? stdin) + '\n', stderr: '' } }
    if (stdin.includes('STDERR-INPUT')) return { value: { exitCode: opts.exit ?? 0, stdout: (opts.stderrOut ?? stdin) + '\n', stderr: '' } }
    return { value: { exitCode: opts.exit ?? 0, stdout: stdin + '\n', stderr: '' } }
  })
  on('tool.call', () => opts.result ?? { result: { stdout: 'STDOUT-INPUT ' + LONG, stderr: '' }, text: 'STDOUT-INPUT ' + LONG })
  return runs
}
const bash = ($: any) => $.tool.call({ tool: 'Bash', command: 'npm test' })

test('a compacted stdout replaces both result.stdout and text', async ($, on) => {
  world(on, { stdoutOut: 'SHORT' })
  const r: any = await bash($)
  expect(r.result.stdout).toBe('SHORT')
  expect(r.text).toBe('SHORT')
})

test('stdout and stderr are compacted independently and rejoined', async ($, on) => {
  world(on, { result: { result: { stdout: 'STDOUT-INPUT ' + LONG, stderr: 'STDERR-INPUT ' + LONG }, text: 'whatever core built' }, stdoutOut: 'OUT', stderrOut: 'ERR' })
  const r: any = await bash($)
  expect(r.result.stdout).toBe('OUT')
  expect(r.result.stderr).toBe('ERR')
  expect(r.text).toBe('OUT\nERR')
})

test('unchanged output (no savings) is left exactly as the tool returned it', async ($, on) => {
  const runs = world(on, {}) // stdin echoed back unchanged by the stub -> compact() is a no-op
  const r: any = await bash($)
  expect(r.result.stdout).toBe('STDOUT-INPUT ' + LONG)
  expect(r.text).toBe('STDOUT-INPUT ' + LONG)
  expect(runs.length).toBe(1) // stderr empty, never sent to the engine
})

test('short output never reaches the engine at all', async ($, on) => {
  const runs = world(on, { result: { result: { stdout: 'ls\na.js\nb.js', stderr: '' }, text: 'ls\na.js\nb.js' } })
  const r: any = await bash($)
  expect(r.result.stdout).toBe('ls\na.js\nb.js')
  expect(runs.length).toBe(0)
})

test('a denied call is returned untouched, no process started', async ($, on) => {
  const runs = world(on, { result: { deny: 'no' } })
  expect((await bash($)).deny).toBe('no')
  expect(runs.length).toBe(0)
})

test('an errored call is returned untouched, no process started', async ($, on) => {
  const runs = world(on, { result: { isError: true, result: 'boom', text: 'boom' } })
  const r: any = await bash($)
  expect(r.isError).toBe(true)
  expect(runs.length).toBe(0)
})

test('a non-Bash/PowerShell result shape (no stdout field) is left alone', async ($, on) => {
  const runs = world(on, { result: { result: 'file contents', text: 'file contents' } })
  const r: any = await bash($)
  expect(r.result).toBe('file contents')
  expect(runs.length).toBe(0)
})

test('without the engine installed the mod does nothing', async ($, on) => {
  const runs = world(on, { engine: false })
  const r: any = await bash($)
  expect(r.result.stdout).toBe('STDOUT-INPUT ' + LONG)
  expect(runs.length).toBe(0)
})

test('a failing process call fails open', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('session-budget/compact.js') }))
  on('process.run', () => ({ deny: 'cannot start' }))
  on('tool.call', () => ({ result: { stdout: 'STDOUT-INPUT ' + LONG, stderr: '' }, text: 'STDOUT-INPUT ' + LONG }))
  const r: any = await bash($)
  expect(r.result.stdout).toBe('STDOUT-INPUT ' + LONG)
})

test('PowerShell calls are compacted the same way', async ($, on) => {
  world(on, { stdoutOut: 'SHORT' })
  const r: any = await $.tool.call({ tool: 'PowerShell', command: 'npm test' })
  expect(r.result.stdout).toBe('SHORT')
})
