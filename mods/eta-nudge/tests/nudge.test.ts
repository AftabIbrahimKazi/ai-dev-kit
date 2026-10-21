import { expect, test } from 'claude-code/testing'
import { fresh, noteCall, FIRST_NUDGE_AFTER_MS, CHECKPOINT_INTERVAL_MS } from '../hooks/tracker'

const T0 = Date.UTC(2026, 9, 9, 10, 0, 0)

test('nothing nudges on the first call of an ordinary foreground task', () => {
  const s = fresh()
  expect(noteCall(s, T0, false)).toBeNull()
})

test('a backgrounded call nudges immediately, even as the very first call', () => {
  const s = fresh()
  expect(noteCall(s, T0, true)).toContain('background')
})

test('a backgrounded call later in the task nudges once, not again', () => {
  const s = fresh()
  noteCall(s, T0, false)
  expect(noteCall(s, T0 + 60000, false)).toBeNull()
  expect(noteCall(s, T0 + 120000, true)).toContain('background')
  expect(noteCall(s, T0 + 180000, true)).toBeNull() // already nudged
})

test('the first checkpoint fires at 5 minutes, not before', () => {
  const s = fresh()
  noteCall(s, T0, false)
  expect(noteCall(s, T0 + FIRST_NUDGE_AFTER_MS - 1000, false)).toBeNull()
  const note = noteCall(s, T0 + FIRST_NUDGE_AFTER_MS, false)
  expect(note).toContain('Checkpoint')
  expect(note).toContain('5 min')
})

test('after the first checkpoint, the next one is 10 minutes later, not 5', () => {
  const s = fresh()
  noteCall(s, T0, false)
  noteCall(s, T0 + FIRST_NUDGE_AFTER_MS, false) // first checkpoint, ~5 min
  expect(noteCall(s, T0 + FIRST_NUDGE_AFTER_MS + 5 * 60000, false)).toBeNull() // only +5 more min: not due yet
  const note = noteCall(s, T0 + FIRST_NUDGE_AFTER_MS + CHECKPOINT_INTERVAL_MS, false)
  expect(note).toContain('Checkpoint')
})

test('a background nudge and a due checkpoint on the same call: background wins, checkpoint still pending next call', () => {
  const s = fresh()
  noteCall(s, T0, false)
  const note = noteCall(s, T0 + FIRST_NUDGE_AFTER_MS, true) // checkpoint due AND backgrounded
  expect(note).toContain('background')
  const next = noteCall(s, T0 + FIRST_NUDGE_AFTER_MS + 1000, false)
  expect(next).toContain('Checkpoint') // the checkpoint nudge was only deferred, not lost
})

// ---- the hook, with the host stubbed ----
function host(on: any, startAt: number) {
  let now = startAt
  on('session.start', () => ({ cwd: '/work' }))
  on('clock.now', () => ({ value: now }))
  on('tool.call', (_$: any, e: any) => ({ result: e.tool === 'Bash' ? { stdout: 'ok', stderr: '' } : 'ok', text: 'ok' }))
  return { advance: (ms: number) => { now += ms } }
}
const bash = ($: any, bg = false) => $.tool.call({ tool: 'Bash', command: 'sleep 1', run_in_background: bg })
const read = ($: any) => $.tool.call({ tool: 'Read', file_path: 'a.ts' })

test('the hook nudges on a backgrounded Bash call', async ($, on) => {
  host(on, T0)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r: any = await bash($, true)
  expect(r.context[0]).toContain('background')
})

test('the hook nudges at the 5-minute checkpoint across ordinary foreground calls', async ($, on) => {
  const { advance } = host(on, T0)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const first = await read($)
  expect(first.context).toBeUndefined()
  advance(FIRST_NUDGE_AFTER_MS)
  const second: any = await read($)
  expect(second.context[0]).toContain('Checkpoint')
})

test('a denied or errored call is left untouched and does not advance the tracker', async ($, on) => {
  on('session.start', () => ({ cwd: '/work' }))
  on('clock.now', () => ({ value: T0 }))
  on('tool.call', () => ({ deny: 'no' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r: any = await read($)
  expect(r.deny).toBe('no')
})

test('a subagent turn is ignored', async ($, on) => {
  host(on, T0)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r: any = await $.tool.call({ tool: 'Bash', command: 'x', run_in_background: true, agentId: 'sub1' })
  expect(r.context).toBeUndefined()
})
