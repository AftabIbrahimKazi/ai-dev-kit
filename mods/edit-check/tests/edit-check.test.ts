import { expect, test } from 'claude-code/testing'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')

function world(on: any, opts: { engine?: boolean; exit?: number; out?: string; throwRun?: boolean; result?: any } = {}) {
  const runs: string[][] = []
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('pre-merge-gate/edit-check.js') && opts.engine !== false }))
  on('process.run', (_$: any, e: any) => {
    runs.push([...e.argv])
    if (opts.throwRun) return { deny: 'cannot start' }
    return { value: { exitCode: opts.exit ?? 0, stdout: opts.out ?? '', stderr: '' } }
  })
  on('tool.call', () => opts.result ?? { result: 'edited', text: 'edited' })
  return runs
}
const edit = ($: any, file = 'src/a.css') => $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })

test('a clean file adds nothing to the result', async ($, on) => {
  const runs = world(on, { exit: 0, out: '' })
  const r = await edit($)
  expect(r.context).toBeUndefined()
  expect(runs.length).toBe(1)
  expect(runs[0]).toContain('src/a.css')
})

test('problems are added as a reminder, once, with the engine output', async ($, on) => {
  world(on, { exit: 1, out: 'src/a.css:3  css-14  !important is banned' })
  const r = await edit($)
  expect(r.text).toBe('edited') // the tool result itself is untouched
  expect(r.context.length).toBe(1)
  expect(r.context[0]).toContain('css-14')
  expect(r.context[0]).toContain('src/a.css')
})

test('Write is checked too', async ($, on) => {
  const runs = world(on, { exit: 0 })
  await $.tool.call({ tool: 'Write', file_path: 'src/new.js', content: 'x' })
  expect(runs.length).toBe(1)
})

test('files under handover/ are skipped before any process starts', async ($, on) => {
  const runs = world(on, { exit: 1, out: 'x' })
  for (const f of ['handover/notes.md', 'handover/locks.d/src__a.js/owner', 'C:' + String.fromCharCode(92) + 'p' + String.fromCharCode(92) + 'handover' + String.fromCharCode(92) + 'board.md']) {
    const r = await edit($, f)
    expect(r.context).toBeUndefined()
  }
  expect(runs.length).toBe(0)
  await edit($, 'src/handover-panel.css') // a name that only contains the word is still checked
  expect(runs.length).toBe(1)
})

test('other tools are never checked', async ($, on) => {
  const runs = world(on, { exit: 1, out: 'x' })
  await $.tool.call({ tool: 'Read', file_path: 'src/a.css' })
  expect(runs.length).toBe(0)
})

test('an errored edit is not checked', async ($, on) => {
  const runs = world(on, { exit: 1, out: 'x', result: { isError: true, result: 'no match', text: 'no match' } })
  const r = await edit($)
  expect(r.isError).toBe(true)
  expect(runs.length).toBe(0)
})

test('without the engine, or when the engine cannot start, the edit result is returned as is', async ($, on) => {
  world(on, { engine: false, exit: 1, out: 'x' })
  expect((await edit($)).context).toBeUndefined()
})

test('a failing process call fails open', async ($, on) => {
  world(on, { throwRun: true })
  const r = await edit($)
  expect(r.text).toBe('edited')
  expect(r.context).toBeUndefined()
})
