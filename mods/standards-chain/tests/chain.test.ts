import { expect, test } from 'claude-code/testing'
import { chainFor, declaredStd, missing, relTo } from '../hooks/rules'

const BACK = String.fromCharCode(92)

test('chains: layer 1 always, role partial when the path shows the role', () => {
  expect(chainFor('src/styles/tokens.css')!.files).toEqual(['index.md', 'css-standards.md', 'css-standards/token-files.md'])
  expect(chainFor('src/styles/modal.scss')!.role).toBe('overlay-files')
  expect(chainFor('src/components/Card/card.css')!.role).toBe('component-files')
  expect(chainFor('src/styles/misc.css')!.files).toEqual(['index.md', 'css-standards.md']) // role unclear: layer 1 only
  expect(chainFor('src/layouts/Base.html')!.files).toContain('html-standards/layout-templates.md')
  expect(chainFor('src/pages/about.html')!.role).toBe('page-files')
  expect(chainFor('src/js/AppController.js')!.files).toEqual(['index.md', 'js-standards.md', 'js-standards/controller-files.md'])
  expect(chainFor('src/main.ts')!.files).toEqual(['index.md', 'ts-standards.md', 'ts-standards/entry-files.md'])
  expect(chainFor('src/types.ts')!.role).toBe('type-files')
  expect(chainFor('src/api.d.ts')!.role).toBe('type-files')
  expect(chainFor('src/utils/format.ts')!.role).toBe('utility-files')
})

test('script standard: config beats declaration beats extension; js has no type files', () => {
  expect(chainFor('src/a.js', {}, 'js-and-ts')!.files[1]).toBe('js-and-ts-standards.md')
  expect(chainFor('src/a.ts', { script: 'js-and-ts' }, 'ts')!.files[1]).toBe('js-and-ts-standards.md')
  expect(chainFor('src/types.js', {}, 'js')!.role).toBeNull()
  expect(declaredStd('Use ts-standards here')).toBe('ts')
  expect(declaredStd('Use js-and-ts-standards here')).toBe('js-and-ts')
  expect(declaredStd('js-standards or ts-standards?')).toBeUndefined()
  expect(declaredStd('nothing here')).toBeUndefined()
})

test('framework files: .astro adds astro, config adds more', () => {
  expect(chainFor('src/pages/index.astro')!.files).toContain('frameworks/astro.md')
  expect(chainFor('src/a.css', { frameworks: ['bootstrap'] })!.files).toContain('frameworks/bootstrap.md')
})

test('files without a standard, and exempt folders, have no chain', () => {
  for (const p of ['README.md', 'src/a.py', 'package.json', 'coding-standards/css-standards.md', 'node_modules/x/a.js', 'dist/a.css', 'handover/a.js', 'public/app.min.js', '.claude/x.js', 'src/a.php']) {
    expect(chainFor(p)).toBeNull()
  }
  expect(chainFor('gen/a.css', { ignore: ['gen/**'] })).toBeNull()
  expect(chainFor('std/a.css', { dir: 'std' })).toBeNull()
})

test('missing: matches read paths by folder and name, case and slash insensitive', () => {
  const files = ['index.md', 'css-standards.md']
  expect(missing(files, [])).toEqual(files)
  expect(missing(files, ['C:' + BACK + 'p' + BACK + 'coding-standards' + BACK + 'index.md'])).toEqual(['css-standards.md'])
  expect(missing(files, ['/p/Coding-Standards/INDEX.md', '/p/coding-standards/css-standards.md'])).toEqual([])
  expect(missing(['index.md'], ['/p/other/index.md'])).toEqual(['index.md']) // wrong folder does not count
  expect(missing(['index.md'], ['/p/std/index.md'], { dir: 'std' })).toEqual([])
})

test('relTo: inside, relative, outside', () => {
  expect(relTo('C:' + BACK + 'p', 'C:' + BACK + 'p' + BACK + 'src' + BACK + 'a.css')).toBe('src/a.css')
  expect(relTo('/p', '/p/src/a.css')).toBe('src/a.css')
  expect(relTo('/p', './src/a.css')).toBe('src/a.css')
  expect(relTo('/p', '/other/a.css')).toBeNull()
})

// ---- the hooks, with the host stubbed ----
function host(on: any, files: Record<string, string> = { 'coding-standards/index.md': '# idx' }) {
  const has = (p: string) => Object.keys(files).some((k) => p.split(BACK).join('/').endsWith(k))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', (_$: any, e: any) => ({ value: has(e.path) }))
  on('fs.read', (_$: any, e: any) => ({ value: files[Object.keys(files).find((k) => e.path.split(BACK).join('/').endsWith(k))!] ?? '' }))
  on('tool.call', () => ({ result: 'ran', text: 'ok' }))
}

test('edit is denied until the chain is read, then passes', async ($, on) => {
  host(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const denied = await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/card.css', old_string: 'a', new_string: 'b' })
  expect(denied.deny).toContain('coding-standards/index.md')
  expect(denied.deny).toContain('css-standards/component-files.md')
  for (const f of ['index.md', 'css-standards.md', 'css-standards/component-files.md']) {
    await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/' + f })
  }
  const ok = await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/card.css', old_string: 'a', new_string: 'b' })
  expect(ok.deny).toBeUndefined()
})

test('after a compaction the chain must be read again; a precompute or a skipped compaction changes nothing', async ($, on) => {
  host(on)
  let skip = false
  const msgs = [{ role: 'user', text: 'summary', toolUses: [] }]
  on('session.compact', () => (skip ? { skip: 'vetoed' } : { messages: msgs }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (const f of ['index.md', 'css-standards.md']) await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/' + f })
  const edit = () => $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })
  expect((await edit()).deny).toBeUndefined()
  await $.session.compact({ trigger: 'precompute', messages: msgs })
  expect((await edit()).deny).toBeUndefined()
  skip = true
  await $.session.compact({ trigger: 'manual', messages: msgs })
  expect((await edit()).deny).toBeUndefined()
  skip = false
  await $.session.compact({ trigger: 'auto', messages: msgs })
  expect((await edit()).deny).toContain('coding-standards/index.md')
})

test('only the missing files are listed', async ($, on) => {
  host(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/index.md' })
  const d = await $.tool.call({ tool: 'Write', file_path: '/work/src/a.css', content: 'x' })
  expect(d.deny).toContain('coding-standards/css-standards.md')
  expect(d.deny).not.toContain('coding-standards/index.md,')
  expect(d.deny).toContain('Role not clear')
})

test('files with no standard, and projects without coding-standards/, are never denied', async ($, on) => {
  host(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/README.md', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/coding-standards/css-standards.md', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('engine missing: no coding-standards folder means the mod does nothing', async ($, on) => {
  host(on, {})
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('config: mode off disables; a broken config keeps the defaults', async ($, on) => {
  host(on, { 'coding-standards/index.md': '#', '.claude/standards-chain.json': JSON.stringify({ mode: 'off' }) })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('a broken config file still gates', async ($, on) => {
  host(on, { 'coding-standards/index.md': '#', '.claude/standards-chain.json': '{ not json' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })).deny).toContain('standards-chain')
})
