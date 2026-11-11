import { expect, test } from 'claude-code/testing'
import { scriptsIn } from '../hooks/match'

const norm = (p: string) => p.split(String.fromCharCode(92)).join('/')

// Stubs every host call the mod makes. `files` is the fake disk, `toasts` the notices shown.
function stubs(on: any, files: Map<string, string>, opts: { failWrite?: boolean; toasts?: string[] } = {}) {
  const base = '/home/u/.ai-dev-kit/usage'
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'USERPROFILE' ? '/home/u' : undefined }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 11, 10, 0, 0) }))
  on('fs.exists', (_$: any, e: any) => ({ value: [...files.keys()].some((k) => norm(e.path).endsWith(norm(k))) }))
  on('fs.read', (_$: any, e: any) => ({ value: [...files.entries()].find(([k]) => norm(e.path).endsWith(norm(k)))?.[1] ?? '' }))
  on('fs.write', (_$: any, e: any) => {
    if (opts.failWrite) return { deny: 'disk full' }
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$: any, e: any) => { opts.toasts?.push(String(e.text ?? e)); return { value: undefined } })
  void base
}

const logRows = (files: Map<string, string>) =>
  [...files.entries()].filter(([k]) => k.includes('/usage/log/')).flatMap(([, t]) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const config = (files: Map<string, string>) => {
  const k = [...files.keys()].find((x) => x.endsWith('/usage/config.json'))
  return k ? JSON.parse(files.get(k)!) : undefined
}

test('scriptsIn finds installed and library kit scripts, a command word, and the real script behind skill-scope run', () => {
  expect(scriptsIn('node .claude/skills/code-audit/audit.js --top 15')).toEqual([{ name: 'code-audit/audit.js' }])
  expect(scriptsIn('node ".claude\\skills\\figma-code\\cli.js" build x.svg --download-fonts')).toEqual([{ name: 'figma-code/cli.js', detail: 'build' }])
  expect(scriptsIn('node skills/workflow/perf-audit.weigh.js --summary')).toEqual([{ name: 'perf-audit/weigh.js' }])
  expect(scriptsIn('node .claude/skills/skill-scope/auto.js run perf-audit weigh.js --summary')).toEqual([{ name: 'perf-audit/weigh.js', detail: 'via skill-scope' }])
  expect(scriptsIn('cd x && node ~/.claude/skills/handover/size.js check; node .claude/skills/handover/size.js check')).toEqual([{ name: 'handover/size.js', detail: 'check' }])
  expect(scriptsIn('npm test && git status')).toEqual([])
  expect(scriptsIn('cat skills/standards/notes.txt')).toEqual([])
})

test('a kit script run through Bash is recorded by name only, and the tool call is untouched', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('tool.call', () => ({ result: 'x', text: 'RESULT' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/code-audit/audit.js --top 15 --cwd /secret/path' })
  expect(r.text).toBe('RESULT') // nothing added, nothing changed
  const rows = logRows(files)
  expect(rows.length).toBe(1)
  expect(rows[0]).toMatchObject({ v: 1, sid: 'sess-1', project: 'work', kind: 'script', name: 'code-audit/audit.js' })
  expect(JSON.stringify(rows[0])).not.toContain('secret')
  expect([...files.keys()].some((k) => k.endsWith('/home/u/.ai-dev-kit/usage/log/2026-11-11-sess-1.jsonl'))).toBe(true)
})

test('PowerShell is matched too, and commands that are not kit scripts write nothing', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('tool.call', () => ({ result: 'x', text: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'PowerShell', command: 'node .claude\\skills\\pre-commit\\check.js --staged' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(logRows(files).map((r) => r.name)).toEqual(['pre-commit/check.js'])
})

test('a skill that loads and a slash command that is typed are recorded; a plain prompt is not', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('skill.prompt', () => ({ text: 'body' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.skill.prompt({ skill: 'debug-protocol', text: 'body' })
  await $.prompt.submit({ text: '/audit --top 3 secret-arg', command: { name: 'audit', args: '--top 3 secret-arg' } })
  await $.prompt.submit({ text: 'fix the bug please' })
  const rows = logRows(files)
  expect(rows.map((r) => [r.kind, r.name])).toEqual([['skill', 'debug-protocol'], ['command', 'audit']])
  expect(JSON.stringify(rows)).not.toContain('secret-arg')
  expect(JSON.stringify(rows)).not.toContain('fix the bug')
})

test('a slash command that the engine also expands as a skill counts once, as the command', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('skill.prompt', () => ({ text: 'body' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.prompt.submit({ text: '/audit', command: { name: 'audit', args: '' } })
  await $.skill.prompt({ skill: 'audit', text: 'body' }) // the same use, seen as a skill
  await $.skill.prompt({ skill: 'debug-protocol', text: 'body' }) // a different skill is its own use
  expect(logRows(files).map((r) => [r.kind, r.name])).toEqual([['command', 'audit'], ['skill', 'debug-protocol']])
})

test('tracking off writes nothing; the switch is read before every row, so a script flipping it takes effect at once', async ($, on) => {
  const files = new Map<string, string>([['/home/u/.ai-dev-kit/usage/config.json', '{"track":false,"notify":false}']])
  stubs(on, files)
  on('tool.call', () => ({ result: 'x', text: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/code-audit/audit.js' })
  expect(logRows(files).length).toBe(0)
  files.set('/home/u/.ai-dev-kit/usage/config.json', '{"track":true,"notify":false}')
  await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/code-audit/audit.js' })
  expect(logRows(files).length).toBe(1)
})

test('with no config file tracking is on, and a damaged one falls back to the defaults', async ($, on) => {
  const files = new Map<string, string>([['/home/u/.ai-dev-kit/usage/config.json', '{ broken']])
  stubs(on, files)
  on('tool.call', () => ({ result: 'x', text: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/diagram/cli.js detect' })
  expect(logRows(files)[0]).toMatchObject({ name: 'diagram/cli.js', detail: 'detect' })
})

test('notices on: one toast per feature per session, none when off', async ($, on) => {
  const files = new Map<string, string>([['/home/u/.ai-dev-kit/usage/config.json', '{"track":true,"notify":true}']])
  const toasts: string[] = []
  stubs(on, files, { toasts })
  on('tool.call', () => ({ result: 'x', text: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/code-audit/audit.js' })
  await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/perf-audit/weigh.js --summary' })
  expect(toasts).toEqual(['kit: script code-audit/audit.js', 'kit: script perf-audit/weigh.js'])
  expect(logRows(files).length).toBe(4) // every use is logged, only the first is announced
  files.set('/home/u/.ai-dev-kit/usage/config.json', '{"track":true,"notify":false}')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/handover/size.js check' })
  expect(toasts.length).toBe(2)
})

test('a failing disk does not break the tool call', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files, { failWrite: true })
  on('tool.call', () => ({ result: 'x', text: 'kept' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'node .claude/skills/code-audit/audit.js' })
  expect(r.text).toBe('kept')
})

test('/kit-usage on, off, notify and status switch the config and say what they did', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'kit-usage', args: '' })).text).toBe('feature-usage: tracking ON (default, no config file yet), notices OFF.')
  expect((await $.command.run({ command: 'kit-usage', args: 'off' })).text).toBe('feature-usage: tracking OFF, notices OFF.')
  expect(config(files)).toEqual({ track: false, notify: false })
  expect((await $.command.run({ command: 'kit-usage', args: 'notify on' })).text).toBe('feature-usage: tracking OFF, notices ON.')
  expect((await $.command.run({ command: 'kit-usage', args: 'on' })).text).toBe('feature-usage: tracking ON, notices ON.')
  expect(config(files)).toEqual({ track: true, notify: true })
  expect((await $.command.run({ command: 'kit-usage', args: 'wat' })).text).toContain('usage: /kit-usage')
  expect((await $.command.run({ command: 'kit-usage', args: 'notify maybe' })).text).toContain('usage: /kit-usage')
})

test('/kit-usage report runs session-budget usage.js for this project; without the skill it says how to get it', async ($, on) => {
  const files = new Map<string, string>()
  stubs(on, files)
  on('process.run', (_$: any, e: any) => ({ value: { exitCode: 0, stdout: 'REPORT ' + e.argv.slice(1).join(' '), stderr: '' } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((await $.command.run({ command: 'kit-usage', args: 'report' })).text).toContain('install the session-budget skill')
  files.set('.claude/skills/session-budget/usage.js', '// stub')
  const r = await $.command.run({ command: 'kit-usage', args: 'report --days 7' })
  expect(norm(r.text)).toContain('.claude/skills/session-budget/usage.js report --days 7 --cwd /work')
})
