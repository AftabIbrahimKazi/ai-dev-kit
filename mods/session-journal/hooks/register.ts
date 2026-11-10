import type { Register } from 'claude-code'

// In-session journal. One small file per session, OUTSIDE the project (~/.ai-dev-kit/sessions/<project>/<start>.jsonl),
// written by script after every finished turn: what you asked, files edited, commands run, failures. No model call.
// It is deliberately NOT handover.md. handover.md carries crucial context from one session to a brand new one; this
// file only lets a single long session survive compaction or a /clear without a model-written summary. Nothing here is
// ever merged into handover.md, and the handover skill never reads it by default.
const MAX_ENTRIES = 200
const IDLE_HOURS = 5 // a session file idle this long is gone when the next session starts
// Runs as: node -e CLEANUP <sessions-dir> <idle-hours> <keep-file>. Deletes only *.jsonl files older than the idle limit
// under the sessions dir (one level of project folders), never the file of the session that is starting now, and
// removes a project folder left empty. Prints how many files it deleted.
export const CLEANUP = [
  "const fs=require('fs'),path=require('path');",
  "const [dir,hours,keep]=process.argv.slice(1);const limit=Date.now()-Number(hours)*3600000;let n=0;",
  "if(fs.existsSync(dir))for(const p of fs.readdirSync(dir)){const d=path.join(dir,p);let st;try{st=fs.statSync(d)}catch{continue}if(!st.isDirectory())continue;",
  "for(const f of fs.readdirSync(d)){if(!f.endsWith('.jsonl'))continue;const fp=path.join(d,f);if(path.resolve(fp)===path.resolve(keep))continue;try{if(fs.statSync(fp).mtimeMs<limit){fs.unlinkSync(fp);n++}}catch{}}",
  "try{if(!fs.readdirSync(d).length)fs.rmdirSync(d)}catch{}}",
  "console.log(n)",
].join('')
const SECRET = /(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,}|Bearer\s+\S+|(?:api[_-]?key|token|secret|passw(?:or)?d)\s*[=:]\s*\S+)/gi

// Resets a file's idle timer: node -e TOUCH <file>. Call it whenever a journal is read or referred to (the digest after a
// compaction, a resume), because reading alone does not change the modified time the cleanup goes by. Writing a turn
// entry already resets it.
export const TOUCH = "const fs=require('fs');const f=process.argv[1];try{const t=new Date();fs.utimesSync(f,t,t)}catch{}"
export async function touchJournal($: any, file: string): Promise<void> {
  try {
    await $.process.run(['node', '-e', TOUCH, file], { timeoutMs: 5000 })
  } catch {
    /* best effort */
  }
}

type Call = { tool: string; target: string; ok: boolean }
let key = ''
let cwd = ''
let ask = ''
let calls: Call[] = []

