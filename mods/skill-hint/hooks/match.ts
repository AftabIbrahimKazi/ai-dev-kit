// Pure matching for skill-hint: which skills a prompt may need, and the one line to attach. No I/O here.

export type Rules = Record<string, string[]>

// Skills that fail to load on their own, with loose trigger words (recall over precision: a wrong hint costs ~40 tokens and the
// model just ignores it). 'word' is a whole word (plural s/es allowed), 'word*' any word starting with it, a phrase a substring.
export const DEFAULT_RULES: Rules = {
  'debug-protocol': ['bug', 'error*', 'fail*', 'broken', 'crash*', 'exception', 'regression', 'traceback', 'not working', "doesn't work", "isn't working", 'stack trace'],
  'plan-first': ['refactor', 'migrat*', 'rewrite', 'overhaul', 'all files', 'every file', 'multiple files', 'across the', 'end to end', 'step by step'],
  'intent-capture': ['make it better', 'clean up', 'clean it up', 'improve', 'polish', 'tidy', 'fix it up', 'make it nicer'],
  'session-budget': ['token*', 'cost', 'budget', 'context window', 'expensive'],
  'e2e-scaffold': ['playwright', 'e2e', 'end-to-end'],
  'responsive-check': ['responsive', 'breakpoint*', 'viewport', 'screen size', 'mobile layout'],
  'resolve-conflicts': ['conflict*', 'rebase', 'cherry-pick'],
  'version-bump': ['bump', 'release', 'changelog'],
}

export interface Manifest { skills?: Record<string, unknown>; archived?: Record<string, unknown> }

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function rx(t: string): RegExp {
  if (t.endsWith('*')) return new RegExp('(?<![a-z0-9])' + esc(t.slice(0, -1)), 'i')
  if (/\s|-/.test(t)) return new RegExp('(?<![a-z0-9])' + esc(t) + '(?![a-z0-9])', 'i')
  return new RegExp('(?<![a-z0-9])' + esc(t) + '(?:e?s)?(?![a-z0-9])', 'i')
}

// Merge the project's skill-scope triggers (skill -> words, or { triggers, locked }) over the defaults.
export function mergeRules(base: Rules, scope: unknown): Rules {
  const out: Rules = { ...base }
  const skills = (scope as { skills?: Record<string, unknown> } | null)?.skills
  if (!skills) return out
  for (const [name, e] of Object.entries(skills)) {
    const words = Array.isArray(e) ? e : (e as { triggers?: string[] })?.triggers
    if (Array.isArray(words)) out[name] = [...new Set([...(out[name] ?? []), ...words.map(String)])]
  }
  return out
}

export function matchSkills(text: string, rules: Rules): string[] {
  return Object.keys(rules).filter((n) => rules[n].some((t) => rx(t).test(text)))
}

// The line to attach, or null. Skills already hinted this session (seen) are not repeated; at most `max` per prompt.
export function hintFor(text: string, rules: Rules, manifest: Manifest | null, seen: Set<string>, max = 2): string | null {
  const found = matchSkills(text, rules).filter((n) => !seen.has(n))
  const usable = found.filter((n) => !manifest || !(manifest.skills || manifest.archived) || n in (manifest.skills ?? {}) || n in (manifest.archived ?? {}))
  const pick = usable.slice(0, max)
  if (!pick.length) return null
  pick.forEach((n) => seen.add(n))
  const archived = pick.filter((n) => manifest?.archived && n in manifest.archived)
  const active = pick.filter((n) => !archived.includes(n))
  const parts: string[] = []
  if (active.length) parts.push(`this prompt may need ${active.join(', ')}; load ${active.length > 1 ? 'them' : 'it'} if the task fits`)
  if (archived.length) parts.push(`${archived.join(', ')} ${archived.length > 1 ? 'are' : 'is'} archived: tell the user to run /unarchive ${archived[0]} if they want ${archived.length > 1 ? 'them' : 'it'}`)
  return `skill-hint (keyword match, a suggestion only): ${parts.join('; ')}.`
}
