import { expect, test } from 'claude-code/testing'
import { fresh, noteBash, noteEdit, cmdKey } from '../hooks/tracker'

test('the second failed fix triggers one nudge; the first failure and the first retry do not', () => {
  const s = fresh()
  expect(noteBash(s, 'npm test', true)).toBeNull() // first failure
  noteEdit(s, 'src/a.ts')
  expect(noteBash(s, 'npm test', true)).toBeNull() // failed fix 1
  noteEdit(s, 'src/b.ts')
  const note = noteBash(s, 'npm test', true) // failed fix 2
  expect(note).toContain('npm test')
  expect(note).toContain('2 separate fix attempts')
  expect(note).toContain('a.ts, b.ts')
  expect(note).toContain('debug-protocol')
  noteEdit(s, 'src/c.ts')
  expect(noteBash(s, 'npm test', true)).toBeNull() // already nudged once
})

test('re-running without an edit in between is not a fix attempt', () => {
  const s = fresh()
  noteBash(s, 'npm test', true)
  expect(noteBash(s, 'npm test', true)).toBeNull()
  expect(noteBash(s, 'npm test', true)).toBeNull()
  expect(noteBash(s, 'npm test', true)).toBeNull()
})

test('a pass resets the count', () => {
  const s = fresh()
  noteBash(s, 'npm test', true)
  noteEdit(s, 'a.ts'); noteBash(s, 'npm test', true)
  noteEdit(s, 'a.ts'); noteBash(s, 'npm test', false) // fixed
  noteEdit(s, 'a.ts'); expect(noteBash(s, 'npm test', true)).toBeNull()
  noteEdit(s, 'a.ts'); expect(noteBash(s, 'npm test', true)).toBeNull()
})

test('only verification-looking commands count, and commands are tracked separately', () => {
  const s = fresh()
  for (let i = 0; i < 4; i++) { noteEdit(s, 'a.ts'); expect(noteBash(s, 'grep -r foo src', true)).toBeNull() }
  noteBash(s, 'npm test', true)
  noteEdit(s, 'a.ts'); noteBash(s, 'npm run build', true) // different command: its own first failure
  noteEdit(s, 'a.ts'); expect(noteBash(s, 'npm test', true)).toBeNull() // only cycle 1 for npm test
  expect(cmdKey('  NPM   test -- --watch ')).toBe('npm test')
})

test('different npm scripts are different commands; arguments do not split one command', () => {
  const s = fresh()
  expect(noteBash(s, 'npm run lint', true)).toBeNull()
  noteEdit(s, 'a.ts'); expect(noteBash(s, 'npm run test', true)).toBeNull()
  noteEdit(s, 'b.ts'); expect(noteBash(s, 'npm run build', true)).toBeNull() // three scripts, one failure each: no nudge
  expect(cmdKey('npm run test -- --watch')).toBe('npm run test')
  expect(cmdKey('npx vitest run src/a.test.ts')).toBe('npx vitest run')
  expect(cmdKey('python -m pytest -x tests/')).toBe('python -m pytest')
  expect(cmdKey('node scripts/test.js --fast')).toBe('node scripts/test.js')
  expect(cmdKey('cargo test --release')).toBe('cargo test')
})

test('Windows paths are shortened to file names', () => {
  const s = fresh()
  noteBash(s, 'pytest', true)
  noteEdit(s, 'C:' + String.fromCharCode(92) + 'proj' + String.fromCharCode(92) + 'app.py'); noteBash(s, 'pytest', true)
  noteEdit(s, 'C:' + String.fromCharCode(92) + 'proj' + String.fromCharCode(92) + 'util.py')
  expect(noteBash(s, 'pytest', true)).toContain('app.py, util.py')
})

// ---- the hooks, with the host stubbed ----
function host(on: any, results: Array<{ isError?: boolean }>) {
  let i = 0
  on('session.start', () => ({ cwd: '/work' }))
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'Bash' || e.tool === 'PowerShell') { const r = results[i++] ?? {}; return r.isError ? { isError: true, result: 'exit 1', text: 'exit 1' } : { result: 'ok', text: 'ok' } }
    return { result: 'edited', text: 'edited' }
  })
}
const edit = ($: any, f: string) => $.tool.call({ tool: 'Edit', file_path: f, old_string: 'a', new_string: 'b' })
const bash = ($: any, c: string) => $.tool.call({ tool: 'Bash', command: c })

test('the hook adds the reminder to the failing result at the second failed fix only', async ($, on) => {
  host(on, [{ isError: true }, { isError: true }, { isError: true }, { isError: true }])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const first = await bash($, 'npm test')
  await edit($, 'src/a.ts')
  const second = await bash($, 'npm test')
  await edit($, 'src/b.ts')
  const third = await bash($, 'npm test')
  await edit($, 'src/c.ts')
  const fourth = await bash($, 'npm test')
  expect(first.context).toBeUndefined()
  expect(second.context).toBeUndefined()
  expect(third.context[0]).toContain('debug-protocol')
  expect(fourth.context).toBeUndefined()
  expect(third.isError).toBe(true) // the result itself is untouched
})

test('test runs through the PowerShell tool count the same way', async ($, on) => {
  host(on, [{ isError: true }, { isError: true }, { isError: true }])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ps = (c: string) => $.tool.call({ tool: 'PowerShell', command: c })
  await ps('npm test')
  await edit($, 'src/a.ts')
  await ps('npm test')
  await edit($, 'src/b.ts')
  expect((await ps('npm test')).context[0]).toContain('debug-protocol')
})

test('a failed edit is not counted', async ($, on) => {
  let n = 0
  on('tool.call', (_$: any, e: any) => (e.tool === 'Edit' ? { isError: true, result: 'no match', text: 'no match' } : (n++, { isError: true, result: 'x', text: 'x' })))
  await bash($, 'npm test')
  await edit($, 'a.ts')
  const r = await bash($, 'npm test')
  await edit($, 'a.ts')
  const r2 = await bash($, 'npm test')
  expect(r.context).toBeUndefined()
  expect(r2.context).toBeUndefined()
})
