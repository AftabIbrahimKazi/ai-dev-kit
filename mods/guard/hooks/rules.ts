// Pure rules for the guard mod: no host calls, so they are unit-tested directly.
// Never add a rule for paths under handover/: lane coordination there belongs to the model-driven
// claim protocol (hooks-enforcement), and a deny would block it.
export type Config = {
  protectedPaths?: string[] // globs, relative to the project root
  allowPaths?: string[]
  protectedBranches?: string[] // pushes to these are denied
  allowCommands?: string[] // regex strings; a match skips every Bash rule
  denyCommands?: string[] // regex strings
}

export const ASK = ' Ask the user first. They can run it themselves with the ! prefix, or allow it in .claude/guard.json.'
const SEP = String.fromCharCode(92)
export const norm = (p: string): string => p.split(SEP).join('/')

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

const PATH_RULES: [RegExp, string][] = [
  [/(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/i, 'environment file that holds secrets'],
  [/(^|\/)(id_rsa|id_ed25519)(\.pub)?$|\.(pem|pfx|p12|key)$/i, 'private key or certificate'],
  [/(^|\/)\.git\//, '.git internals'],
  [/(^|\/)node_modules\//, 'installed dependencies'],
  [/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|Gemfile\.lock|poetry\.lock)$/, 'lockfile: let the package manager change it'],
]

export function checkPath(path: string, cfg: Config = {}): string | null {
  const p = norm(path)
  if ((cfg.allowPaths ?? []).some((g) => globToRegExp(g).test(p))) return null
  for (const [re, why] of PATH_RULES) if (re.test(p)) return why
  for (const g of cfg.protectedPaths ?? []) if (globToRegExp(g).test(p)) return 'protected in .claude/guard.json'
  return null
}

// ---- Bash and PowerShell ----
// ps = PowerShell: the escape character is the backtick (a backslash is a path separator), '' is a quote
// inside single quotes, and a lone & is the call operator (& git push), not a separator.
export function segments(cmd: string, ps = false): string[][] {
  const ESC = ps ? '`' : SEP
  const out: string[][] = []
  let toks: string[] = []
  let cur = ''
  let has = false
  let q: string | null = null
  const endTok = () => { if (has) toks.push(cur); cur = ''; has = false }
  const endSeg = () => { endTok(); if (toks.length) out.push(toks); toks = [] }
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (q) {
      if (c === q) { if (ps && q === "'" && cmd[i + 1] === "'") { cur += "'"; i++ } else q = null }
      else if (c === ESC && q === '"' && i + 1 < cmd.length) cur += cmd[++i]
      else cur += c
    } else if (c === '"' || c === "'") { q = c; has = true }
    else if (c === ESC && i + 1 < cmd.length) { cur += cmd[++i]; has = true }
    else if (/\s/.test(c) && c !== '\n') endTok()
    else if (c === '\n' || c === ';') endSeg()
    else if (c === '&' || c === '|') {
      if (ps && c === '&' && cmd[i + 1] !== '&') { endTok(); continue }
      endSeg(); if (cmd[i + 1] === c) i++
    }
    else { cur += c; has = true }
  }
  endSeg()
  return out
}

const baseName = (t: string) => norm(t).split('/').pop()!.replace(/\.exe$/i, '').toLowerCase()
const PS_REMOVE = ['remove-item', 'ri', 'rm', 'rmdir', 'rd', 'del', 'erase'] // Remove-Item and its aliases

function dangerousTarget(t: string): boolean {
  const p = norm(t).replace(/\/\*$/, '/').replace(/^(\$env:USERPROFILE|\$\{env:USERPROFILE\}|\$env:HOME)(?=\/|$)/i, '~')
  if (['/', '~', '~/', '*', '.', '..', './', '../', '$HOME', '$HOME/', '${HOME}', '${HOME}/', '.*'].includes(p)) return true
  if (/^[A-Za-z]:\/?$/.test(p)) return true // C:\ and C:\*
  if (/^\/[^/]+\/?$/.test(p)) return true // /usr, /etc
  if (/^\.\.(\/|$)/.test(p)) return true // anything in the parent directory
  if (/^(~|\$HOME|\$\{HOME\})\/[^/]+\/?$/.test(p)) return true // ~/Documents
  return false
}

function gitCheck(rest: string[], cfg: Config, currentBranch?: string): string | null {
  let i = 0
  while (i < rest.length && rest[i].startsWith('-')) i += rest[i] === '-c' || rest[i] === '-C' ? 2 : 1
  const sub = rest[i]
  const args = rest.slice(i + 1)
  const has = (...f: string[]) => args.some((a) => f.includes(a))
  if (sub === 'push') {
    // -f also inside a cluster (-fu); --mirror overwrites and deletes remote refs; +ref is a per-branch force
    if (has('--force', '--force-if-includes', '--mirror') || args.some((a) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+[^+]/.test(a))) return 'force push rewrites remote history'
    const positional = args.filter((a) => !a.startsWith('-'))
    const deleting = has('--delete') || args.some((a) => /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a))
    const deleted = deleting ? positional.slice(1) : positional.slice(1).filter((r) => /^:[^:]/.test(r)).map((r) => r.slice(1))
    const keep = ['main', 'master', ...(cfg.protectedBranches ?? [])]
    const gone = deleted.map((r) => r.split(':').pop()!).find((b) => keep.includes(b))
    if (gone) return `deleting the remote branch ${gone}`
    const protectedB = cfg.protectedBranches ?? []
    if (protectedB.length) {
      const targets = positional.slice(1).map((a) => a.split(':').pop()!) // skip the remote name
      const hit = targets.find((t) => protectedB.includes(t)) ?? (targets.length === 0 && currentBranch && protectedB.includes(currentBranch) ? currentBranch : undefined)
      if (hit) return `direct push to protected branch ${hit}`
    }
  }
  if (sub === 'reset' && has('--hard')) return 'git reset --hard discards uncommitted work'
  if (sub === 'clean' && !has('-n', '--dry-run') && args.some((a) => a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a))) return 'git clean -f deletes untracked files for good'
  if (sub === 'checkout' && (has('-f', '--force') || (args.includes('.') && !args.includes('-b')))) return 'git checkout discards working-tree changes'
  if (sub === 'restore' && args.includes('.') && !(has('--staged') && !has('--worktree', '-W'))) return 'git restore . discards working-tree changes'
  return null
}

