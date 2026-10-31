import { expect, test } from 'claude-code/testing'
import { checkCommand, checkIgnored, filterSearchResult, parseAiIgnore, relativeTo } from '../hooks/rules'

const globs = parseAiIgnore(['# generated', '', '/gen/', 'vendor/', '*.min.js', 'x/*.js', '!keep.js'].join('\n'))
const hit = (p: string, dir = false) => checkIgnored(p, 'C:/proj', globs, dir) !== null

test('parseAiIgnore: comments, blanks and negations dropped; dir/ becomes dir/**', () => {
  expect(globs).toEqual(['gen/**', 'vendor/**', '*.min.js', 'x/*.js'])
})

test('listed files and folders are blocked, whether the path is relative or absolute', () => {
  expect(hit('gen/a.js')).toBe(true)
  expect(hit('C:/proj/vendor/lib/x.js')).toBe(true)
  expect(hit('C:' + String.fromCharCode(92) + 'proj' + String.fromCharCode(92) + 'vendor' + String.fromCharCode(92) + 'x.js')).toBe(true)
  expect(hit('src/app.min.js')).toBe(true)
  expect(hit('x/old.js')).toBe(true)
})

test('unlisted files, outside-project paths, handover/ and an empty list are not blocked', () => {
  expect(hit('src/app.js')).toBe(false)
  expect(hit('x/deep/old.js')).toBe(false)
  expect(hit('C:/other/vendor/x.js')).toBe(false)
  expect(hit('../vendor/x.js')).toBe(false)
  expect(checkIgnored('handover/gen/a.js', 'C:/proj', ['**/gen/**'])).toBeNull()
  expect(checkIgnored('gen/a.js', 'C:/proj', [])).toBeNull()
})

test('a Grep or Glob that names the folder itself is blocked; a sibling is not', () => {
  expect(hit('vendor', true)).toBe(true)
  expect(hit('C:/proj/gen/', true)).toBe(true)
  expect(hit('vendors', true)).toBe(false)
})

test('relativeTo is case-insensitive on the root and rejects other roots', () => {
  expect(relativeTo('C:/Proj', 'c:/proj/a/b.js')).toBe('a/b.js')
  expect(relativeTo('C:/proj', 'C:/projects/a.js')).toBeNull()
})

// The hook itself: the engine's side is stubbed, the plugin's tool.call hook is the real one.
const wire = (on: any, list: string) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: list }))
  on('tool.call', () => ({ result: {} })) // the tool answering, if the plugin lets the call through
}

test('hook: an ignored path is denied once with the protocol, the exact retry goes through', async ($, on) => {
  wire(on, 'vendor/\n')
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const first = await $.tool.call({ tool: 'Read', file_path: 'C:/proj/vendor/x.js' })
  expect(first.deny).toBeDefined()
  expect(first.deny).toContain('.aiignore')
  expect(first.deny).toContain('prefilter')
  const retry = await $.tool.call({ tool: 'Read', file_path: 'C:/proj/vendor/x.js' })
  expect(retry.deny).toBeUndefined()
})

test('hook: an unlisted path and a Grep with no path are never denied', async ($, on) => {
  wire(on, 'vendor/\n')
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  expect((await $.tool.call({ tool: 'Read', file_path: 'C:/proj/src/a.js' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Grep', pattern: 'x' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'C:/proj/vendor' })).deny).toBeDefined()
})

test('filterSearchResult: ignored files leave filenames and content, counts follow, a clean result is returned untouched', () => {
  const content = ['src/a.js:3:const x', 'vendor/lib.js:9:const x', 'vendor/lib.js-10-context', '--', 'C:/proj/gen/b.js:1:const x', 'src/b.js-4-after'].join('\n')
  const r = filterSearchResult({ filenames: ['src/a.js', 'vendor/lib.js', 'C:/proj/gen/b.js'], numFiles: 3, content, numLines: 6, numMatches: 3 }, 'C:/proj', globs)
  expect(r.result.filenames).toEqual(['src/a.js'])
  expect(r.result.numFiles).toBe(1)
  expect(r.result.content).toBe(['src/a.js:3:const x', '--', 'src/b.js-4-after'].join('\n'))
  expect(r.result.numLines).toBe(3)
  expect(r.hidden).toBe(2 + 3)
  const clean = { filenames: ['src/a.js'], numFiles: 1 }
  expect(filterSearchResult(clean, 'C:/proj', globs).result).toBe(clean)
  expect(filterSearchResult({ filenames: ['gen/a.js'] }, 'C:/proj', []).hidden).toBe(0)
})

test('hook: an unscoped Grep returns without the ignored files and says how many were hidden', async ($, on) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: 'vendor/\n' }))
  on('tool.call', () => ({ result: { mode: 'files_with_matches', numFiles: 2, filenames: ['C:/proj/src/a.js', 'C:/proj/vendor/x.js'] } }))
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const ran: any = await $.tool.call({ tool: 'Grep', pattern: 'x' })
  expect(ran.result.filenames).toEqual(['C:/proj/src/a.js'])
  expect(ran.result.numFiles).toBe(1)
  expect(ran.context.join(' ')).toContain('1 result was hidden')
})

