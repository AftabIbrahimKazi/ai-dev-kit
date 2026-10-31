// Pure rules for the aiignore-guard mod: no host calls, so they are unit-tested directly.
// The same .aiignore syntax as the code-audit engine (skills/standards/code-audit.audit.ts, readAiIgnore):
// "#" comments and blank lines are skipped, "dir/" means everything under dir, a leading "/" is dropped, "!" is not supported.
// Never match paths under handover/: lane coordination there belongs to the model-driven claim protocol.
const SEP = String.fromCharCode(92)
export const norm = (p: string): string => p.split(SEP).join('/')

export function parseAiIgnore(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .map((l) => norm(l).replace(/^\//, '').replace(/\/$/, '/**'))
}

export function globToRegExp(glob: string): RegExp {
  const esc = norm(glob).replace(/[.+^${}()|[\]]/g, (c) => SEP + c)
  const g = esc
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0002')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0002/g, '.*')
  return new RegExp('(^|/)' + g + '$')
}

// A path relative to the project root, or null when it points outside the project.
export function relativeTo(cwd: string, path: string): string | null {
  const p = norm(path).replace(/^\.\//, '')
  const root = norm(cwd).replace(/\/$/, '')
  if (/^([a-z]:)?\//i.test(p)) {
    if (p.toLowerCase() === root.toLowerCase()) return ''
    return p.toLowerCase().startsWith(root.toLowerCase() + '/') ? p.slice(root.length + 1) : null
  }
  return p.startsWith('../') ? null : p
}

const protocol = (what: 'path' | 'command'): string =>
  ' Reading it is a last resort. If the task needs it: list the file names under that path with Glob,' +
  ` call the prefilter tool with the task and those names, open what it ranks first, and retry this exact ${what} once. It will go through on the retry.`

// The project-relative path when `path` is listed in .aiignore, else null. `dir` marks Grep/Glob and shell words,
// which may name a folder (so "dist" matches "dist/**").
function matchIgnored(path: string, cwd: string, globs: string[], dir: boolean): string | null {
  if (globs.length === 0 || !path) return null
  const rel = relativeTo(cwd, path)
  if (rel === null || /^handover(\/|$)/.test(rel)) return null
  const forms = dir ? [rel, rel.replace(/\/$/, '') + '/'] : [rel]
  return globs.some((g) => { const re = globToRegExp(g); return forms.some((f) => re.test(f)) }) ? rel : null
}

// The reason to block, or null.
export function checkIgnored(path: string, cwd: string, globs: string[], dir = false): string | null {
  const rel = matchIgnored(path, cwd, globs, dir)
  return rel === null ? null : `${rel || '.'} is hidden from the AI by .aiignore.${protocol('path')}`
}

// The reason to block a shell command that mentions a listed path, or null. Words are split on whitespace, quotes and shell
// operators; a word that is a listed file or folder counts, so `cat vendor/x.js`, `cd vendor` and `type "C:\proj\vendor\x.js"` all match.
// A heuristic by design: a false match costs one denial, and the same command passes when it is tried again.
export function checkCommand(command: string, cwd: string, globs: string[]): string | null {
  if (!globs.length || !command) return null
  for (const word of norm(command).split(/[\s"'`;|&<>()=,]+/)) {
    if (!word || word.startsWith('-')) continue
    const rel = matchIgnored(word, cwd, globs, true)
    if (rel !== null) return `this command names ${rel || '.'}, which is hidden from the AI by .aiignore.${protocol('command')}`
  }
  return null
}

type SearchResult = { filenames?: unknown; content?: unknown; numFiles?: unknown; numLines?: unknown; numMatches?: unknown }

// "path:12:text" (a match), "path-12-text" (context) or "path:3" (a count). The drive colon of a Windows path is skipped.
function linePath(line: string): string | null {
  const drive = /^[A-Za-z]:/.test(line) ? 2 : 0
  const colon = /^(.+?):\d+(?::|$)/.exec(line.slice(drive))
  if (colon) return line.slice(0, drive) + colon[1]
  const dash = /^(.+?)-\d+-/.exec(line.slice(drive))
  return dash ? line.slice(0, drive) + dash[1] : null
}

// Drops ignored files from a Grep or Glob result. `hidden` counts the files or lines removed; 0 means the result is returned as it came.
// `globs` is the .aiignore list, or a predicate that says whether one result path is ignored (the layered check in register.ts).
export function filterSearchResult<T extends SearchResult>(result: T, cwd: string, globs: string[] | ((path: string) => boolean)): { result: T; hidden: number } {
  if (!result || typeof result !== 'object' || (Array.isArray(globs) && !globs.length)) return { result, hidden: 0 }
  const ignored = typeof globs === 'function' ? globs : (p: string): boolean => matchIgnored(p, cwd, globs, false) !== null
  let hidden = 0
  const out: SearchResult = { ...result }
  if (Array.isArray(result.filenames)) {
    const kept = (result.filenames as string[]).filter((f) => !ignored(f))
    hidden += result.filenames.length - kept.length
    out.filenames = kept
    if (typeof result.numFiles === 'number') out.numFiles = kept.length
  }
  if (typeof result.content === 'string') {
    const lines = result.content.split('\n')
    const kept = lines.filter((l) => { const p = linePath(l); return p === null || !ignored(p) })
    if (kept.length !== lines.length) {
      hidden += lines.length - kept.length
      // grep's "--" separates groups of context lines; once a group is gone, no separator may lead, trail or double up
      const tidy = kept.filter((l, i) => l !== '--' || (i > 0 && i < kept.length - 1 && kept[i - 1] !== '--'))
      out.content = tidy.join('\n')
      if (typeof result.numLines === 'number') out.numLines = kept.length
      if (typeof result.numMatches === 'number') out.numMatches = Math.max(0, result.numMatches - (lines.length - kept.length))
    }
  }
  return hidden ? { result: out as T, hidden } : { result, hidden: 0 }
}

export const hiddenNote = (n: number): string =>
  `aiignore-guard: ${n} result${n === 1 ? ' was' : 's were'} hidden because the path is in .aiignore. If the task needs ${n === 1 ? 'it' : 'them'}, follow the snag protocol in the code-audit skill.`

// ---- role and task layers ----
// Layers narrow what the AI should touch beyond .aiignore. Each one is denied once with its reason and the retry goes through;
// a role or task denial unlocks the whole top-level folder, so a wrong guess costs one extra call per folder, not per file.
export type Layers = {
  base: string[] // .aiignore
  role: string[] // the active role's "out" globs from conflict-roles.json
  mine: string[] // the active role's "in" globs
  others: string[] // every other role's "in" globs: a path they list and this role does not is theirs
  scope: string[] // a /focus or a board row's Files: when set, paths outside it are off-task
  off: string[] // folders Laya judged clearly irrelevant to the current prompt
}
export type RoleCfg = { in?: string[]; out?: string[] }
export const noLayers = (): Layers => ({ base: [], role: [], mine: [], others: [], scope: [], off: [] })
export type Hit = { layer: 'ignore' | 'role' | 'scope' | 'off'; rel: string; why: string; unlock?: string }

const topFolder = (rel: string): string => rel.split('/')[0] || rel
export const unlockKey = (hit: Hit, what: 'path' | 'command'): string => (hit.layer === 'ignore' ? `${what}:${hit.rel}` : `${hit.layer}:${hit.unlock ?? topFolder(hit.rel)}`)

// The literal start of a glob, up to its first wildcard: "src/styles/**" -> "src/styles/".
const literalPrefix = (g: string): string => g.slice(0, g.search(/[*?]/) < 0 ? g.length : g.search(/[*?]/))

const inScope = (rel: string, scope: string[], dir: boolean): boolean => {
  const forms = dir ? [rel, rel.replace(/\/$/, '') + '/'] : [rel]
  if (scope.some((g) => { const re = globToRegExp(g); return forms.some((f) => re.test(f)) })) return true
  // a folder that contains part of the scope is on the way to it
  return dir && scope.some((g) => { const p = literalPrefix(g); return p.startsWith(forms[1]) })
}

// Which layer, if any, says this path should be left alone. `dir`: Grep/Glob targets and shell words, which may name a folder.
export function classify(path: string, cwd: string, layers: Layers, dir = false): Hit | null {
  const rel = relativeTo(cwd, path)
  if (rel === null || !path || /^handover(\/|$)/.test(rel)) return null
  const out = (layer: Hit['layer'], globs: string[]): boolean => matchIgnored(path, cwd, globs, dir) !== null && globs.length > 0
  if (out('ignore', layers.base)) return { layer: 'ignore', rel, why: 'is hidden from the AI by .aiignore' }
  if (out('role', layers.role)) return { layer: 'role', rel, why: 'is outside the active role (conflict-roles.json)' }
  // files in the project root (README, configs) are never off-scope; folders always can be
  // another role's territory: a path one of the other roles lists under "in" that the active role does not list
  if (layers.others.length && out('role', layers.others) && !out('role', layers.mine)) return { layer: 'role', rel, why: 'belongs to another role (conflict-roles.json), not the active one' }
  if (layers.scope.length && rel !== '' && (dir || rel.includes('/')) && !inScope(rel, layers.scope, dir)) return { layer: 'scope', rel, why: 'is outside the current task scope' }
  if (out('off', layers.off)) return { layer: 'off', rel, why: 'looks unrelated to the current task' }
  return null
}

export const hitMessage = (hit: Hit, what: 'path' | 'command'): string =>
  `${what === 'command' ? `this command names ${hit.rel || '.'}, which` : `${hit.rel || '.'}`} ${hit.why}.${protocol(what)}`

// A role named in a prompt: "you are the frontend", "frontend session", "role: backend", "/role tester". Only configured role names match.
export function detectRole(text: string, names: string[]): string | null {
  for (const n of names) {
    const e = n.replace(/\W/g, (c) => SEP + c)
    // String.raw keeps \s and \b as regex escapes; in a plain template they would be a letter and a backspace
    const re = new RegExp(String.raw`(?:you are|you're|act as|work as|take)\s+(?:the |a |an )?${e}\b|\b${e}\s+(?:session|role|lane|dev|developer)\b|\brole\s*[:=]\s*${e}\b|^\s*/role\s+${e}\b`, 'i')
    if (re.test(text)) return n
  }
  return null
}

// "src/styles" or "src/styles/" or "api/**" -> globs. A folder-looking path (no extension) also matches everything under it.
export function pathsToGlobs(paths: string[]): string[] {
  const out: string[] = []
  for (const raw of paths) {
    const p = norm(raw.trim()).replace(/^\.\//, '').replace(/^`|`$/g, '')
    if (!p || p === '-' || /^n\/a$/i.test(p)) continue
    if (p.endsWith('/')) out.push(p + '**')
    else if (/[*?]/.test(p) || /\.[A-Za-z0-9]+$/.test(p.split('/').pop() ?? '')) out.push(p)
    else out.push(p, p + '/**')
  }
  return out
}

// The Files cell of the board row whose Role cell is `role` (role-session's board.md), as globs. Empty when there is no such row.
export function boardScope(board: string, role: string): string[] {
  for (const line of board.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 6 || cells[0] !== '') continue
    if (cells[1].toLowerCase() !== role.toLowerCase()) continue
    return pathsToGlobs(cells[4].split(/[,;\s]+/))
  }
  return []
}

// Folders Laya is confident are not needed: its noul score is the chance the candidate must be read, so a score of 0.3 or less is a firm no.
// Same floor as prefilter-rank (0.7 confidence). `results` lines up with `dirs`; anything unreadable keeps its folder.
export function offTaskFolders(dirs: string[], results: { answers?: { q?: { noul?: number } } }[]): string[] {
  return dirs.filter((_, i) => { const n = results[i]?.answers?.q?.noul; return typeof n === 'number' && n < 0.5 && 1 - n >= 0.7 }).map((d) => d + '/**')
}

// A shell command that names a path a layer says to leave alone. Only the .aiignore and role layers apply to commands (a scope
// would flag `npm` as a folder). Outside .aiignore, a word needs a "/" or a "." to count, so `npm run api` is not read as the api folder.
export function commandHit(command: string, cwd: string, layers: Layers): Hit | null {
  if (!command) return null
  const narrow: Layers = { ...layers, scope: [], off: [] }
  for (const word of norm(command).split(/[\s"'`;|&<>()=,]+/)) {
    if (!word || word.startsWith('-')) continue
    const hit = classify(word, cwd, narrow, true)
    if (hit && (hit.layer === 'ignore' || /[/.]/.test(word))) return hit
  }
  return null
}
