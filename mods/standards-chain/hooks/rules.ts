// Pure rules for standards-chain: which coding-standards files must be read before a given file is edited.
// The layering and the role names come from coding-standards/index.md (File-to-Role Mapping). This file only
// guesses a role from the path; when it is not sure it asks for layer 1 and leaves the role to the model.
export type Std = 'js' | 'ts' | 'js-and-ts'
export type Config = { mode?: 'deny' | 'off'; dir?: string; script?: Std; frameworks?: string[]; ignore?: string[]; company?: boolean; ui?: boolean }
export type Chain = { files: string[]; role: string | null }

const BACK = String.fromCharCode(92)
export const norm = (p: string) => p.split(BACK).join('/')

const CSS = /\.(css|scss|sass|less|pcss)$/i
const HTML = /\.(html?|astro)$/i
const JS = /\.(js|jsx|mjs|cjs)$/i
const TS = /\.(ts|tsx|mts|cts)$/i
// Path keyword -> ui-standards partial (coding-standards/ui-standards/<name>.md). First two matches win, so a path
// that names two elements reads two small partials, never the whole folder. Order is most specific first.
const UI_ROUTES: [RegExp, string][] = [
  [/(^|[^a-z0-9])(button|btn)s?([^a-z0-9]|$)/, 'button'],
  [/(^|[^a-z0-9])(stepper|wizard|onboarding)s?([^a-z0-9]|$)/, 'stepper'],
  [/(^|[^a-z0-9])(modal|dialog|drawer)s?([^a-z0-9]|$)/, 'modal-drawer'],
  [/(^|[^a-z0-9])(pinned|menu-search)s?([^a-z0-9]|$)/, 'sidebar.ref'],
  [/(^|[^a-z0-9])(sidebar|side-?nav|rail)s?([^a-z0-9]|$)/, 'sidebar'],
  [/(^|[^a-z0-9])(page-?header|page-?title|page-?actions)s?([^a-z0-9]|$)/, 'page-header'],
  [/(^|[^a-z0-9])(menu|popover|tooltip|dropdown)s?([^a-z0-9]|$)/, 'menu-tooltip'],
  [/(^|[^a-z0-9])(tab|tabs|accordion|segmented)([^a-z0-9]|$)/, 'tabs-accordion'],
  [/(^|[^a-z0-9])(card|badge|chip|tag|avatar|kpi)s?([^a-z0-9]|$)/, 'card-badge'],
  [/(^|[^a-z0-9])(table|datagrid|data-grid|record-list)s?([^a-z0-9]|$)/, 'table'],
  [/(^|[^a-z0-9])(filter|search)s?([^a-z0-9]|$)/, 'filters'],
  [/(^|[^a-z0-9])(upload|attachment|dropzone|file-?input)s?([^a-z0-9]|$)/, 'upload'],
  [/(^|[^a-z0-9])(image|img|photo|thumbnail|gallery|lightbox)s?([^a-z0-9]|$)/, 'image'],
  [/(^|[^a-z0-9])(loading|skeleton|spinner|empty|offline|error|not-found|404|403|500)s?([^a-z0-9]|$)/, 'states'],
  [/(^|[^a-z0-9])(toast|snackbar|alert|banner|flash|notification|confirm|feedback)s?([^a-z0-9]|$)/, 'feedback'],
  [/(^|[^a-z0-9])(app-?header|top-?bar|header|tenant-switcher|account-menu)s?([^a-z0-9]|$)/, 'header'],
  [/(^|[^a-z0-9])(nav|navbar|breadcrumb)s?([^a-z0-9]|$)/, 'nav'],
  [/(^|[^a-z0-9])(flyout|submenu|nav-drawer|action-sheet)s?([^a-z0-9]|$)/, 'nav.ref'],
  [/(^|[^a-z0-9])(pwa|offline-page|install-prompt|service-?worker)s?([^a-z0-9]|$)/, 'pwa'],
  [/(^|[^a-z0-9])(mobile|native|bottom-nav|app-bar|safe-area)([^a-z0-9]|$)/, 'mobile'],
  [/(^|[^a-z0-9])(theme-?customi[sz]er|customi[sz]er)s?([^a-z0-9]|$)/, 'customizer'],
  [/(^|[^a-z0-9])(theme|theming|dark|dark-mode|appearance|color-scheme)s?([^a-z0-9]|$)/, 'theming'],
  [/(^|[^a-z0-9])(landing|marketing|pricing|hero|consent|cookie-banner|signup-page)s?([^a-z0-9]|$)/, 'landing'],
  [/(^|[^a-z0-9])(chart|graph|dashboard)s?([^a-z0-9]|$)/, 'charts'],
  [/(^|[^a-z0-9])(export|report|csv|xlsx|pdf)s?([^a-z0-9]|$)/, 'export'],
  [/(^|[^a-z0-9])(login|signin|sign-in|signup|sign-up|register|password|auth|two-factor|2fa|session)s?([^a-z0-9]|$)/, 'auth'],
  [/(^|[^a-z0-9])(select|multi-?select|combobox|dropdown-?select)s?([^a-z0-9]|$)/, 'select'],
  [/(^|[^a-z0-9])(date|datetime|date-?picker|date-?range|calendar|time-?picker)s?([^a-z0-9]|$)/, 'date'],
  [/(^|[^a-z0-9])(input|field|checkbox|radio|switch|textarea)s?([^a-z0-9]|$)/, 'fields'],
  [/(^|[^a-z0-9])forms?([^a-z0-9]|$)/, 'forms'],
]
const PWA_FILE = /(^|\/)(manifest\.(webmanifest|json)|sw\.[jt]s|service-?worker\.[jt]s)$/
const NATIVE_EXT = /\.(dart|kt|swift)$/
const UI_SCRIPT_DIR =/(^|\/)(components?|pages?|views?|ui|screens?)\//
const PAGE_DIR = /(^|\/)(pages?|views?|screens?|routes?)\//
// Basename ends in a plural noun (invoices, users, purchase-orders) but not a word that merely ends in s (settings, status, address, index, analytics).
const PLURAL_WORD = /[a-z0-9]{2}s\.[a-z]+$/
const NOT_PLURAL = /(ss|us|is)\.[a-z]+$|(^|\/)(settings|analytics|news|pricing|terms|credits|notifications|preferences)\.[a-z]+$/
const PLURAL_PAGE = { test: (p: string) => PLURAL_WORD.test(p) && !NOT_PLURAL.test(p) }

