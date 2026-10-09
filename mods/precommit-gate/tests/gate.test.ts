import { expect, test } from 'claude-code/testing'

const DET = { isCommit: false, isPush: false, all: false, amend: false, noVerify: false, force: false, stages: false, messages: [] as string[], unparsableMessage: false }
const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')
const CLEAN = 'precommit-check (staged, 1 file(s)): 0 BLOCK, 0 WARN'
const WARN = 'precommit-check (staged, 1 file(s)): 0 BLOCK, 1 WARN\nWARN  message  header is 65 chars (limit 50)'

// `trees` is what `git write-tree` prints on each call (the staged change set); the last one repeats.
type World = { engine?: boolean; detect?: Partial<typeof DET>; check?: { exit: number; out: string }; detectExit?: number; trees?: string[]; treeExit?: number }

// Stubs the host: which files exist and what the engine and git print. `calls` records every process run.
function world(on: any, w: World) {
  const calls: string[][] = []
  let t = 0
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path).endsWith('pre-commit/check.js') && w.engine !== false }))
  on('process.run', (_$: any, e: any) => {
    calls.push([...e.argv])
    if (e.argv.includes('--detect')) return { value: { exitCode: w.detectExit ?? 0, stdout: JSON.stringify({ ...DET, ...w.detect }), stderr: '' } }
    if (e.argv[0] === 'git' && e.argv[1] === 'write-tree') {
      const trees = w.trees ?? ['tree-a']
      return { value: { exitCode: w.treeExit ?? 0, stdout: trees[Math.min(t++, trees.length - 1)] + '\n', stderr: '' } }
    }
    const c = w.check ?? { exit: 0, out: CLEAN }
    return { value: { exitCode: c.exit, stdout: c.out, stderr: '' } }
  })
  on('tool.call', () => ({ result: 'ran', text: 'ok' }))
  return calls
}
const bash = ($: any, command: string) => $.tool.call({ tool: 'Bash', command })

test('an ordinary command passes without starting any process', async ($, on) => {
  const calls = world(on, {})
  const r = await bash($, 'npm test')
  expect(r.deny).toBeUndefined()
  expect(calls.length).toBe(0)
})

test('without the engine installed the mod does nothing', async ($, on) => {
  world(on, { engine: false, detect: { isCommit: true } })
  expect((await bash($, 'git commit -m "feat: x"')).deny).toBeUndefined()
})

test('a clean commit runs at once: the gate checks it, no declaration file, no extra round', async ($, on) => {
  const calls = world(on, { detect: { isCommit: true, messages: ['feat: x'] } })
  const r = await bash($, 'git commit -m "feat: x"')
  expect(r.deny).toBeUndefined()
  expect(calls.find((c) => c.includes('--staged'))).toContain('--message')
  expect(calls.some((c) => c.join(' ').includes('pre-commit-declared'))).toBe(false)
})

test('a BLOCK finding denies every attempt and shows the report', async ($, on) => {
  world(on, { detect: { isCommit: true }, check: { exit: 1, out: 'precommit-check (staged, 1 file(s)): 1 BLOCK, 0 WARN\nBLOCK secret  a.js:1  Anthropic key sk-a… (40 chars)' } })
  for (let i = 0; i < 2; i++) {
    const r = await bash($, 'git commit -m "feat: x"')
    expect(r.deny).toContain('blocked')
    expect(r.deny).toContain('Anthropic key')
  }
})

test('warnings stop the first attempt for a change set only, with the checklist reminder', async ($, on) => {
  world(on, { detect: { isCommit: true, messages: ['feat: add the first version of the customer account settings'] }, check: { exit: 0, out: WARN } })
  const first = await bash($, 'git commit -m "feat: add the first version of the customer account settings"')
  expect(first.deny).toContain('header is 65 chars (limit 50)')
  expect(first.deny).toContain('pre-commit checklist')
  expect((await bash($, 'git commit -m "feat: add the first version of the customer account settings"')).deny).toBeUndefined()
})

