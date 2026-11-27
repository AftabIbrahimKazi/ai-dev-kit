import type { Register } from 'claude-code'

// Answers a WebFetch call itself when it can, with a short digest, so Claude's own fetch (a page-sized model pass) is skipped.
// The work is a script (web-digest/cli.js): Obscura fetches the public page as text, code trims it, the free router answers the
// question in under 120 words. ANY problem (script missing, Obscura missing, router down, empty page, private URL, timeout, a
// read-on request with `offset`) means next(e): Claude's own WebFetch runs exactly as if this mod were not installed.
// Fails open everywhere. Reads .ai-dev-kit.json for the skill folder; the mod itself reads no env and makes no network call.
const TIMEOUT_MS = 60000

interface Manifest { skillRoot?: string }

async function readManifest($: any): Promise<Manifest | null> {
  try { return (await $.fs.exists('.ai-dev-kit.json')) ? (JSON.parse(await $.fs.read('.ai-dev-kit.json')) as Manifest) : null } catch { return null }
}

export const register: Register = (on) => {
  on('tool.call', { tool: 'WebFetch' }, async ($, e, next) => {
    try {
      if (e.offset !== undefined || !e.url || !e.prompt) return next(e)
      const m = await readManifest($)
      const file = `${m?.skillRoot ?? '.claude/skills'}/web-digest/cli.js`
      if (!(await $.fs.exists(file))) return next(e)
      const res = await $.process.run(['node', file, e.url, e.prompt], { timeoutMs: TIMEOUT_MS })
      if (res.exitCode !== 0) return next(e)
      const out = JSON.parse(String(res.stdout ?? '').trim()) as { url: string; bytes: number; result: string; durationMs: number }
      if (!out.result) return next(e)
      return { result: { bytes: out.bytes, code: 200, codeText: 'OK', result: out.result, durationMs: out.durationMs, url: out.url } }
    } catch { /* fail open */ }
    return next(e)
  }).catch(($, e, next) => next(e))
}
