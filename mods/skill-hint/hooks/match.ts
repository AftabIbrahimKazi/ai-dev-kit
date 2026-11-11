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
  'perf-audit': ['perf*', 'slow', 'lighthouse', 'bundle', 'page weight', 'load time', 'vitals'],
  'responsive-check': ['responsive', 'breakpoint*', 'viewport', 'screen size', 'mobile layout'],
  'resolve-conflicts': ['conflict*', 'rebase', 'cherry-pick'],
  'version-bump': ['bump', 'release', 'changelog'],
  'code-audit': ['audit the project', 'audit this project', 'audit the code', 'code audit', 'health check', 'check the standards', 'lint the project', 'standards violation*'],
  'security-audit': ['security audit', 'security review', 'attack surface', 'recon', 'vulnerabilit*', 'owasp', 'pentest'],
  'memory-gardener': ['stale notes', 'prune memory', 'stale memory', 'memory cleanup', 'clean up memory', 'learnings.md'],
  'optimize-assets': ['compress images', 'optimize images', 'optimise images', 'webp', 'avif', 'heavy assets', 'image size', 'asset size'],
  'project-context': ['figma export', 'design docs', 'project-context', 'requirements doc*'],
  'diagram': ['architecture diagram', 'draw a diagram', 'system diagram', 'diagram of'],
  'pre-commit': ['before commit', 'before i commit', 'staged files', 'staged changes', 'commit check'],
  'untrack': ['untrack', 'stop tracking', 'remove from git but keep', 'gitignore a tracked'],
}

export interface Manifest { skills?: Record<string, unknown>; archived?: Record<string, unknown>; skillRoot?: string }

// Skills whose mechanical step a script can run outright when the prompt matches, so the facts arrive with the prompt
// and no skill has to load first. Only scripts that read and print; measured for perf-audit on 2026-11-11 (Haiku, one
// Astro build, 2 runs each): model-led $0.019 and ~15k output tokens, script-led $0.006 and ~2.3k.
export interface ScriptRun { skill: string; script: string; args: string[]; header: string }
export const SCRIPT_RUNS: ScriptRun[] = [
  { skill: 'perf-audit', script: 'weigh.js', args: ['--top', '7'], header: 'skill-hint ran perf-audit/weigh.js (static payload weigh-in; read this table instead of listing files):' },
  { skill: 'code-audit', script: 'audit.js', args: ['--top', '15'], header: 'skill-hint ran code-audit/audit.js (rule counts by file; read this instead of opening files to hunt violations):' },
  { skill: 'security-audit', script: 'recon.js', args: ['--top', '20'], header: 'skill-hint ran security-audit/recon.js (entry points, env reads, sinks with file:line; it names no finding, you do):' },
  { skill: 'memory-gardener', script: 'stale.js', args: [], header: 'skill-hint ran memory-gardener/stale.js (memory bullets naming missing files; candidates only, you decide):' },
  { skill: 'optimize-assets', script: 'convert.js', args: ['scan'], header: 'skill-hint ran optimize-assets/convert.js scan (heavy assets found; nothing converted, ask before converting):' },
  { skill: 'project-context', script: 'scan.js', args: ['status'], header: 'skill-hint ran project-context/scan.js status (folders, stale or current, leak check):' },
]

// The script to run for this prompt, or null: the skill must match a trigger and be installed and active (an archived
// skill has no script in place). Once per skill per session (ran).
export function scriptFor(text: string, rules: Rules, manifest: Manifest | null, ran: Set<string>): ScriptRun | null {
  if (!manifest?.skills) return null
  const hit = matchSkills(text, rules)
  const run = SCRIPT_RUNS.find((s) => hit.includes(s.skill) && s.skill in manifest.skills! && !ran.has(s.skill))
  if (!run) return null
  ran.add(run.skill)
  return run
}

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