test('hook: after the one-retry unlock, a Grep on the ignored folder is not filtered', async ($, on) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: 'vendor/\n' }))
  on('tool.call', () => ({ result: { mode: 'files_with_matches', numFiles: 1, filenames: ['C:/proj/vendor/x.js'] } }))
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const first: any = await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'C:/proj/vendor' })
  expect(first.deny).toBeDefined()
  const retry: any = await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'C:/proj/vendor' })
  expect(retry.result.filenames).toEqual(['C:/proj/vendor/x.js'])
})

test('checkCommand: shell commands that mention a listed path are caught, ordinary ones are not', () => {
  const B = String.fromCharCode(92)
  const cmd = (c: string) => checkCommand(c, 'C:/proj', globs) !== null
  for (const c of ['cat vendor/x.js', 'cd vendor && ls', 'head -n 5 "gen/a.js"', 'type C:' + B + 'proj' + B + 'vendor' + B + 'x.js', 'grep -r foo vendor', 'Get-Content ./gen/a.js', 'cat src/app.min.js']) expect(cmd(c)).toBe(true)
  for (const c of ['ls src', 'npm test', 'git status', 'cat src/app.js', 'echo vendors', 'node build.js --out dist']) expect(cmd(c)).toBe(false)
  expect(checkCommand('cat vendor/x.js', 'C:/proj', [])).toBeNull()
})

test('hook: an ignored path in a Bash command is denied once, the identical command goes through', async ($, on) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: 'vendor/\n' }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const first: any = await $.tool.call({ tool: 'Bash', command: 'cat vendor/x.js' })
  expect(first.deny).toContain('aiignore-guard')
  expect(((await $.tool.call({ tool: 'Bash', command: 'cat vendor/x.js' })) as any).deny).toBeUndefined()
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls src' })) as any).deny).toBeUndefined()
})

test('hook: parallel first calls all see the list, even when reading .aiignore is slow', async ($, on) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', async () => { await new Promise((r) => setTimeout(r, 40)); return { value: 'vendor/\n' } })
  on('tool.call', () => ({ result: { mode: 'files_with_matches', numFiles: 2, filenames: ['C:/proj/src/a.js', 'C:/proj/vendor/x.js'] } }))
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const [bash, grep, read]: any[] = await Promise.all([
    $.tool.call({ tool: 'Bash', command: 'cat vendor/x.js' }),
    $.tool.call({ tool: 'Grep', pattern: 'x' }),
    $.tool.call({ tool: 'Read', file_path: 'C:/proj/vendor/x.js' }),
  ])
  expect(bash.deny).toContain('this command names vendor/x.js')
  expect(bash.deny).toContain('retry this exact command once')
  expect(grep.result.filenames).toEqual(['C:/proj/src/a.js'])
  expect(read.deny).toContain('retry this exact path once')
})

test('filterSearchResult: separators left over from a removed context group are tidied', () => {
  const content = ['vendor/a.js-1-x', 'vendor/a.js:2:SENT', '--', 'src/b.js-1-y', 'src/b.js:2:SENT', '--', 'vendor/c.js:9:SENT'].join('\n')
  const r = filterSearchResult({ content }, 'C:/proj', globs)
  expect(r.result.content).toBe(['src/b.js-1-y', 'src/b.js:2:SENT'].join('\n'))
})
