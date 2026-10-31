import { expect, test } from 'claude-code/testing'
import { boardScope, classify, commandHit, detectRole, noLayers, offTaskFolders, pathsToGlobs, unlockKey } from '../hooks/rules'

// Role, task-scope and Laya layers: the rules directly, then the hook with the engine's side stubbed.
const L = { ...noLayers(), base: ['vendor/**'], role: ['api/**'], scope: ['src/styles/**', 'package.json'], off: ['docs/**'] }
const layer = (p: string, dir = false) => classify(p, 'C:/proj', L, dir)?.layer ?? null

test('classify: each layer names itself, the firmest first; root files and the way to the scope are never off-scope', () => {
  expect(layer('vendor/x.js')).toBe('ignore')
  expect(layer('api/a.php')).toBe('role')
  expect(layer('src/app.js')).toBe('scope')
  expect(layer('src/styles/a.css')).toBeNull()
  expect(layer('README.md')).toBeNull()
  expect(layer('src', true)).toBeNull()
  expect(layer('lib', true)).toBe('scope')
  expect(classify('docs/a.md', 'C:/proj', { ...noLayers(), off: ['docs/**'] })?.layer).toBe('off')
  expect(classify('x.js', 'C:/proj', noLayers())).toBeNull()
})

test('unlockKey: a role, scope or Laya denial unlocks the whole top-level folder; an ignore denial only that path', () => {
  const k = (p: string) => unlockKey(classify(p, 'C:/proj', L)!, 'path')
  expect(k('api/a.php')).toBe(k('api/deep/b.php'))
  expect(k('src/app.js')).toBe(k('src/other/c.js'))
  expect(k('vendor/a.js')).not.toBe(k('vendor/b.js'))
})

test('detectRole matches only configured names in role-giving phrases', () => {
  const names = ['frontend', 'backend']
  expect(detectRole('ok you are the frontend dev now', names)).toBe('frontend')
  expect(detectRole('Backend session please', names)).toBe('backend')
  expect(detectRole('role: backend', names)).toBe('backend')
  expect(detectRole('/role frontend', names)).toBe('frontend')
  expect(detectRole('fix the frontend css and the backend api', names)).toBeNull()
  expect(detectRole('you are the tester', names)).toBeNull()
})

test('boardScope reads the Files cell of the role row; pathsToGlobs turns folders into folder globs', () => {
  const board = [
    '| Role | Session | Task | Files | Status | Started |',
    '|---|---|---|---|---|---|',
    '| frontend | a1 | t | src/styles, public/logo.png | in-progress | now |',
    '| backend | b2 | t | api/ | in-progress | now |',
  ].join('\n')
  expect(boardScope(board, 'Frontend')).toEqual(['src/styles', 'src/styles/**', 'public/logo.png'])
  expect(boardScope(board, 'backend')).toEqual(['api/**'])
  expect(boardScope(board, 'tester')).toEqual([])
  expect(pathsToGlobs(['./src/', 'lib/*.js', '-', 'n/a'])).toEqual(['src/**', 'lib/*.js'])
})

test('offTaskFolders keeps only folders Laya is confident are not needed', () => {
  const r = (n: number) => ({ answers: { q: { noul: n } } })
  expect(offTaskFolders(['a', 'b', 'c', 'd'], [r(0.1), r(0.45), r(0.9), {}])).toEqual(['a/**'])
})

test('commandHit: .aiignore matches any word; the role layer needs a path-looking word; scope and Laya never apply', () => {
  const h = (c: string) => commandHit(c, 'C:/proj', L)?.layer ?? null
  expect(h('cat vendor/x.js')).toBe('ignore')
  expect(h('cat api/a.php')).toBe('role')
  expect(h('npm run api')).toBeNull()
  expect(h('cat src/app.js')).toBeNull()
  expect(h('cat docs/a.md')).toBeNull()
})

