// Pure state machine for the eta-nudge mod, unit-tested without the host. Mirrors plan-first's own
// thresholds: a backgrounded call gets nudged immediately (an estimate is owed before it starts), and
// a task running past 5 minutes gets its first checkpoint nudge, then one every 10 minutes after that.
export const FIRST_NUDGE_AFTER_MS = 5 * 60 * 1000
export const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000

export type State = { taskStartAt: number | null; nextNudgeAt: number | null; backgroundNudged: boolean }

export const fresh = (): State => ({ taskStartAt: null, nextNudgeAt: null, backgroundNudged: false })

const minutes = (ms: number) => Math.round(ms / 60000)

const BACKGROUND_NOTE = 'This command is running in background. If a time estimate and checkpoint plan have not already been given this task (plan-first), give one now.'
const checkpointNote = (elapsedMs: number) =>
  `Checkpoint: ~${minutes(elapsedMs)} min into this task. Restate or update the time estimate and say what checkpoint is active (plan-first).`

// Called on every tool call (after it ran). Returns the nudge text, or null.
export function noteCall(s: State, now: number, isBackground: boolean): string | null {
  if (s.taskStartAt === null) {
    s.taskStartAt = now
    s.nextNudgeAt = now + FIRST_NUDGE_AFTER_MS
    if (isBackground) { s.backgroundNudged = true; return BACKGROUND_NOTE }
    return null
  }
  if (isBackground && !s.backgroundNudged) {
    s.backgroundNudged = true
    return BACKGROUND_NOTE
  }
  if (s.nextNudgeAt !== null && now >= s.nextNudgeAt) {
    const elapsed = now - s.taskStartAt
    s.nextNudgeAt = now + CHECKPOINT_INTERVAL_MS
    return checkpointNote(elapsed)
  }
  return null
}
