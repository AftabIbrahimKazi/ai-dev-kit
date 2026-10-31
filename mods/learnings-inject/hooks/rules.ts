// Pure rules for learnings-inject: where a skill's learnings.md may live, and how it is trimmed.
export const MAX_CHARS = 3000

export const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/i

// Candidate files, project first, then the user's own skill root.
export function candidates(skill: string, home: string): string[] {
  if (!SAFE_NAME.test(skill)) return []
  const roots = ['.claude/skills', '.opencode/skills', '.agents/skills']
  const list = roots.map((r) => `${r}/${skill}/learnings.md`)
  if (home) list.push(`${home.split(String.fromCharCode(92)).join('/')}/.claude/skills/${skill}/learnings.md`)
  return list
}

// The note added to the skill result, or null when there is nothing worth adding.
export function note(skill: string, text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const body = t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + '\n[trimmed: read the file for the rest]' : t
  return `learnings-inject: learnings.md for ${skill} (already read; skip the start-of-skill read):\n${body}`
}
