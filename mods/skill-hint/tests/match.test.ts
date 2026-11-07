import { expect, test } from 'claude-code/testing'
import { DEFAULT_RULES, hintFor, matchSkills, mergeRules } from '../hooks/match'

test('keywords match whole words, prefixes and phrases, case-insensitively', () => {
  expect(matchSkills('The build is Broken again', DEFAULT_RULES)).toContain('debug-protocol')
  expect(matchSkills('it crashes on start', DEFAULT_RULES)).toContain('debug-protocol')
  expect(matchSkills('it is not working', DEFAULT_RULES)).toContain('debug-protocol')
  expect(matchSkills('add a button', DEFAULT_RULES)).toEqual([])
  expect(matchSkills('debugging', DEFAULT_RULES)).not.toContain('debug-protocol') // "bug" inside a word is not a hit
})

test('one line, once per skill per session, at most two skills', () => {
  const seen = new Set<string>()
  const first = hintFor('the app crashes, please refactor it all and check tokens', DEFAULT_RULES, null, seen)
  expect(first).toContain('debug-protocol')
  expect(first).toContain('plan-first')
  expect(first).not.toContain('session-budget') // third match is held back
  expect(hintFor('crash again', DEFAULT_RULES, null, seen)).toBeNull() // already hinted
  expect(hintFor('what about tokens', DEFAULT_RULES, null, seen)).toContain('session-budget')
})

test('an archived skill is named with the /unarchive command and is not claimed as active', () => {
  const rules = mergeRules(DEFAULT_RULES, { skills: { 'perf-audit': ['slow', 'perf*'], 'ui-design': { triggers: ['theme'] } } })
  const manifest = { skills: { 'debug-protocol': {} }, archived: { 'perf-audit': {} } }
  const line = hintFor('the page is slow and the build failed', rules, manifest, new Set())
  expect(line).toContain('may need debug-protocol')
  expect(line).toContain('perf-audit is archived')
  expect(line).toContain('/unarchive perf-audit')
})

test('a skill that is not installed in a project with a manifest gets no hint', () => {
  const manifest = { skills: { 'plan-first': {} }, archived: {} }
  expect(hintFor('please debug this error', DEFAULT_RULES, manifest, new Set())).toBeNull()
})

test('the project skill-scope triggers extend the defaults', () => {
  const rules = mergeRules(DEFAULT_RULES, { skills: { 'security-audit': ['owasp'] } })
  expect(matchSkills('check owasp top ten', rules)).toEqual(['security-audit'])
  expect(Object.keys(rules)).toContain('debug-protocol')
})
