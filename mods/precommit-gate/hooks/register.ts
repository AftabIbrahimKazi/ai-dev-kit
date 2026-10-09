import type { Register } from 'claude-code'

// Gate for `git commit` / `git push` run through the Bash or PowerShell tool. The engine is the pre-commit
// skill's check.js (installed with the skill); without it this mod does nothing. Writes nothing under handover/;
// check.js excludes handover/locks.d/ (lane state) from git's output and scans staged handover notes like any file.
//
// No declaration file: the gate runs the mechanical checklist itself on every attempt. BLOCK findings deny every
// time; warnings deny once per staged change set, with the checklist reminder, and the retry goes through.
// (A marker under .claude/ cannot work: Claude Code asks permission for every write there, and denies it headless.)
const seen = new Set<string>() // change sets (or push reports) whose warnings were already shown once

type Detect = { isCommit: boolean; isPush: boolean; all: boolean; noVerify: boolean; stages: boolean; messages: string[]; unparsableMessage: boolean }

async function findEngine($: any): Promise<string | null> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const candidates = [
    '.claude/skills/pre-commit/check.js',
    `${home}/.claude/skills/pre-commit/check.js`,
    'skills/workflow/pre-commit.check.js',
  ]
  for (const c of candidates) if (await $.fs.exists(c)) return c
  return null
}

const shorten = (text: string, max = 12) => text.split('\n').slice(0, max).join('\n')

// What a commit would record, so a reworded message does not re-show the same warnings. Falls back to the report.
async function changeSetKey($: any, d: Detect, report: string): Promise<string> {
  if (!d.isCommit) return report
  try {
    const tree = await $.process.run(['git', 'write-tree'], { timeoutMs: 5000 })
    if (tree.exitCode === 0 && tree.stdout.trim()) return `${d.all ? 'all' : 'staged'}:${tree.stdout.trim()}`
  } catch { /* fall through */ }
  return report
}

export const register: Register = (on) => {
  // PowerShell too: on Windows the model may commit through it, and a Bash-only gate would be skipped.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const cmd = e.command
    if (!/commit|push/.test(cmd)) return next(e) // cheap filter: no process for ordinary commands
    let engine: string | null = null
    let d: Detect
    try {
      engine = await findEngine($)
      if (!engine) return next(e)
      const shell = e.tool === 'PowerShell' ? ['--shell', 'powershell'] : []
      const det = await $.process.run(['node', engine, '--detect', cmd, ...shell], { timeoutMs: 10000 })
      if (det.exitCode !== 0) return next(e)
      d = JSON.parse(det.stdout)
    } catch {
      return next(e) // a broken gate must not block unrelated work
    }
    if (!d.isCommit && !d.isPush) return next(e)

    try {
      // The checks run before the command does, so a chain that changes the index or pushes the commit it just made would be checked in the wrong state.
      if (d.isCommit && (d.stages || d.isPush)) {
        return { deny: 'precommit-gate: run staging (git add ...) and git push as separate commands from git commit, so the gate checks exactly what will be committed and pushed.' }
      }
      if (d.isCommit && d.noVerify) {
        return { deny: 'precommit-gate: git commit --no-verify bypasses hooks, which the pre-commit skill forbids. Fix the failing hook instead.' }
      }
      const args = ['node', engine, d.isPush ? '--push' : d.all ? '--all' : '--staged']
      if (d.isCommit && !d.unparsableMessage && d.messages.length) args.push('--message', d.messages.join('\n\n'))
      const res = await $.process.run(args, { timeoutMs: 20000 })
      const report = res.stdout.trim()
      if (res.exitCode === 1) return { deny: `precommit-gate: blocked.\n${shorten(report)}` }
      if (/ [1-9]\d* WARN/.test(report.split('\n')[0] ?? '')) {
        const key = await changeSetKey($, d, report)
        if (!seen.has(key)) {
          seen.add(key)
          const also = d.isCommit ? ' Also apply the pre-commit checklist (stray files, version bump, message).' : ''
          return { deny: `precommit-gate: warnings. Fix them, or run the same command again to go ahead.${also}\n${shorten(report)}` }
        }
      }
    } catch {
      return next(e)
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
