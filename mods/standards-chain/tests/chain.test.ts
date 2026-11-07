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
  for (const p of ['README.md', 'src/a.py', 'package.json', 'coding-standards/css-standards.md', 'node_modules/x/a.js', 'dist/a.css', 'handover/a.js', 'project-context/a.js', 'public/app.min.js', '.claude/x.js', 'src/a.php']) {
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
function host(on: any, files: Record<string, string> = { 'coding-standards/index.md': '# idx', 'coding-standards/css-standards.md': '#', 'coding-standards/css-standards/component-files.md': '#' }) {
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

// ---- company standards (coding-standards/company/INDEX.md, written by install-kit) ----
test('company: the index joins the chain, and other UI file types owe it too', () => {
  expect(chainFor('src/a.css', { company: true })!.files).toEqual(['index.md', 'css-standards.md', 'company/INDEX.md'])
  expect(chainFor('app/views/home.blade.php', { company: true })!.files).toEqual(['company/INDEX.md'])
  expect(chainFor('lib/a.dart', { company: true })!.files).toEqual(['ui-standards.md', 'ui-standards/mobile.md', 'company/INDEX.md'])
  expect(chainFor('app/views/home.blade.php', {})).toBeNull() // without a company index nothing changes
})

test('company: a default the company replaced is not demanded, the index is', async ($, on) => {
  host(on, { 'coding-standards/index.md': '#', 'coding-standards/company/INDEX.md': '#' }) // css-standards.md is gone from disk
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const d = await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })
  expect(d.deny).toContain('coding-standards/company/INDEX.md')
  expect(d.deny).not.toContain('css-standards.md')
})

