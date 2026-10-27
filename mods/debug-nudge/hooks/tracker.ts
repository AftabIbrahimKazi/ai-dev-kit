// Pure state machine for the debug-nudge mod, unit-tested without the host.
// A "failed fix" = the same verification command fails again after at least one edit since its last failure.
export const VERIFY = /\b(test|tests|jest|vitest|pytest|mocha|phpunit|playwright|cypress|build|compile|tsc|lint|eslint|stylelint|check|cargo|go test|mvn|gradle|make)\b/i
export const NUDGE_AT = 2

export type Entry = { lastFailed: boolean; cycles: number; nudged: boolean; files: string[] }
export type State = { edits: string[]; byCmd: Map<string, Entry>; early: boolean }

export const fresh = (): State => ({ edits: [], byCmd: new Map(), early: false })

// The command's name without its arguments, so `npm run lint` and `npm run test` stay apart but
// `npm test -- --watch` and `npm test` match. Stops at the first flag, after a script or file path, or at 3 words.
export function cmdKey(command: string): string {
  const t = command.trim().toLowerCase().split(/\s+/)
  const out = [t[0]]
  for (let i = 1; i < t.length && out.length < 3; i++) {
    const w = t[i]
    if (w === '-m' && /^python/.test(out[0]) && t[i + 1]) { out.push(w, t[++i]); continue } // python -m pytest
    if (w.startsWith('-')) break
    out.push(w)
    if (/[\/\\]|\.\w+$/.test(w)) break // a script or file: the words after it are its arguments
  }
  return out.join(' ')
}

export function noteEdit(s: State, file: string): void {
  if (!s.edits.includes(file)) s.edits.push(file)
}

// Returns the reminder text when this result is the second failed fix for its command, else null.
export function noteBash(s: State, command: string, failed: boolean): string | null {
  if (!VERIFY.test(command)) return null
  const key = cmdKey(command)
  const edited = s.edits
  s.edits = []
  if (!failed) { s.byCmd.delete(key); return null }
  const e = s.byCmd.get(key) ?? { lastFailed: false, cycles: 0, nudged: false, files: [] }
  if (e.lastFailed && edited.length > 0) {
    e.cycles += 1
    for (const f of edited) if (!e.files.includes(f)) e.files.push(f)
  }
  e.lastFailed = true
  s.byCmd.set(key, e)
  if (e.cycles >= NUDGE_AT && !e.nudged) {
    e.nudged = true
    const names = e.files.slice(0, 5).map((f) => f.split('/').pop()?.split(String.fromCharCode(92)).pop()).join(', ')
    return `debug-nudge: "${key}" has failed after ${e.cycles} separate fix attempts (edited: ${names}). Stop editing. Apply the debug-protocol skill: state the exact failure, list 2-3 hypotheses, and test them with a read-only check before the next edit.`
  }
  return null
}

// One early reminder per session, at the first failed verification command, because the skill's own trigger is
// unreliable at that moment (about 1 run in 3 loads it). Separate from the second-fix nudge above, which still fires.
export function noteFirstFailure(s: State, command: string, failed: boolean): string | null {
  if (s.early || !failed || !VERIFY.test(command)) return null
  s.early = true
  return 'debug-nudge: a verification command failed. Before editing, apply the debug-protocol skill: reproduce it, state one hypothesis with its evidence, test it with the cheapest probe, then make one change.'
}

// A pipe (`npm test 2>&1 | tail -80`) or `; echo` hides the command's exit code, so the host reports success
// for a failing run. This reads the output text for the usual failure signals so those runs still count.
// It is only ever applied to commands that already look like verification commands (VERIFY above).
const FAILED_TEXT = /(\b[1-9]\d* (?:tests? )?(?:failed|failing)\b|\bFAIL(?:ED)?\b|\bnpm ERR!|\bAssertionError\b|\berror TS\d+|^Traceback\b|^\s*Error:|\bexit(?:ed)? (?:with )?(?:code|status) [1-9])/m

export const looksFailed = (text: string): boolean => FAILED_TEXT.test(text)
