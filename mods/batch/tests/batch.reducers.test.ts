import { test, expect } from 'claude-code/testing'

const run = (ops: unknown[]) => ({ tool: 'mcp__batch__run', ops }) as never
const msg = (r: unknown) => String((r as { text?: string; deny?: string }).text ?? (r as { deny?: string }).deny ?? '')
const num = (lines: string[]) => lines.map((l, i) => `${i + 1}\t${l}`).join('\n')

test('map returns path | lines | purpose for every glob match in one op', async ($, on) => {
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: 'a.js\nsub/b.js' }) as never)
  on('tool.call', { tool: 'Read' }, (_, e) => {
    const f = String((e as { file_path?: string }).file_path)
    const body = f.endsWith('a.js') ? ['"use strict";', '// Alpha does one thing.', '// Second line.', 'x'] : ['// Beta.', 'y', 'z']
    return { result: 'r', text: num(body) } as never
  })
  const text = msg(await $.tool.call(run([{ tool: 'Map', path: '/root', pattern: '**/*.js' }])))
  expect(text).toContain('#0 Map 2 files')
  expect(text).toContain('a.js | 4 | Alpha does one thing. Second line.')
  expect(text).toContain('sub/b.js | 3 | Beta.')
})

test('map needs a path and caps the file count', async ($, on) => {
  on('tool.call', { tool: 'Glob' }, () => ({ result: 'g', text: Array.from({ length: 50 }, (_, i) => `f${i}.js`).join('\n') }) as never)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: num(['// p', '// q']) }) as never)
  expect(msg(await $.tool.call(run([{ tool: 'Map', pattern: '*' }])))).toContain('REFUSED')
  const text = msg(await $.tool.call(run([{ tool: 'Map', path: '/r', pattern: '*', maxFiles: 3 }])))
  expect(text).toContain('[+47 more files]')
})

test('symbols and headings pull declarations and outlines', async ($, on) => {
  on('tool.call', { tool: 'Read' }, (_, e) => {
    const f = String((e as { file_path?: string }).file_path)
    const body = f.endsWith('.md')
      ? ['---', 'description: Does X', '---', '# Title', 'text', '## Part']
      : ['exports.run = run;', 'export async function go() {}', 'const q = 1', 'if (x) {}', 'class A {}']
    return { result: 'r', text: num(body) } as never
  })
  const text = msg(
    await $.tool.call(
      run([
        { tool: 'Read', file_path: '/a.ts', symbols: true },
        { tool: 'Read', file_path: '/a.md', headings: true },
      ]),
    ),
  )
  expect(text).toContain('exports.run = run;\nexport async function go() {}\nconst q = 1\nclass A {}')
  expect(text).not.toContain('if (x)')
  expect(text).toContain('description: Does X\n# Title\n## Part')
})

test('only that matches nothing falls back to the header', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'r', text: num(['"use strict";', '// Purpose here.', '// More.', 'code']) }) as never)
  const text = msg(await $.tool.call(run([{ tool: 'Read', file_path: '/a', only: 'zzz' }])))
  expect(text).toContain('[no line matched in 4 lines read; header follows]\n// Purpose here.\n// More.')
})
