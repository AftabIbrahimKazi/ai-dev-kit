// Pure matching for feature-usage: which kit scripts a shell command runs. No I/O here.
// Installed layout: <root>/skills/<skill>/<script>.js (the kit puts a skill's companion scripts there, prefix dropped).
// Library layout: skills/<category>/<skill>.<script>.js (a command run from a clone of the kit).

export interface ScriptUse { name: string; detail?: string }

const CATEGORIES = new Set(['standards', 'workflow', 'memory', 'meta', 'addons', 'commands', 'libraries', 'stack', 'models', 'mcp'])
const SCRIPT = /(?:^|[\s"'`/=(])skills\/([a-z0-9-]+)\/([A-Za-z0-9._-]+\.(?:js|cjs|mjs))/g

// A command word such as "build" or "report" right after the script path; never a flag, a path or a value.
function detailAfter(rest: string): string | undefined {
  const m = /^["'`]?\s+([a-z][a-z0-9-]{1,19})(?=\s|$|[;&|)])/.exec(rest)
  return m ? m[1] : undefined
}

export function scriptsIn(command: string): ScriptUse[] {
  const text = command.split(String.fromCharCode(92)).join('/')
  const out: ScriptUse[] = []
  const add = (u: ScriptUse): void => { if (!out.some((x) => x.name === u.name && x.detail === u.detail)) out.push(u) }
  for (const m of text.matchAll(SCRIPT)) {
    const rest = text.slice((m.index ?? 0) + m[0].length)
    let skill = m[1]
    let file = m[2]
    if (CATEGORIES.has(skill)) {
      const dot = file.indexOf('.')
      if (dot < 1) continue // a loose file in a category folder is not a companion script
      skill = file.slice(0, dot)
      file = file.slice(dot + 1)
    }
    // skill-scope/auto.js run <skill> <script> is how a slash command reaches a skill's script: count the real one
    const via = skill === 'skill-scope' && file === 'auto.js' ? /^\s+run\s+([a-z0-9-]+)\s+([A-Za-z0-9._-]+\.(?:js|cjs|mjs))/.exec(rest) : null
    if (via) { add({ name: `${via[1]}/${via[2]}`, detail: 'via skill-scope' }); continue }
    const detail = detailAfter(rest)
    add({ name: `${skill}/${file}`, ...(detail ? { detail } : {}) })
  }
  return out
}

export const slug = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project'
