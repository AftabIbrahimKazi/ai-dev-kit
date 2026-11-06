// Pure parsing for gap-log: the "STANDARDS GAP:" lines in a reply. The phrase is the one the standards tell the AI to use when a
// rule is missing (RULE AI-12 and ui-standards.md): "STANDARDS GAP: <what is not covered>".
export const FILE = '.claude/standards-gaps.jsonl'
export const MAX_PER_REPLY = 5
export const MAX_LEN = 300
export const MAX_FILE = 1_000_000 // far below the 4 MiB read limit of $.fs.read

export function extractGaps(text: string | undefined | null): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(/STANDARDS GAP:[ \t]*([^\n]+)/g)) {
    const gap = m[1].replace(/[`*_]+/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN)
    if (gap.length < 3 || seen.has(gap)) continue
    seen.add(gap)
    out.push(gap)
    if (out.length >= MAX_PER_REPLY) break
  }
  return out
}

export function toRows(gaps: string[], ts: string, session: string): string {
  return gaps.map((gap) => JSON.stringify({ ts, session, gap })).join('\n') + '\n'
}
