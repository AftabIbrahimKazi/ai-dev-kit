import { test, expect } from 'claude-code/testing'

const run = (ops: unknown[]) => ({ tool: 'mcp__batch__run', ops }) as never
const msg = (r: unknown) => String((r as { text?: string; deny?: string }).text ?? (r as { deny?: string }).deny ?? '')

test('refuses non read-only tools', async ($) => {
  const r = await $.tool.call(run([{ tool: 'Bash', command: 'ls' }]))
  expect(msg(r)).toContain('read-only')
})

test('refuses empty and oversized batches', async ($) => {
  expect(msg(await $.tool.call(run([])))).toContain('non-empty')
  expect(msg(await $.tool.call(run(Array(26).fill({ tool: 'Glob', pattern: '*' }))))).toContain('at most')
})

test('returns one ordered digest, clipped', async ($, on) => {
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'a.ts\nb.ts' }) as never)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: 'x'.repeat(9000) }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Glob', pattern: '*.ts' }, { tool: 'Read', file_path: '/a' }])))
  expect(text).toContain('#0 Glob\na.ts\nb.ts')
  expect(text).toContain('#1 Read')
  expect(text).toContain('[truncated')
})

test('reducers shape results before they return', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: '1\t#!/x\n2\t// purpose\n3\tcode\n4\t// more' }) as never)
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'a\nb\nc' }) as never)
  const text = msg(await $.tool.call(run([
    { tool: 'Read', file_path: '/a', only: '^//', maxLines: 1 },
    { tool: 'Glob', pattern: '*', count: true },
  ])))
  expect(text).toContain('#0 Read\n// purpose\n[+1 more lines]')
  expect(text).toContain('#1 Glob\n3')
  expect(text).not.toContain('code')
})

test('a failing lookup is reported in place, others still return', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => { throw new Error('boom') })
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'ok' }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a' }, { tool: 'Glob', pattern: '*' }])))
  expect(text).toContain('#1 Glob\nok')
  expect(text).toMatch(/#0 Read (FAILED|ERROR)/)
})

test('refuses an over-long regex', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: 'x' }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', only: 'a'.repeat(201) }])))
  expect(text).toContain('REFUSED')
})

test('an empty match says so instead of returning nothing', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: '1\tcode\n2\tmore' }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', only: '^//' }])))
  expect(text).toContain('[no line matched in 2 lines read')
})

const boiler = ['#!/usr/bin/env node', '"use strict";', 'var __x = 1;', ...Array(30).fill('    o[k2] = m[k];')]

test('header finds the purpose comment past boilerplate and ignores limit', async ($, on) => {
  const body = [...boiler, '// Stop hook: blocks a turn.', '// Fails open.', 'const a = 1;'].map((l, i) => `${i + 1}\t${l}`).join('\n')
  let seen: unknown
  on('tool.call', { tool: 'Read' }, (_, e) => { seen = e; return { result: 'r', text: body } as never })
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', limit: 12, header: true }])))
  expect(text).toContain('#0 Read\n// Stop hook: blocks a turn.\n// Fails open.')
  expect(text).not.toContain('const a')
  expect(JSON.stringify(seen)).not.toContain('limit')
})

test('header with no comment says so; header on Glob is ignored', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: '1\tcode\n2\tmore' }) as never)
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'a\nb' }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', header: true }, { tool: 'Glob', pattern: '*', header: true }])))
  expect(text).toContain('[no header comment in first 200 lines]')
  expect(text).toContain('#1 Glob\na\nb')
})

test('header ignores sourcemap comments and caps lines', async ($, on) => {
  const body = ['//# sourceMappingURL=x.map', '// a', '// b', '// c'].map((l, i) => `${i + 1}\t${l}`).join('\n')
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: body }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', header: true, maxLines: 2 }])))
  expect(text).toContain('#0 Read\n// a\n// b')
  expect(text).not.toContain('sourceMapping')
  expect(text).not.toContain('// c')
})