// ps: the command came through the PowerShell tool, not Bash.
export function checkBash(cmd: string, cfg: Config = {}, currentBranch?: string, ps = false): string | null {
  if ((cfg.allowCommands ?? []).some((r) => new RegExp(r).test(cmd))) return null
  for (const r of cfg.denyCommands ?? []) if (new RegExp(r).test(cmd)) return 'blocked in .claude/guard.json'
  if (/\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/.test(cmd)) return 'piping a download into a shell'
  if (/\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^;\n]*\|\s*(iex|invoke-expression)\b/i.test(cmd)) return 'piping a download into a shell'
  if (/\b(mysql|mariadb|psql|sqlite3|mongosh?)\b/.test(cmd) && /\bdrop\s+(table|database|schema)\b/i.test(cmd)) return 'dropping database objects'
  for (let toks of segments(cmd, ps)) {
    while (toks.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0]) || baseName(toks[0]) === 'sudo')) toks = toks.slice(1)
    if (!toks.length) continue
    const bin = baseName(toks[0])
    const rest = toks.slice(1)
    const remover = bin === 'rm' || (ps && PS_REMOVE.includes(bin))
    if (remover && rest.some((t) => t === '--recursive' || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(t)) && rest.some((t) => !t.startsWith('-') && dangerousTarget(t))) return 'recursive delete of a root-like path'
    if (bin === 'git') { const why = gitCheck(rest, cfg, currentBranch); if (why) return why }
    if (['npm', 'yarn', 'pnpm', 'bun'].includes(bin) && rest[0] === 'publish') return 'publishing a package is irreversible'
    if (bin === 'cargo' && rest[0] === 'publish') return 'publishing a crate is irreversible'
    if (bin === 'twine' && rest[0] === 'upload') return 'publishing a package is irreversible'
  }
  return null
}
