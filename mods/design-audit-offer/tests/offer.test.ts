import { expect, test } from 'claude-code/testing'
import { fresh, isUiFile, noteUiEdit, NOTE } from '../hooks/offer'

test('only UI files count, and vendored or build folders are skipped', () => {
  expect(isUiFile('public/index.html')).toBe(true)
  expect(isUiFile('src/App.tsx')).toBe(true)
  expect(isUiFile('src/server.js')).toBe(false)
  expect(isUiFile('node_modules/x/a.css')).toBe(false)
  expect(isUiFile('dist/a.css')).toBe(false)
})

test('the offer is due at the second distinct UI file, once per session', () => {
  const s = fresh()
  expect(noteUiEdit(s, 'a.css')).toBe(false)
  expect(noteUiEdit(s, 'a.css')).toBe(false) // same file again is not a second file
  expect(noteUiEdit(s, 'src/server.js')).toBe(false) // not UI
  expect(noteUiEdit(s, 'b.html')).toBe(true)
  s.offered = true
  expect(noteUiEdit(s, 'c.css')).toBe(false)
})

test('the note asks for an offer and forbids acting unasked', () => {
  expect(NOTE).toContain('Want a UI/UX audit')
  expect(NOTE).toContain('unless the user says yes')
})