// Partials for a UI-like file, or []. camelCase is split first so DataTable.tsx reads as data-table.
export function uiPartials(rel: string): string[] {
  const low = rel.toLowerCase()
  if (PWA_FILE.test(low)) return ['pwa'] // a manifest or service worker is never in a components folder
  const native = NATIVE_EXT.test(low)
  const ui = native || CSS.test(low) || HTML.test(low) || /\.(jsx|tsx|vue|svelte)$/.test(low) || ((JS.test(low) || TS.test(low)) && UI_SCRIPT_DIR.test(low))
  if (!ui) return []
  const key = rel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_.]/g, '-').toLowerCase()
  const out: string[] = native ? ['mobile'] : []
  for (const [re, name] of UI_ROUTES) if (re.test(key) && !out.includes(name)) out.push(name)
  // A sign-in, reset or sign-up page is a form: its inputs follow the field rules (auth first, then fields).
  if (out.includes('auth') && !out.includes('fields') && !out.includes('forms')) out.splice(out.indexOf('auth') + 1, 0, 'fields')
  // A page named for a plural entity (pages/invoices.html) is a list page: nothing in the name says "table", the folder and the plural do.
  if (!out.length && PAGE_DIR.test(low) && PLURAL_PAGE.test(low)) out.push('table')
  return out.slice(0, 2)
}

const COMPANY_EXT =/\.(php|vue|svelte|dart|kt|swift|erb|twig|liquid)$/i
const SKIP =/(^|\/)(node_modules|dist|build|vendor|\.git|\.claude|handover|project-context|\.next|\.astro)\//i

export function globToRegExp(g: string): RegExp {
  const s = norm(g)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
    .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*')
  return new RegExp('(^|/)' + s + '$')
}