test('rewording the message for the same staged change does not cost another round', async ($, on) => {
  world(on, { detect: { isCommit: true }, check: { exit: 0, out: WARN }, trees: ['tree-a'] })
  expect((await bash($, 'git commit -m "feat: a long first message that runs over the limit"')).deny).toContain('warnings')
  expect((await bash($, 'git commit -m "feat: a different long message, still over the limit"')).deny).toBeUndefined()
})

test('a new staged change set shows its warnings again', async ($, on) => {
  world(on, { detect: { isCommit: true }, check: { exit: 0, out: WARN }, trees: ['tree-a', 'tree-b'] })
  expect((await bash($, 'git commit -m "feat: x"')).deny).toContain('warnings')
  expect((await bash($, 'git commit -m "feat: x"')).deny).toContain('warnings')
})

test('if git cannot name the change set, the report is the key', async ($, on) => {
  world(on, { detect: { isCommit: true }, check: { exit: 0, out: WARN }, treeExit: 128 })
  expect((await bash($, 'git commit -m "feat: x"')).deny).toContain('warnings')
  expect((await bash($, 'git commit -m "feat: x"')).deny).toBeUndefined()
})

test('commit -a checks tracked changes, not just the index', async ($, on) => {
  const calls = world(on, { detect: { isCommit: true, all: true } })
  await bash($, 'git commit -am "feat: x"')
  expect(calls.some((c) => c.includes('--all'))).toBe(true)
})

test('an unparsable heredoc message skips the message check instead of guessing', async ($, on) => {
  const calls = world(on, { detect: { isCommit: true, unparsableMessage: true } })
  await bash($, 'git commit -m "$(cat <<EOF\nfeat: x\nEOF\n)"')
  expect(calls.find((c) => c.includes('--staged'))).not.toContain('--message')
})

test('staging or pushing in the same command as the commit is denied', async ($, on) => {
  world(on, { detect: { isCommit: true, stages: true } })
  expect((await bash($, 'git add -A && git commit -m "feat: x"')).deny).toContain('separate commands')
})

test('commit and push chained together is denied', async ($, on) => {
  world(on, { detect: { isCommit: true, isPush: true } })
  expect((await bash($, 'git commit -m "feat: x" && git push')).deny).toContain('separate commands')
})

test('--no-verify is denied', async ($, on) => {
  world(on, { detect: { isCommit: true, noVerify: true } })
  expect((await bash($, 'git commit --no-verify -m "feat: x"')).deny).toContain('--no-verify')
})

test('a push with a secret in an unpushed commit is denied', async ($, on) => {
  world(on, { detect: { isPush: true }, check: { exit: 1, out: 'precommit-check (push, 1 unpushed commit(s), 1 file(s)): 1 BLOCK, 0 WARN\nBLOCK file  .env  secret-bearing file is in the change set' } })
  expect((await bash($, 'git push origin main')).deny).toContain('.env')
})

test('a clean push passes', async ($, on) => {
  world(on, { detect: { isPush: true } })
  expect((await bash($, 'git push origin main')).deny).toBeUndefined()
})

test('a crashing engine fails open', async ($, on) => {
  world(on, { detectExit: 2, detect: { isCommit: true } })
  expect((await bash($, 'git commit -m "feat: x"')).deny).toBeUndefined()
})

test('a commit through the PowerShell tool is gated too, and parsed as PowerShell', async ($, on) => {
  const calls = world(on, { detect: { isCommit: true, messages: ['feat: x'] }, check: { exit: 0, out: WARN } })
  const r = await $.tool.call({ tool: 'PowerShell', command: "git commit -m 'feat: x'" })
  expect(r.deny).toContain('warnings')
  expect(calls.find((c) => c.includes('--detect'))!.slice(-2)).toEqual(['--shell', 'powershell'])
})

test('a Bash commit is parsed as Bash', async ($, on) => {
  const calls = world(on, { detect: { isCommit: true } })
  await bash($, 'git commit -m "feat: x"')
  expect(calls.find((c) => c.includes('--detect'))).not.toContain('--shell')
})

test('text that only mentions git commit is not gated', async ($, on) => {
  world(on, { detect: {} })
  expect((await bash($, 'echo "run git commit later"')).deny).toBeUndefined()
})