// The engine's side: files by path, env by name, folder listings.
const world = (on: any, files: Record<string, string>, env: Record<string, string> = {}, dirs: Record<string, string[]> = {}) => {
  const arg = (e: any, ...keys: string[]): string => (typeof e === 'string' ? e : keys.map((k) => e?.[k]).find((v) => typeof v === 'string') ?? '')
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('command.register', () => ({ value: { command: 'focus' } }))
  on('env.get', (_: unknown, e: any) => ({ value: env[arg(e, 'name', 'key')] }))
  // the engine resolves a relative path against the project, so a stub matches on the tail of the path it is given
  const slashed = (e: any): string => arg(e, 'path').split(String.fromCharCode(92)).join('/')
  const find = (e: any): string | undefined => { const p = slashed(e); return Object.keys(files).find((k) => p === k || p.endsWith('/' + k)) }
  on('fs.exists', (_: unknown, e: any) => ({ value: find(e) !== undefined }))
  on('fs.read', (_: unknown, e: any) => ({ value: files[find(e) as string] }))
  on('fs.list', (_: unknown, e: any) => {
    const tail = slashed(e).split('/').filter(Boolean).pop() ?? '.'
    const key = dirs[tail] ? tail : '.'
    return { value: (dirs[key] ?? []).map((name) => ({ name, kind: dirs[name] ? 'dir' : 'file', size: 0 })) }
  })
  on('tool.call', () => ({ result: {} }))
}
const start = ($: any) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
const read = (($: any, p: string): Promise<any> => $.tool.call({ tool: 'Read', file_path: p }))
const ROLES = JSON.stringify({ roles: { frontend: { out: ['api/**'] }, backend: { out: ['src/components/**'] } } })

test('hook: a role named in a prompt hides its out-of-lane folders, one denial unlocks the folder', async ($, on) => {
  world(on, { '.claude/conflict-roles.json': ROLES })
  on('prompt.submit', (_: unknown, e: any) => e)
  await start($)
  expect((await read($, 'C:/proj/api/a.php')).deny).toBeUndefined() // no role yet
  await $.prompt.submit({ text: 'you are the frontend dev, fix the header' })
  const first = await read($, 'C:/proj/api/b.php')
  expect(first.deny).toContain('outside the active role')
  expect((await read($, 'C:/proj/api/deep/c.php')).deny).toBeUndefined() // same folder, unlocked by the one denial
  expect((await read($, 'C:/proj/src/app.js')).deny).toBeUndefined()
})

test('hook: /focus limits the task to some paths, /focus off clears it', async ($, on) => {
  world(on, {})
  await start($)
  const run = (args: string) => $.command.run({ command: 'focus', args }) as any
  expect((await run('src/styles')).text).toContain('src/styles')
  expect((await read($, 'C:/proj/src/app.js')).deny).toContain('outside the current task scope')
  expect((await read($, 'C:/proj/src/app.js')).deny).toBeUndefined() // the retry
  expect((await read($, 'C:/proj/src/styles/a.css')).deny).toBeUndefined()
  expect((await read($, 'C:/proj/README.md')).deny).toBeUndefined()
  await run('off')
  expect((await read($, 'C:/proj/lib/x.js')).deny).toBeUndefined()
})

test('hook: without /focus the role board row is the task scope', async ($, on) => {
  const board = [
    '| Role | Session | Task | Files | Status | Started |',
    '|---|---|---|---|---|---|',
    '| frontend | a1 | t | src/styles | in-progress | now |',
  ].join('\n')
  world(on, { '.claude/conflict-roles.json': ROLES, 'handover/board.md': board })
  on('prompt.submit', (_: unknown, e: any) => e)
  await start($)
  await $.prompt.submit({ text: 'frontend session' })
  expect((await read($, 'C:/proj/src/styles/a.css')).deny).toBeUndefined()
  expect((await read($, 'C:/proj/lib/x.js')).deny).toContain('outside the current task scope')
})

test('hook: Laya marks confidently unrelated folders for the prompt', async ($, on) => {
  const dirs = { '.': ['src', 'docs', 'api', 'ui', 'tests'], src: ['a.js'], docs: ['guide.md'], api: ['x.php'], ui: ['b.css'], tests: ['t.js'] }
  world(on, {}, { SYSTEM1_BASE_URL: 'http://127.0.0.1:8000' }, dirs)
  on('prompt.submit', (_: unknown, e: any) => e)
  on('http.fetch', (_: unknown, e: any) => {
    const url = String(typeof e === 'string' ? e : e?.url ?? '')
    if (url.endsWith('/health')) return { value: { ok: true, text: '{}' } }
    const noul = [0.5, 0.05, 0.1, 0.9, 0.5] // src needed, docs and api clearly not, ui needed, tests unsure
    return { value: { ok: true, text: JSON.stringify({ results: noul.map((n) => ({ answers: { q: { noul: n } } })) }) } }
  })
  await start($)
  await $.prompt.submit({ text: 'make the page header sticky on scroll and fix its colour' })
  expect((await read($, 'C:/proj/docs/guide.md')).deny).toContain('unrelated to the current task')
  expect((await read($, 'C:/proj/ui/b.css')).deny).toBeUndefined()
  expect((await read($, 'C:/proj/tests/t.js')).deny).toBeUndefined()
})
