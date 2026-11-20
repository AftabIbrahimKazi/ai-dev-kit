import { test, expect } from 'claude-code/testing'

const run = (ops: unknown[]) => ({ tool: 'mcp__batch__run', ops }) as never

test('a failing ledger write never breaks the lookup', async ($, on) => {
  on('fs.write', () => {
    throw new Error('disk full')
  })
  on('session.id', () => ({ value: 's2' }) as never)
  on('env.get', () => ({ value: 'C:/home' }) as never)
  on('clock.now', () => ({ value: 1 }) as never)
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'a\nb' }) as never)
  const r = await $.tool.call(run([{ tool: 'Glob', pattern: '*' }]))
  expect(String((r as { text?: string }).text)).toContain('#0 Glob\na\nb')
})

test('a missing home folder skips the ledger and still answers', async ($, on) => {
  on('session.id', () => ({ value: 's3' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('clock.now', () => ({ value: 1 }) as never)
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'x' }) as never)
  const r = await $.tool.call(run([{ tool: 'Glob', pattern: '*' }]))
  expect(String((r as { text?: string }).text)).toContain('#0 Glob\nx')
})
