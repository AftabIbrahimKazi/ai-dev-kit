import { expect, test } from 'claude-code/testing'
import { candidates, note, MAX_CHARS } from '../hooks/rules'

test('a plain skill name maps to the project roots and the user root', () => {
  const c = candidates('plan-first', ['C:', 'Users', 'a'].join(String.fromCharCode(92)))
  expect(c[0]).toBe('.claude/skills/plan-first/learnings.md')
  expect(c[c.length - 1]).toBe('C:/Users/a/.claude/skills/plan-first/learnings.md')
})

test('a name with path characters gets no candidates', () => {
  expect(candidates('../x', '').length).toBe(0)
})

test('an empty file adds nothing', () => {
  expect(note('s', '  \n')).toBeNull()
})

test('a long file is trimmed with a pointer to the rest', () => {
  const n = note('s', 'x'.repeat(MAX_CHARS + 50)) as string
  expect(n).toContain('[trimmed')
})
