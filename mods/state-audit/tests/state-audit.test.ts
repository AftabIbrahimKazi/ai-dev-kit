import { expect, test } from 'claude-code/testing'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
const FAIL_OUT = 'FAIL src/a.tsx:3  bool-flags  isLoading, isError, isSuccess\n     impossible: { isLoading: true, isSuccess: true }\n     fix: one state variable'

function world(on: any, opts: { engine?: boolean; scanExit?: number; scanOut?: string; config?: string; backends?: string; reviewerExit?: number; reviewerOut?: string; throwRun?: boolean; result?: any } = {}) {
  const runs: string[][] = []
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => {
    const p = norm(e.path)
    if (p.endsWith('.claude/ai-backends.json')) return { value: opts.backends !== undefined }
    if (p.endsWith('.claude/state-audit.json')) return { value: opts.config !== undefined }
    return { value: opts.engine !== false && /(implicit-state-audit\/(scan\.js|ask\.txt)|plan-first\/reviewer\.js)$/.test(p) }
  })
  on('fs.read', (_$: any, e: any) => ({ value: (norm(e.path).endsWith('ai-backends.json') ? opts.backends : opts.config) ?? '' }))
  on('process.run', (_$: any, e: any) => {
    runs.push([...e.argv])
    if (opts.throwRun) return { deny: 'cannot start' }
    const isReviewer = e.argv.some((a: string) => norm(a).endsWith('reviewer.js'))
    return { value: { exitCode: isReviewer ? opts.reviewerExit ?? 0 : opts.scanExit ?? 0, stdout: isReviewer ? opts.reviewerOut ?? '' : opts.scanOut ?? '', stderr: '' } }
  })
  on('tool.call', () => opts.result ?? { result: 'edited', text: 'edited' })
  return runs
}
const edit = ($: any, file = 'src/a.tsx') => $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })

test('a clean file adds nothing and runs only the scan', async ($, on) => {
  const runs = world(on, { scanExit: 0, scanOut: '' })
  const r = await edit($)
  expect(r.context).toBeUndefined()
  expect(runs.length).toBe(1)
  expect(runs[0]).toContain('--hook')
  expect(runs[0]).toContain('src/a.tsx')
})

test('a FAIL is added once as a reminder that blocks "done", the tool result untouched', async ($, on) => {
  world(on, { scanExit: 1, scanOut: FAIL_OUT })
  const r = await edit($)
  expect(r.text).toBe('edited')
  expect(r.context.length).toBe(1)
  expect(r.context[0]).toContain('impossible states')
  expect(r.context[0]).toContain('do not report the task done')
  expect(r.context[0]).toContain('isLoading')
})

test('a WARN is softer: fix it or say why it is acceptable', async ($, on) => {
  world(on, { scanExit: 1, scanOut: 'WARN src/a.tsx:3  bool-flags  isOpen, isReady, isMapOn' })
  const r = await edit($)
  expect(r.context[0]).toContain('false alarm')
  expect(r.context[0]).not.toContain('do not report')
})

test('non-code files, other tools and handover/ are never scanned', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT })
  await edit($, 'docs/a.md')
  await edit($, 'handover/x.js')
  await $.tool.call({ tool: 'Read', file_path: 'src/a.tsx' })
  expect(runs.length).toBe(0)
})

test('default reviewer is static: a flagged file does not start the reviewer', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT })
  await edit($)
  expect(runs.length).toBe(1)
})

test('reviewer "ollama" is asked only for a flagged file, and its findings are appended', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, config: '{"reviewer":"ollama"}', reviewerExit: 1, reviewerOut: 'FAIL (ollama)\nsrc/a.tsx 3 flags overlap' })
  const r = await edit($)
  expect(runs.length).toBe(2)
  expect(r.context[0]).toContain('Second reviewer')
  expect(r.context[0]).toContain('flags overlap')
})

test('reviewer set but the file is clean: no reviewer call, no tokens', async ($, on) => {
  const runs = world(on, { scanExit: 0, config: '{"reviewer":"auto"}' })
  const r = await edit($)
  expect(runs.length).toBe(1)
  expect(r.context).toBeUndefined()
})

test('a reviewer that finds nothing (down, or PASS) leaves only the scan findings', async ($, on) => {
  world(on, { scanExit: 1, scanOut: FAIL_OUT, config: '{"reviewer":"auto"}', reviewerExit: 0, reviewerOut: '' })
  const r = await edit($)
  expect(r.context[0]).not.toContain('Second reviewer')
})

test('ai-backends "code" plus a model: the scan runs first, the model reads only the flagged file', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, backends: '{"review":["code","unified"]}', reviewerExit: 1, reviewerOut: 'FAIL (unified)\nflags overlap' })
  const r = await edit($)
  expect(runs.length).toBe(2)
  expect(runs[0]).toContain('--hook')
  expect(r.context[0]).toContain('Second reviewer')
})

test('ai-backends "code" plus a model, clean file: no model call', async ($, on) => {
  const runs = world(on, { scanExit: 0, backends: '{"review":["code","kaggle"]}' })
  await edit($)
  expect(runs.length).toBe(1)
})

test('ai-backends with only models: the scan is skipped and the model reads the edited file', async ($, on) => {
  const runs = world(on, { backends: '{"review":["ollama"]}', reviewerExit: 1, reviewerOut: 'WARN (ollama)\nindependent flags' })
  const r = await edit($)
  expect(runs.length).toBe(1)
  expect(runs[0].some((a: string) => norm(a).endsWith('reviewer.js'))).toBe(true)
  expect(r.context[0]).toContain('independent flags')
})

test('ai-backends with only models and nothing found: no context, no tokens', async ($, on) => {
  const runs = world(on, { backends: '{"review":["unified"]}', reviewerExit: 0, reviewerOut: '' })
  const r = await edit($)
  expect(runs.length).toBe(1)
  expect(r.context).toBeUndefined()
})

test('ai-backends "code" alone: the scan only, never a model', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, backends: '{"review":["code"]}', reviewerExit: 1, reviewerOut: 'FAIL x' })
  await edit($)
  expect(runs.length).toBe(1)
})

test('ai-backends with an empty list: the scan only', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, backends: '{"review":[]}', reviewerExit: 1, reviewerOut: 'FAIL x' })
  await edit($)
  expect(runs.length).toBe(1)
})

test('ai-backends with no review key: the scan only', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, backends: '{}', reviewerExit: 1, reviewerOut: 'FAIL x' })
  await edit($)
  expect(runs.length).toBe(1)
})

test('ai-backends wins over an old state-audit.json reviewer', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, config: '{"reviewer":"ollama"}', backends: '{"review":["code"]}', reviewerExit: 1, reviewerOut: 'FAIL x' })
  await edit($)
  expect(runs.length).toBe(1)
})

test('without the engine the result is returned as is', async ($, on) => {
  world(on, { engine: false })
  expect((await edit($)).context).toBeUndefined()
})

test('a broken config means static: the scan findings still arrive', async ($, on) => {
  world(on, { scanExit: 1, scanOut: FAIL_OUT, config: '{not json' })
  expect((await edit($)).context.length).toBe(1)
})

test('a process that cannot start fails open', async ($, on) => {
  world(on, { throwRun: true })
  const r = await edit($)
  expect(r.text).toBe('edited')
  expect(r.context).toBeUndefined()
})

test('an errored edit is not scanned', async ($, on) => {
  const runs = world(on, { scanExit: 1, scanOut: FAIL_OUT, result: { isError: true, result: 'no match', text: 'no match' } })
  const r = await edit($)
  expect(r.isError).toBe(true)
  expect(runs.length).toBe(0)
})
