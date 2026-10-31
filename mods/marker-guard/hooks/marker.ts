// Pure rules for the marker-guard mod, unit-tested without the host.
// The [CX] marker (AI-01) lets the user see the AI still has the project context. This only reports a missing one.
export const PROTOCOL_FILES = ['CLAUDE.md', 'AGENTS.md']

// The marker the project's protocol file defines, or null when it defines none.
// A set Context code (a table row holding 2-4 letters/digits) makes it `[CX <code>]`; otherwise `[CX]`.
export function expectedMarker(protocol: string): string | null {
  if (!protocol.includes('[CX')) return null
  const row = /\|\s*Context code\s*\|\s*([A-Za-z0-9]{2,4})\s*\|/.exec(protocol)
  return row ? `[CX ${row[1]}]` : '[CX]'
}

export const hasMarker = (answer: string, marker: string): boolean => answer.trimStart().startsWith(marker)

export const warning = (marker: string): string =>
  `[marker-guard] This reply is missing ${marker}, so the AI may have lost the project context. If answers look off, save state and start a new session (AI-03).`

// Returns the warning to show beneath the reply (the host shows a changed text there), or null.
export function check(protocol: string | null, answer: string): string | null {
  if (!protocol || !answer.trim()) return null
  const marker = expectedMarker(protocol)
  if (!marker || hasMarker(answer, marker)) return null
  return warning(marker)
}

// Shown once after the context is compacted: the marker may be repeated from the summary, so it proves less than usual.
export const COMPACTED =
  '[marker-guard] The context was just compacted, so the project standards may have left it. Ask the AI to restate which standards are loaded (AI-02) before it edits.'

// Combines the missing-marker warning with the one-time compaction notice. Returns null when neither applies.
export function notice(protocol: string | null, answer: string, compacted: boolean): string | null {
  const parts = [check(protocol, answer), protocol && compacted ? COMPACTED : null].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}
