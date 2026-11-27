import type { Register } from 'claude-code'

// Answers a WebSearch call itself when it can: the web-search skill script (web-search/cli.js) sends the query to the free
// router's /v1/search, trims the hits in code (no model) and returns title, url and a short snippet per hit. ANY problem
// (script missing, no key, router down, no hits, timeout), or an "extended" (thorough) request, means next(e): Claude's own
// WebSearch runs exactly as if this mod were not installed. Fails open everywhere. Reads .ai-dev-kit.json for the skill folder;
// the mod itself reads no env and makes no network call.
const TIMEOUT_MS = 40000

interface Manifest { skillRoot?: string }

async function readManifest($: any): Promise<Manifest | null> {
  try { return (await $.fs.exists('.ai-dev-kit.json')) ? (JSON.parse(await $.fs.read('.ai-dev-kit.json')) as Manifest) : null } catch { return null }
}

export const register: Register = (on) => {
  on('tool.call', { tool: 'WebSearch' }, async ($, e, next) => {
    try {
      if (!e.query || e.mode === 'extended') return next(e)
      const m = await readManifest($)
      const file = `${m?.skillRoot ?? '.claude/skills'}/web-search/cli.js`
      if (!(await $.fs.exists(file))) return next(e)
      const argv = ['node', file, e.query]
      if (e.allowed_domains?.length) argv.push('--allow', e.allowed_domains.join(','))
      if (e.blocked_domains?.length) argv.push('--block', e.blocked_domains.join(','))
      const res = await $.process.run(argv, { timeoutMs: TIMEOUT_MS })
      if (res.exitCode !== 0) return next(e)
      const out = JSON.parse(String(res.stdout ?? '').trim()) as { query: string; hits: { title: string; url: string; snippet: string }[]; digest?: string; durationMs: number }
      if (!out.hits?.length) return next(e)
      // A sifted digest (the script's sift mode) is plain text with the source URLs inside it; otherwise the trimmed hit list.
      const results = out.digest
        ? [`Relevant facts for "${out.query}", picked from the search results:\n${out.digest}`]
        : [{ tool_use_id: 'web-search', content: out.hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })) }]
      return {
        result: {
          query: out.query,
          results,
          durationSeconds: Math.max(0.1, Math.round(out.durationMs / 100) / 10),
          searchCount: 1,
        },
      }
    } catch { /* fail open */ }
    return next(e)
  }).catch(($, e, next) => next(e))
}
