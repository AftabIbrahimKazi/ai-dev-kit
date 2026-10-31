import { expect, test } from 'claude-code/testing'
import { check, COMPACTED, expectedMarker, hasMarker, notice } from '../hooks/marker'

const bare = '# CLAUDE.md\n1. Begin every response with `[CX]`\n| Context code | [2-4 chars you choose] |\n'
const coded = '1. Begin every response with `[CX <Context code>]`\n| Context code | X7 |\n'

test('the expected marker follows the Context code row, and a placeholder row does not count', () => {
  expect(expectedMarker(bare)).toBe('[CX]')
  expect(expectedMarker(coded)).toBe('[CX X7]')
  expect(expectedMarker('no protocol here')).toBeNull()
})

test('a reply that starts with the marker passes, even after leading whitespace', () => {
  expect(hasMarker('[CX X7] done', '[CX X7]')).toBe(true)
  expect(hasMarker('\n[CX] done', '[CX]')).toBe(true)
  expect(hasMarker('[CX] done', '[CX X7]')).toBe(false) // wrong code
})

test('a missing or wrong marker gets a warning line, not a copy of the reply', () => {
  const out = check(coded, 'Added the footer.')
  expect(out).toContain('missing [CX X7]')
  expect(out).not.toContain('Added the footer.')
  expect(check(coded, '[CX X7] Added the footer.')).toBeNull()
})

test('it stays silent without a protocol, with no marker defined, or on an empty reply', () => {
  expect(check(null, 'hello')).toBeNull()
  expect(check('no marker defined', 'hello')).toBeNull()
  expect(check(bare, '   ')).toBeNull()
})

test('after a compaction the notice shows once, with or without the marker, and only under a protocol', () => {
  expect(notice(coded, '[CX X7] ok', true)).toBe(COMPACTED)
  expect(notice(coded, 'ok', true)).toContain('missing [CX X7]')
  expect(notice(coded, 'ok', true)).toContain('compacted')
  expect(notice(coded, '[CX X7] ok', false)).toBeNull()
  expect(notice(null, 'ok', true)).toBeNull()
})