export const scrub = (s: string) => s.replace(SECRET, '[redacted]')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const slug = (cwd: string) => cwd.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project'
// A path inside the project is stored relative to it: shorter lines, and the digest's character cap holds more files.
export function relTo(cwd: string, p: string): string {
  const fwd = (s: string) => s.split(String.fromCharCode(92)).join('/')
  const base = fwd(cwd).replace(/\/+$/, '')
  const q = fwd(p)
  if (!base) return q
  const lower = (s: string) => (/^[a-z]:\//i.test(s) ? s.toLowerCase() : s)
  return lower(q).startsWith(lower(base) + '/') ? q.slice(base.length + 1) : q
}
const rel = (p: string) => relTo(cwd, p)

async function journalPath($: any, cwd: string): Promise<string> {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.').split(String.fromCharCode(92)).join('/')
  return `${home}/.ai-dev-kit/sessions/${slug(cwd)}/${key || 'session'}.jsonl`
}

type Entry = { t: string; ask: string; edited: string[]; reads: number; cmds: string[]; failed: number; said: string }

// Pure: journal lines in, a capped plain-text digest out (or '' when there is nothing worth keeping). Exact facts only.
export function digest(lines: string[], maxChars = 1500): string {
  const es: Entry[] = []
  for (const l of lines) {
    try {
      es.push(JSON.parse(l))
    } catch {
      /* skip a damaged line */
    }
  }
  if (!es.length) return ''
  const files = [...new Set(es.flatMap((x) => x.edited ?? []))]
  const fails = es.flatMap((x) => (x.cmds ?? []).filter((c) => c.startsWith('!'))).slice(-5)
  const asks = es.slice(-8).map((x) => '- ' + clip(x.ask, 120))
  const parts = [
    `Session journal, recorded by script (${es.length} turns). Keep these facts in the summary exactly as written.`,
    files.length ? `Files edited: ${files.slice(-25).join(', ')}` : 'Files edited: none',
    fails.length ? `Failed commands: ${fails.map((c) => c.slice(1)).join(' | ')}` : '',
    'Recent requests:\n' + asks.join('\n'),
  ].filter(Boolean)
  return clip(parts.join('\n'), maxChars)
}

export const register: Register = (on) => {
  on('session.compact', async ($, e, next) => {
    try {
      const x = e as any
      if (x.agentId !== undefined || x.trigger === 'precompute') return next(e)
      const path = await journalPath($, cwd)
      const lines = (await $.fs.read(path)).split('\n').filter(Boolean)
      const d = digest(lines)
      if (!d) return next(e)
      await touchJournal($, path) // referred to, so its idle timer restarts
      return next({ ...x, instructions: [x.instructions, d].filter(Boolean).join('\n\n') })
    } catch {
      return next(e) // no journal yet, or a read problem: compact exactly as before
    }
  })

  on('session.start', async ($, e, next) => {
    // usage().startedAt is the session's FIRST launch, so a resumed or continued session reuses its own journal;
    // /clear starts it over, which is the right boundary for a new journal.
    try {
      key = String((await $.session.usage()).startedAt)
    } catch {
      key = String(Date.now())
    }
    cwd = String((e as any).cwd ?? '')
    ask = ''
    calls = []
    try {
      const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.').split(String.fromCharCode(92)).join('/')
      await $.process.run(['node', '-e', CLEANUP, `${home}/.ai-dev-kit/sessions`, String(IDLE_HOURS), await journalPath($, cwd)], { timeoutMs: 10000 })
    } catch {
      /* cleanup is best effort; a missing node or a locked file must never block a session */
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if ((e as any).agentId === undefined) {
      ask = scrub(String((e as any).text ?? '')).replace(/\s+/g, ' ').trim()
      calls = []
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      if ((e as any).agentId !== undefined) return ran
      const x = e as any
      const tool = String(x.tool ?? '')
      const target = tool === 'Bash' || tool === 'PowerShell' ? scrub(String(x.command ?? '')) : rel(String(x.file_path ?? x.pattern ?? x.path ?? ''))
      calls.push({ tool, target: clip(target.replace(/\s+/g, ' '), 140), ok: !('deny' in ran && ran.deny) && !(ran as any).isError })
    } catch {
      /* never let journaling break a tool call */
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      const x = e as any
      if (x.agentId !== undefined || x.reason !== 'answer' || !ask) return out
      const edited = [...new Set(calls.filter((c) => (c.tool === 'Edit' || c.tool === 'Write') && c.ok).map((c) => c.target))]
      const cmds = calls.filter((c) => c.tool === 'Bash' || c.tool === 'PowerShell').map((c) => (c.ok ? '' : '!') + c.target)
      const entry = {
        t: new Date().toISOString(),
        ask: clip(ask, 200),
        edited,
        reads: calls.filter((c) => c.tool === 'Read').length,
        cmds: cmds.slice(-8),
        failed: calls.filter((c) => !c.ok).length,
        said: clip(scrub(String((out as any)?.text ?? x.text ?? '')).replace(/\s+/g, ' ').trim(), 200),
      }
      const path = await journalPath($, cwd)
      let lines: string[] = []
      try {
        lines = (await $.fs.read(path)).split('\n').filter(Boolean)
      } catch {
        /* first entry of this session */
      }
      lines.push(JSON.stringify(entry))
      await $.fs.write(path, lines.slice(-MAX_ENTRIES).join('\n') + '\n')
    } catch {
      /* a journal problem must never surface as a turn error */
    }
    return out
  }).catch(($, e, next) => next(e))
}
