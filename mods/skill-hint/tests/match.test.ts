import { expect, test } from 'claude-code/testing'
import { DEFAULT_RULES, hintFor, matchSkills, mergeRules, scriptFor } from '../hooks/match'

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

test('plain-language prompts match the new audit, asset, memory and context rules', () => {
  const m = (t: string) => matchSkills(t, DEFAULT_RULES)
  expect(m('please audit the project against our standards')).toContain('code-audit')
  expect(m('do a security review and map the attack surface')).toContain('security-audit')
  expect(m('prune memory, the notes are stale notes now')).toContain('memory-gardener')
  expect(m('compress images to webp')).toContain('optimize-assets')
  expect(m('read the figma export into design docs')).toContain('project-context')
  expect(m('check my staged changes before commit')).toContain('pre-commit')
  expect(m('stop tracking the .env file')).toContain('untrack')
  expect(m('draw a diagram of the system')).toContain('diagram')
})

test('common words in unrelated text do not trigger the new rules', () => {
  const m = (t: string) => matchSkills(t, DEFAULT_RULES)
  expect(m('add an audit log column to the users table')).toEqual([])
  expect(m('write the recipe for the reconciliation job')).toEqual([])
  expect(m('rename the memory variable and fix the image tag')).toEqual([])
})

test('each new script run is read-only, once per session, installed skills only', () => {
  const rules = mergeRules(DEFAULT_RULES, null)
  const cases: [string, string, string][] = [
    ['audit the project', 'code-audit', 'audit.js'],
    ['map the attack surface', 'security-audit', 'recon.js'],
    ['prune memory', 'memory-gardener', 'stale.js'],
    ['compress images', 'optimize-assets', 'convert.js'],
    ['read the figma export', 'project-context', 'scan.js'],
  ]
  for (const [text, skill, script] of cases) {
    const ran = new Set<string>()
    const manifest = { skills: { [skill]: {} } }
    const run = scriptFor(text, rules, manifest, ran)
    expect(run?.skill).toBe(skill)
    expect(run?.script).toBe(script)
    expect(run?.args.join(' ')).not.toMatch(/(^|\s)(convert|compress|--to|--write|--force|--out|init|add|stamp|install)(\s|$)/)
    expect(scriptFor(text, rules, manifest, ran)).toBeNull()
    expect(scriptFor(text, rules, { skills: {}, archived: { [skill]: {} } }, new Set())).toBeNull()
  }
})

test('scriptFor runs a listed script only for an installed, active skill, once per session', () => {
  const rules = mergeRules(DEFAULT_RULES, null)
  const ran = new Set<string>()
  expect(scriptFor('the site is slow', rules, null, ran)).toBeNull() // no manifest: nothing installed
  expect(scriptFor('the site is slow', rules, { skills: {}, archived: { 'perf-audit': {} } }, ran)).toBeNull() // archived: script not in place
  const run = scriptFor('the site is slow', rules, { skills: { 'perf-audit': {} } }, ran)
  expect(run?.skill).toBe('perf-audit')
  expect(run?.script).toBe('weigh.js')
  expect(scriptFor('still slow', rules, { skills: { 'perf-audit': {} } }, ran)).toBeNull() // once per session
  expect(scriptFor('add a button', rules, { skills: { 'perf-audit': {} } }, new Set())).toBeNull()
})
