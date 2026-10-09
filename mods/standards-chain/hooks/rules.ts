// Pure rules for standards-chain: which coding-standards files must be read before a given file is edited.
// The layering and the role names come from coding-standards/index.md (File-to-Role Mapping). This file only
// guesses a role from the path; when it is not sure it asks for layer 1 and leaves the role to the model.
export type Std = 'js' | 'ts' | 'js-and-ts'
export type Config = { mode?: 'deny' | 'off'; dir?: string; script?: Std; frameworks?: string[]; ignore?: string[] }
export type Chain = { files: string[]; role: string | null }

const BACK = String.fromCharCode(92)
export const norm = (p: string) => p.split(BACK).join('/')

const CSS = /\.(css|scss|sass|less|pcss)$/i
const HTML = /\.(html?|astro)$/i
const JS = /\.(js|jsx|mjs|cjs)$/i
const TS = /\.(ts|tsx|mts|cts)$/i
const SKIP = /(^|\/)(node_modules|dist|build|vendor|\.git|\.claude|handover|\.next|\.astro)\//i

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
  } else {
    return null
  }
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
  const role = chain.role
    ? ` Role guessed from the path: ${chain.role.replace(/-/g, ' ')}.`
    : ' Role not clear from the path: after index.md, pick it in the File-to-Role table and read that partial too.'
  return `standards-chain: read these with Read before editing ${rel}, then retry: ${list}.${role} Off: disable the mod in /plugin, or set {"mode":"off"} in .claude/standards-chain.json.`
}
