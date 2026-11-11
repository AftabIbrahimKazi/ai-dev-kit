import type { Register } from 'claude-code'
import { scriptsIn, slug } from './match'

// Records which kit features get used, so nobody has to ask the model whether it used one. One row per skill that loads,
// slash command that is typed, or kit script that runs, appended to <home>/.ai-dev-kit/usage/log/<date>-<session>.jsonl.
// Observes only: it never changes a prompt, a tool call or a result and adds no model-visible text, so it costs no tokens.
// The switch is <home>/.ai-dev-kit/usage/config.json ({ track, notify }); no file means tracking on, notices off. The
// session-budget skill's usage.js turns the log into a report and flips the same switch; /kit-usage does both.
// A file per session keeps parallel sessions apart; the queue keeps this session's own writes in order; the log is never
// read back, so $.fs.read's 4 MiB limit cannot stop it. Names only: never prompts, arguments, paths or file contents.
type Kind = 'skill' | 'command' | 'script'
type Config = { track: boolean; notify: boolean }
const DEFAULTS: Config = { track: true, notify: false }
const PART_MAX = 1024 * 1024

const parts = new Map<string, { n: number; text: string }>()
const toasted = new Set<string>()
let queue: Promise<void> = Promise.resolve()
let project = 'project'
let projectDir = ''
let lastCommand: { name: string; at: number } | null = null

const homeOf = async ($: any): Promise<string> => ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.').split(String.fromCharCode(92)).join('/')
const partFile = (dir: string, key: string, n: number) => `${dir}/${key}${n > 1 ? '.' + n : ''}.jsonl`

async function readConfig($: any, home: string): Promise<{ config: Config; exists: boolean }> {
  const file = `${home}/.ai-dev-kit/usage/config.json`
  try {
    if (!(await $.fs.exists(file))) return { config: DEFAULTS, exists: false }
    const j = JSON.parse(await $.fs.read(file)) as Partial<Config>
    return { config: { track: j.track !== false, notify: j.notify === true }, exists: true }
  } catch {
    return { config: DEFAULTS, exists: false } // a damaged config means the defaults
  }
}

async function appendRow($: any, dir: string, key: string, line: string): Promise<void> {
  let p = parts.get(key)
  if (!p) {
    let n = 1 // after a reload, continue in a fresh part rather than reading an old one back
    while (await $.fs.exists(partFile(dir, key, n))) n++
    p = { n, text: '' }
    parts.set(key, p)
  }
  if (p.text && p.text.length + line.length > PART_MAX) { p.n += 1; p.text = '' }
  p.text += line
  await $.fs.write(partFile(dir, key, p.n), p.text)
}

async function record($: any, kind: Kind, name: string, detail?: string): Promise<void> {
  try {
    const home = await homeOf($)
    const { config } = await readConfig($, home)
    if (!config.track) return
    const ts = new Date(await $.clock.now()).toISOString()
    const sid = String(await $.session.id())
    const row = { v: 1, t: ts, sid, project, kind, name, ...(detail ? { detail } : {}) }
    const key = `${ts.slice(0, 10)}-${sid.replace(/[^\w-]/g, '')}`
    const job = queue.then(() => appendRow($, `${home}/.ai-dev-kit/usage/log`, key, JSON.stringify(row) + '\n'))
    queue = job.catch(() => undefined) // one failed write must not block the next
    await job
    const id = `${kind}:${name}`
    if (config.notify && !toasted.has(id)) {
      toasted.add(id)
      await $.ui.toast(`kit: ${kind} ${name}${detail ? ' ' + detail : ''}`)
    }
  } catch {
    // logging must never touch a prompt, a tool call or a result
  }
}

const stateLine = (c: Config, exists: boolean): string =>
  `feature-usage: tracking ${c.track ? 'ON' : 'OFF'}${exists ? '' : ' (default, no config file yet)'}, notices ${c.notify ? 'ON' : 'OFF'}.`
const HELP = 'usage: /kit-usage [status] | on | off | notify on|off | report [--days N] [--all-projects] | reset --yes'

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    projectDir = String((e as any).cwd ?? '')
    project = slug(projectDir)
    toasted.clear()
    await $.command.register({ name: 'kit-usage', description: 'Feature-usage tracking: status, on, off, notify on|off, report, reset' })
    return next(e)
  }).catch(($, e, next) => next(e))

  // Kit scripts run through the shell tool. Recorded before the call so a script that fails still counts as used.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    try {
      for (const s of scriptsIn(String((e as any).command ?? ''))) await record($, 'script', s.name, s.detail)
    } catch {
      /* fail open */
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A skill's prompt was expanded for the model: typed as /name, loaded through the Skill tool, or preloaded.
  on('skill.prompt', async ($, e, next) => {
    try {
      const name = String((e as any).skill)
      // A slash command is also expanded as a skill: when the same name was just typed, that is one use, already counted.
      const typed = lastCommand && lastCommand.name === name && (await $.clock.now()) - lastCommand.at < 5000
      if (!typed) await record($, 'skill', name)
    } catch {
      /* fail open */
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A slash command the person typed. The name only; arguments are never stored.
  on('prompt.submit', async ($, e, next) => {
    try {
      const c = (e as any).command
      if (c && c.name) {
        lastCommand = { name: String(c.name), at: await $.clock.now() }
        await record($, 'command', String(c.name))
      }
    } catch {
      /* fail open */
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'kit-usage' }, async ($, e) => {
    const [a, b] = String((e as any).args ?? '').trim().split(/\s+/).filter(Boolean)
    const home = await homeOf($)
    const file = `${home}/.ai-dev-kit/usage/config.json`
    const { config, exists } = await readConfig($, home)
    if (!a || a === 'status') return { text: stateLine(config, exists) }
    if (a === 'on' || a === 'off' || (a === 'notify' && (b === 'on' || b === 'off'))) {
      const next: Config = a === 'notify' ? { ...config, notify: b === 'on' } : { ...config, track: a === 'on' }
      await $.fs.write(file, JSON.stringify(next, null, 2) + '\n')
      return { text: stateLine(next, true) }
    }
    if (a === 'report' || a === 'reset') {
      const candidates = ['.claude/skills/session-budget/usage.js', `${home}/.claude/skills/session-budget/usage.js`, 'skills/workflow/session-budget.usage.js']
      for (const script of candidates) {
        if (await $.fs.exists(script)) {
          const rest = String((e as any).args ?? '').trim().split(/\s+/).filter(Boolean)
          const r = await $.process.run(['node', script, ...rest, ...(a === 'report' && projectDir ? ['--cwd', projectDir] : [])], { timeoutMs: 15000 })
          return { text: r.exitCode === 0 ? r.stdout : `usage.js failed (${r.exitCode}): ${r.stderr || r.stdout}` }
        }
      }
      return { text: 'no report script found: install the session-budget skill (it carries usage.js). Tracking itself still works.' }
    }
    return { text: HELP }
  }).catch(() => ({ text: 'feature-usage: /kit-usage failed' }))
}
