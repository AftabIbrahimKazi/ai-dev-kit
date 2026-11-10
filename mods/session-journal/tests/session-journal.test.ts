import { expect, test } from 'claude-code/testing'
import { digest, relTo, scrub } from '../hooks/register'

test('relTo strips the project root, Windows or POSIX, and leaves outside paths alone', () => {
  expect(relTo('C:\\work\\app', 'C:\\work\\app\\src\\a.ts')).toBe('src/a.ts')
  expect(relTo('c:/work/app/', 'C:/work/app/src/a.ts')).toBe('src/a.ts')
  expect(relTo('/home/u/app', '/home/u/app/src/a.ts')).toBe('src/a.ts')
  expect(relTo('/home/u/app', '/etc/hosts')).toBe('/etc/hosts')
  expect(relTo('', 'src/a.ts')).toBe('src/a.ts')
})

const line = (o: object) => JSON.stringify(o)
const entry = (ask: string, edited: string[] = [], cmds: string[] = []) => line({ t: 'x', ask, edited, reads: 0, cmds, failed: 0, said: '' })

test('digest lists edited files, failed commands and recent asks', () => {
  const d = digest([entry('fix the bug', ['src/a.js'], ['node --test', '!npm run build']), entry('add feature', ['src/b.js', 'src/a.js'])])
  expect(d).toContain('src/a.js, src/b.js')
  expect(d).toContain('npm run build')
  expect(d).toContain('fix the bug')
  expect(d).toContain('2 turns')
})

test('digest is empty when the journal is empty or damaged', () => {
  expect(digest([])).toBe('')
  expect(digest(['not json', '{broken'])).toBe('')
})

test('digest is capped', () => {
  const many = Array.from({ length: 60 }, (_, i) => entry('request number ' + i + ' '.repeat(100), ['src/file' + i + '.js']))
  expect(digest(many, 600).length).toBeLessThanOrEqual(600)
})

test('scrub removes keys, bearer tokens and key=value secrets', () => {
  const dirty = 'curl -H "Authorization: Bearer abc.def.ghi" sk-abcdefghijklmnop ghp_abcdefghijklmnop1234 password=hunter2 ok'
  const clean = scrub(dirty)
  expect(clean).not.toContain('abc.def.ghi')
  expect(clean).not.toContain('sk-abcdefghijklmnop')
  expect(clean).not.toContain('ghp_abcdefghijklmnop1234')
  expect(clean).not.toContain('hunter2')
  expect(clean).toContain('ok')
})