test('company-only install (no index.md at all) still gates on the company index', async ($, on) => {
  host(on, { 'coding-standards/company/INDEX.md': '#' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const d = await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })
  expect(d.deny).toContain('coding-standards/company/INDEX.md')
  expect(d.deny).not.toContain('Role not clear')
  await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/company/INDEX.md' })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.css', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

// ---- ui-standards: element partials routed by path keyword ----
test('ui: the path names the element, the chain adds the routing file and that partial', () => {
  const f = (p: string) => chainFor(p)!.files
  expect(f('src/components/Button/button.css')).toEqual(['index.md', 'css-standards.md', 'css-standards/component-files.md', 'ui-standards.md', 'ui-standards/button.md'])
  expect(f('src/components/DataTable.tsx')).toContain('ui-standards/table.md')
  expect(f('src/views/login.html')).toContain('ui-standards/auth.md')
  expect(f('src/styles/modal.scss')).toContain('ui-standards/modal-drawer.md')
  expect(f('src/pages/UserForm.vue')).toContain('ui-standards/forms.md')
})

test('ui: at most two partials, none for a path that names no element, none for non-UI files', () => {
  expect(chainFor('src/components/filter-table-toolbar.tsx')!.files.filter((x) => x.startsWith('ui-standards/')).length).toBe(2)
  expect(chainFor('src/styles/misc.css')!.files).toEqual(['index.md', 'css-standards.md'])
  expect(chainFor('src/lib/auth.ts')!.files.some((x) => x.startsWith('ui-standards'))).toBe(false) // a service, not a UI file
  expect(chainFor('src/components/button.css', { ui: false })!.files.some((x) => x.startsWith('ui-standards'))).toBe(false)
})

test('ui: a project without ui-standards on disk is never asked for it', async ($, on) => {
  host(on) // default fixture has no ui-standards files
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (const f of ['index.md', 'css-standards.md', 'css-standards/component-files.md']) await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/' + f })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/button.css', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('ui: with ui-standards on disk the partial is required, then passes once read', async ($, on) => {
  host(on, { 'coding-standards/index.md': '#', 'coding-standards/css-standards.md': '#', 'coding-standards/css-standards/component-files.md': '#', 'coding-standards/ui-standards.md': '#', 'coding-standards/ui-standards/button.md': '#' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (const f of ['index.md', 'css-standards.md', 'css-standards/component-files.md']) await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/' + f })
  const d = await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/button.css', old_string: 'a', new_string: 'b' })
  expect(d.deny).toContain('coding-standards/ui-standards/button.md')
  for (const f of ['ui-standards.md', 'ui-standards/button.md']) await $.tool.call({ tool: 'Read', file_path: '/work/coding-standards/' + f })
  expect((await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/button.css', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
})

test('ui: pwa and mobile partials route by file kind, and a plain json file is not gated', () => {
  expect(chainFor('public/manifest.webmanifest')!.files).toEqual(['ui-standards.md', 'ui-standards/pwa.md'])
  expect(chainFor('public/sw.js')!.files).toContain('ui-standards/pwa.md')
  expect(chainFor('lib/screens/login_screen.dart')!.files).toEqual(['ui-standards.md', 'ui-standards/mobile.md', 'ui-standards/auth.md'])
  expect(chainFor('ios/App/ProfileView.swift')!.files).toContain('ui-standards/mobile.md')
  expect(chainFor('package.json')).toBeNull()
  expect(chainFor('config/data.json')).toBeNull()
  expect(chainFor('public/manifest.json', { ui: false })).toBeNull()
})

test('ui: a React Native or hybrid file reaches the mobile partial by a path keyword', () => {
  expect(chainFor('src/mobile/components/BottomNav.tsx')!.files).toContain('ui-standards/mobile.md')
  expect(chainFor('src/native/Profile.tsx')!.files).toContain('ui-standards/mobile.md')
  expect(chainFor('src/components/Profile.tsx')!.files.some((x) => x.endsWith('mobile.md'))).toBe(false)
})

test('a failing host call while checking the chain never blocks the edit (fails open)', async ($, on) => {
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', () => ({ deny: 'filesystem unavailable' }))
  on('tool.call', () => ({ result: 'ran', text: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Edit', file_path: '/work/src/components/button.css', old_string: 'a', new_string: 'b' })
  expect(r.deny).toBeUndefined()
})

test('ui: shell, form-control and flow partials route by path keyword', () => {
  const f = (p: string) => chainFor(p)!.files
  expect(f('src/components/Sidebar.tsx')).toContain('ui-standards/sidebar.md')
  expect(f('src/components/AppHeader.tsx')).toContain('ui-standards/header.md')
  expect(f('src/layouts/PageHeader.vue')).toContain('ui-standards/page-header.md')
  expect(f('src/components/Breadcrumb.tsx')).toContain('ui-standards/nav.md')
  expect(f('src/components/PinnedPages.tsx')).toContain('ui-standards/sidebar.ref.md')
  expect(f('src/components/Flyout.tsx')).toContain('ui-standards/nav.ref.md')
  expect(f('src/components/Stepper.tsx')).toContain('ui-standards/stepper.md')
  expect(f('src/components/MultiSelect.tsx')).toContain('ui-standards/select.md')
  expect(f('src/components/DatePicker.tsx')).toContain('ui-standards/date.md')
  expect(f('src/components/TextInput.tsx')).toContain('ui-standards/fields.md')
  expect(f('src/components/Image.tsx')).toContain('ui-standards/image.md')
  expect(f('src/components/FileUpload.tsx')).toContain('ui-standards/upload.md')
  expect(f('src/components/ThemeCustomizer.tsx')).toContain('ui-standards/customizer.md')
  expect(f('src/styles/tokens.css').some((x) => x.startsWith('ui-standards'))).toBe(false) // token files keep the css role only
})

test('ui: sign-in pages also read the field rules; plural page names are list pages', () => {
  const ui = (p: string) => chainFor(p)!.files.filter((x) => x.startsWith('ui-standards/')).map((x) => x.slice(13))
  expect(ui('src/pages/signin.html')).toEqual(['auth.md', 'fields.md'])
  expect(ui('src/pages/invoices.html')).toEqual(['table.md'])
  expect(ui('src/views/purchase-orders.html')).toEqual(['table.md'])
  expect(ui('src/pages/settings.html')).toEqual([])
  expect(ui('src/pages/status.html')).toEqual([])
  expect(ui('src/pages/address.html')).toEqual([])
  expect(ui('src/lib/invoices.html')).toEqual([]) // not a page folder
  expect(ui('src/pages/login-form.html')).toEqual(['auth.md', 'forms.md']) // a form already reads forms, so no fields added
})

test('ui: theming and landing partials route by path keyword', () => {
  expect(chainFor('src/styles/dark-mode.css')!.files).toContain('ui-standards/theming.md')
  expect(chainFor('src/components/ThemeToggle.tsx')!.files).toContain('ui-standards/theming.md')
  expect(chainFor('src/pages/landing/Hero.tsx')!.files).toContain('ui-standards/landing.md')
  expect(chainFor('src/pages/pricing.html')!.files).toContain('ui-standards/landing.md')
  expect(chainFor('src/components/Card.tsx')!.files.some((x) => x.endsWith('theming.md') || x.endsWith('landing.md'))).toBe(false)
})
