import { expect, test } from 'claude-code/testing'
import { classify, noLayers } from '../hooks/rules'

// A path another role lists under "in", and the active role does not, is that role's territory. No model is involved.
const L = {
  ...noLayers(),
  mine: ['src/components/**', 'src/pages/**', '**/*.css', 'package.json'],
  others: ['api/**', 'server/**', 'services/**', 'package.json'],
}
const hit = (p: string, dir = false) => classify(p, 'C:/proj', L, dir)

test('another role\'s territory is denied, nested and new folders included, whenever it was created', () => {
  expect(hit('services/orders.php')?.layer).toBe('role')
  expect(hit('services/billing/v2/deep/handler.php')?.layer).toBe('role')
  expect(hit('api/x.php')?.layer).toBe('role')
  expect(hit('services', true)?.layer).toBe('role')
  expect(hit('services/orders.php')?.why).toContain('belongs to another role')
})

test('a path the active role also lists is shared, and an unlisted one is left alone', () => {
  expect(hit('package.json')).toBeNull() // both roles list it
  expect(hit('src/components/Button.jsx')).toBeNull()
  expect(hit('site/theme.css')).toBeNull()
  expect(hit('lib/util.js')).toBeNull() // nobody lists it: not judged
  expect(hit('src/jobs/worker.js')).toBeNull()
})

const ROLES = JSON.stringify({
  roles: {
    frontend: { in: ['src/components/**', '**/*.css', 'package.json'], out: [] },
    backend: { in: ['api/**', 'services/**', 'package.json'], out: ['src/components/**'] },
  },
})

const world = (on: any) => {
  const arg = (e: any): string => (typeof e === 'string' ? e : e?.path ?? e?.name ?? '')
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('command.register', () => ({ value: { command: 'focus' } }))
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_: unknown, e: any) => ({ value: arg(e).split(String.fromCharCode(92)).join('/').endsWith('.claude/conflict-roles.json') }))
  on('fs.read', () => ({ value: ROLES }))
  on('prompt.submit', (_: unknown, e: any) => e)
  on('tool.call', () => ({ result: { mode: 'files_with_matches', numFiles: 2, filenames: ['C:/proj/src/components/B.jsx', 'C:/proj/services/orders.php'] } }))
}
const start = ($: any) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
const read = ($: any, p: string): Promise<any> => $.tool.call({ tool: 'Read', file_path: p })

test('hook: a frontend session is denied once on another role\'s folder, the folder then unlocks; nothing is denied before a role is known', async ($, on) => {
  world(on)
  await start($)
  expect((await read($, 'C:/proj/services/a.php')).deny).toBeUndefined() // no role yet
  await $.prompt.submit({ text: 'you are the frontend dev, fix the cart page' })
  expect((await read($, 'C:/proj/services/b.php')).deny).toContain('belongs to another role')
  expect((await read($, 'C:/proj/services/deep/er/c.php')).deny).toBeUndefined() // the retry unlocks the folder
  expect((await read($, 'C:/proj/src/components/B.jsx')).deny).toBeUndefined()
  expect((await read($, 'C:/proj/lib/util.js')).deny).toBeUndefined() // listed by no role
})

test('hook: an unscoped search drops another role\'s files from its results', async ($, on) => {
  world(on)
  await start($)
  await $.prompt.submit({ text: 'frontend session' })
  const ran: any = await $.tool.call({ tool: 'Grep', pattern: 'x' })
  expect(ran.result.filenames).toEqual(['C:/proj/src/components/B.jsx'])
})
