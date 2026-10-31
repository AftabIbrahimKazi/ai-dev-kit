// Pure rules for the design-audit-offer mod, unit-tested without the host.
export const UI_FILE = /\.(html?|css|scss|sass|less|vue|svelte|astro|tsx|jsx|liquid)$/i
export const SOURCES = ['DESIGN.md', 'design.md', 'project-context/design/INDEX.md', 'project-context/design/figma.md', '.hallmark/brand-spec.md']
export const OFFER_AT = 2

export type State = { files: string[]; offered: boolean }
export const fresh = (): State => ({ files: [], offered: false })

export const NOTE =
  '[kit] UI files changed in a project with a design source. End your reply with one line: "Want a UI/UX audit against the design standards?" Do not audit or change the design unless the user says yes.'

const SKIP = ['node_modules', 'dist', 'build', '.git', 'handover']
export function isUiFile(path: string): boolean {
  const parts = path.split(String.fromCharCode(92)).join('/').split('/')
  return !parts.some((p) => SKIP.includes(p)) && UI_FILE.test(path)
}

// Records one edited file. Returns true when the offer is due: the second distinct UI file edit, once per session.
export function noteUiEdit(s: State, path: string): boolean {
  if (s.offered || !isUiFile(path)) return false
  if (!s.files.includes(path)) s.files.push(path)
  return s.files.length >= OFFER_AT
}