// Path relative to the project, or null when it is outside it.
export function relTo(cwd: string, p: string): string | null {
  const c = norm(cwd).replace(/\/+$/, '')
  const f = norm(p)
  if (f.toLowerCase().startsWith(c.toLowerCase() + '/')) return f.slice(c.length + 1)
  if (/^([a-z]:)?\//i.test(f)) return null
  return f.replace(/^\.\//, '')
}

// 'js-and-ts' / 'ts' / 'js' when exactly one script standard is named in the session-protocol text.
export function declaredStd(text: string): Std | undefined {
  if (/js-and-ts-standards/i.test(text)) return 'js-and-ts'
  const ts = /(^|[^-\w])ts-standards/i.test(text)
  const js = /(^|[^-\w])js-standards/i.test(text)
  return ts && !js ? 'ts' : js && !ts ? 'js' : undefined
}

function cssRole(rel: string, base: string): string | null {
  if (/(token|variable|theme|palette|colou?rs?)/.test(base)) return 'token-files'
  if (/layout/.test(base)) return 'layout-files'
  if (/(modal|drawer|overlay|dialog)/.test(base)) return 'overlay-files'
  if (/(^|[-_.])(utils?|utilit(y|ies)|helpers?|atomic)([-_.]|$)/.test(base)) return 'utility-files'
  if (/(^|\/)components?\//.test(rel)) return 'component-files'
  return null
}

function htmlRole(rel: string, base: string): string | null {
  if (/(^|\/)layouts?\//.test(rel) || /^layout/.test(base)) return 'layout-templates'
  if (/(^|\/)pages?\//.test(rel)) return 'page-files'
  if (/(^|\/)components?\//.test(rel)) return 'component-files'
  return null
}

function scriptRole(rel: string, base: string, std: Std): string | null {
  if (std !== 'js' && (/\.d\.ts$/i.test(rel) || /^types?$/.test(base) || /(^|\/)types\//.test(rel))) return 'type-files'
  if (/orchestrator/.test(base)) return 'orchestrator-files'
  if (/controller/.test(base)) return 'controller-files'
  if (/preset/.test(base)) return 'preset-files'
  if (/(^|[-_.])(utils?|utilit(y|ies)|helpers?)([-_.]|$)/.test(base) || /(^|\/)(utils|helpers)\//.test(rel)) return 'utility-files'
  if (/^(main|entry|bootstrap|app)$/.test(base)) return 'entry-files'
  if (/(engine|class)$/.test(base)) return 'class-files'
  return null
}

// The standards files to read before editing `rel` (paths relative to the standards folder), or null when
// the file has no standard (other languages, generated folders, the standards themselves).
export function chainFor(rel: string, cfg: Config = {}, declared?: Std): Chain | null {
  const dir = norm(cfg.dir ?? 'coding-standards').replace(/\/+$/, '')
  const low = rel.toLowerCase()
  if (SKIP.test(low) || low === dir.toLowerCase() || low.startsWith(dir.toLowerCase() + '/')) return null
  if (/\.min\.(js|css)$/.test(low) || (cfg.ignore ?? []).some((g) => globToRegExp(g).test(rel))) return null
  const base = (low.split('/').pop() ?? '').replace(/\.d\.ts$/, '').replace(/\.[^.]+$/, '')
  let files: string[]
  let role: string | null
  if (CSS.test(low)) {
    role = cssRole(low, base)
    files = ['index.md', 'css-standards.md', ...(role ? [`css-standards/${role}.md`] : [])]
  } else if (HTML.test(low)) {
    role = htmlRole(low, base)
    files = ['index.md', 'html-standards.md', ...(role ? [`html-standards/${role}.md`] : [])]
  } else if (JS.test(low) || TS.test(low)) {
    const std: Std = cfg.script ?? declared ?? (TS.test(low) ? 'ts' : 'js')
    role = scriptRole(low, base, std)
    files = ['index.md', `${std}-standards.md`, ...(role ? [`${std}-standards/${role}.md`] : [])]
  } else if (cfg.ui !== false && (/\.(vue|svelte|dart|kt|swift)$/.test(low) || /\.(webmanifest|json)$/.test(low)) && uiPartials(rel).length) {
    role = null // no discipline standard covers these file types: only the element rules apply
    files = []
  } else if (cfg.company && COMPANY_EXT.test(low)) {
    role = null // company-only: other UI file types still owe the company index
    files = []
  } else {
    return null
  }
  // Element rules: the routing file plus the one or two partials the path names. Nothing when no element is named.
  const ui = cfg.ui === false ? [] : uiPartials(rel)
  if (ui.length) files.push('ui-standards.md', ...ui.map((p) => `ui-standards/${p}.md`))
  // Company standards (coding-standards/company/INDEX.md, written by install-kit) route to the company's own files.
  if (cfg.company) files.push('company/INDEX.md')
  const fw = new Set((cfg.frameworks ?? []).map((f) => f.toLowerCase()))
  if (/\.astro$/.test(low)) fw.add('astro')
  for (const f of fw) files.push(`frameworks/${f}.md`)
  return { files, role }
}

// Chain files not yet read. `reads` holds normalised absolute paths of files the model has read.
export function missing(files: string[], reads: Iterable<string>, cfg: Config = {}): string[] {
  const dir = norm(cfg.dir ?? 'coding-standards').replace(/\/+$/, '').toLowerCase()
  const have = [...reads].map((r) => norm(r).toLowerCase())
  return files.filter((f) => !have.some((r) => r.endsWith(`/${dir}/${f.toLowerCase()}`)))
}

export function denyMessage(rel: string, chain: Chain, todo: string[], cfg: Config = {}): string {
  const dir = norm(cfg.dir ?? 'coding-standards').replace(/\/+$/, '')
  const list = todo.map((f) => `${dir}/${f}`).join(', ')
  const role = !chain.files.includes('index.md')
    ? ''
    : chain.role
    ? ` Role guessed from the path: ${chain.role.replace(/-/g, ' ')}.`
    : ' Role not clear from the path: after index.md, pick it in the File-to-Role table and read that partial too.'
  return `standards-chain: read these with Read before editing ${rel}, then retry: ${list}.${role} Off: disable the mod in /plugin, or set {"mode":"off"} in .claude/standards-chain.json.`
}
