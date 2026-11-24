// Config writer for mcp-manager: adds, removes or lists one MCP server entry in a tool's config file, and merges the
// "try it first" line into the instruction files. Merge only: every other key and server stays as it was. A header or env
// value is the NAME of an environment variable and is written as that tool's reference syntax, so no secret ever lands in
// a file. Plain Node, no dependencies.
//
//   node mcp-manager.config.js add    --tool claude|opencode --name N (--url U [--header Name=ENVVAR]... | --command C [--arg A]... [--env KEY=ENVVAR]...)
//                                     [--scope project|user] [--timeout ms] [--root dir] [--replace] [--dry-run]
//   node mcp-manager.config.js remove --tool claude|opencode --name N [--scope ...] [--root dir] [--dry-run]
//   node mcp-manager.config.js list   --tool claude|opencode [--scope ...] [--root dir]
//   node mcp-manager.config.js pin    --name N --trigger "<when>" --fallback "<what replaces it>" [--files CLAUDE.md,AGENTS.md] [--root dir] [--dry-run]
//
// Files: claude project -> <root>/.mcp.json ; opencode project -> <root>/opencode.json ; opencode user ->
// ~/.config/opencode/opencode.jsonc. Claude user scope has no file here: the script prints the `claude mcp add` command.
// Exit 0 done or unchanged; 1 bad input; 3 the file has comments or does not parse, so nothing was written (the entry
// to merge by hand is printed).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type Tool = 'claude' | 'opencode';
export type Json = { [k: string]: unknown };

export interface Spec {
  url?: string;
  headers?: [string, string][]; // [Header-Name, ENV_VAR]
  command?: string;
  args?: string[];
  env?: [string, string][]; // [KEY, ENV_VAR]
  timeout?: number;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const DEFAULT_LOCAL_TIMEOUT = 240000; // OpenCode applies `timeout` to every request (default 5 s): above a model's cold start

// The entry in each tool's own format. Env references: Claude `${VAR}`, OpenCode `{env:VAR}`.
export function entryFor(tool: Tool, s: Spec): Json {
  const ref = (v: string): string => (tool === 'claude' ? '${' + v + '}' : '{env:' + v + '}');
  const hdr = s.headers?.length ? Object.fromEntries(s.headers.map(([k, v]) => [k, ref(v)])) : undefined;
  if (s.url) {
    if (tool === 'claude') return { type: 'http', url: s.url, ...(hdr ? { headers: hdr } : {}) };
    return { type: 'remote', url: s.url, enabled: true, ...(hdr ? { headers: hdr } : {}) };
  }
  const env = s.env?.length ? Object.fromEntries(s.env.map(([k, v]) => [k, ref(v)])) : undefined;
  if (tool === 'claude') return { command: s.command, args: s.args ?? [], ...(env ? { env } : {}) };
  return { type: 'local', command: [s.command, ...(s.args ?? [])], enabled: true, timeout: s.timeout ?? DEFAULT_LOCAL_TIMEOUT };
}

export function validate(name: string, s: Spec, tool?: Tool): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return `name "${name}" must be letters, digits, - or _`;
  if (!s.url === !s.command) return 'give exactly one of --url (remote) or --command (local)';
  if (tool === 'opencode' && s.command && s.env?.length) return 'OpenCode local servers: the config key for environment variables is not verified here. Read the current OpenCode MCP docs, then add it by hand.';
  if (s.url && !/^https?:\/\//.test(s.url)) return `url "${s.url}" must start with http:// or https://`;
  for (const [, v] of [...(s.headers ?? []), ...(s.env ?? [])]) {
    if (!ENV_NAME.test(v)) return `"${v}" is not an environment variable name. Pass the NAME (e.g. STITCH_API_KEY), never the secret itself.`;
  }
  return null;
}

// Plain JSON only. Comments or trailing commas make a rewrite lossy, so those files are left to the user.
export function parseStrict(text: string): Json | null {
  if (!text.trim()) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null; } catch { return null; }
}

export function key(tool: Tool): string { return tool === 'claude' ? 'mcpServers' : 'mcp'; }

export function configPath(tool: Tool, scope: string, root: string, home: string): string | null {
  if (tool === 'claude') return scope === 'user' ? null : path.join(root, '.mcp.json');
  return scope === 'user' ? path.join(home, '.config', 'opencode', 'opencode.jsonc') : path.join(root, 'opencode.json');
}

export type Change = { kind: 'added' | 'replaced' | 'unchanged' | 'refused' | 'removed' | 'absent'; doc: Json };

export function mergeAdd(doc: Json, tool: Tool, name: string, entry: Json, replace: boolean): Change {
  const k = key(tool);
  const servers = { ...((doc[k] as Json | undefined) ?? {}) };
  if (name in servers) {
    if (JSON.stringify(servers[name]) === JSON.stringify(entry)) return { kind: 'unchanged', doc };
    if (!replace) return { kind: 'refused', doc };
    servers[name] = entry;
    return { kind: 'replaced', doc: { ...doc, [k]: servers } };
  }
  servers[name] = entry;
  return { kind: 'added', doc: { ...doc, [k]: servers } };
}

export function mergeRemove(doc: Json, tool: Tool, name: string): Change {
  const k = key(tool);
  const servers = { ...((doc[k] as Json | undefined) ?? {}) };
  if (!(name in servers)) return { kind: 'absent', doc };
  delete servers[name];
  return { kind: 'removed', doc: { ...doc, [k]: servers } };
}

export function pinLine(name: string, trigger: string, fallback: string): string {
  return `MCP ${name}: for ${trigger}, try it FIRST; on missing/error/rate-limit, fall back to ${fallback}.`;
}

// Replaces this server's line if present, otherwise appends it. Everything else in the file is untouched.
export function mergePin(text: string, name: string, line: string): { text: string; kind: 'added' | 'replaced' | 'unchanged' } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith(`MCP ${name}:`));
  if (at >= 0) {
    if (lines[at] === line) return { text, kind: 'unchanged' };
    lines[at] = line;
    return { text: lines.join(eol), kind: 'replaced' };
  }
  const body = text.replace(/\s+$/, '');
  return { text: (body ? body + eol + eol : '') + line + eol, kind: 'added' };
}

export function claudeUserCommand(name: string, s: Spec): string {
  if (s.url) return `claude mcp add --scope user --transport http ${name} ${s.url}` + (s.headers ?? []).map(([k, v]) => ` --header "${k}: \${${v}}"`).join('');
  return `claude mcp add --scope user ${name}` + (s.env ?? []).map(([k, v]) => ` -e ${k}=\${${v}}`).join('') + ` -- ${s.command} ${(s.args ?? []).join(' ')}`.trimEnd();
}

function parseArgs(argv: string[]): { cmd: string; one: Record<string, string>; many: Record<string, string[]>; flags: Set<string> } {
  const [cmd = '', ...rest] = argv;
  const one: Record<string, string> = {};
  const many: Record<string, string[]> = {};
  const flags = new Set<string>();
  const MULTI = new Set(['header', 'arg', 'env']);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const n = a.slice(2);
    if (n === 'replace' || n === 'dry-run') { flags.add(n); continue; }
    const v = rest[++i] ?? '';
    if (MULTI.has(n)) (many[n] ??= []).push(v); else one[n] = v;
  }
  return { cmd, one, many, flags };
}

const pairs = (xs: string[] | undefined): [string, string][] => (xs ?? []).map((x) => { const i = x.indexOf('='); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)]; });

function die(msg: string, code = 1): never { console.error(msg); process.exit(code); }

function main(): void {
  const { cmd, one, many, flags } = parseArgs(process.argv.slice(2));
  const root = path.resolve(one.root ?? process.cwd());
  const dry = flags.has('dry-run');

  if (cmd === 'pin') {
    if (!one.name || !one.trigger || !one.fallback) die('usage: pin --name N --trigger "<when>" --fallback "<what replaces it>" [--files a,b]');
    const files = (one.files ? one.files.split(',') : ['CLAUDE.md', 'AGENTS.md']).map((f) => path.join(root, f.trim())).filter((f) => one.files || fs.existsSync(f));
    if (!files.length) die('No CLAUDE.md or AGENTS.md here. Pass --files to name the file to create.');
    const line = pinLine(one.name, one.trigger, one.fallback);
    for (const f of files) {
      const r = mergePin(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '', one.name, line);
      if (!dry && r.kind !== 'unchanged') fs.writeFileSync(f, r.text);
      console.log(`${dry ? 'would write' : r.kind} ${path.relative(root, f) || f}`);
    }
    return;
  }

  const tool = one.tool as Tool;
  if (tool !== 'claude' && tool !== 'opencode') die('--tool must be claude or opencode');
  const scope = one.scope ?? 'project';
  const file = configPath(tool, scope, root, os.homedir());
  const spec: Spec = { url: one.url, headers: pairs(many.header), command: one.command, args: many.arg, env: pairs(many.env), timeout: one.timeout ? Number(one.timeout) : undefined };

  if (cmd === 'add' && !file) { // claude user scope
    const bad = validate(one.name ?? '', spec, tool); if (bad) die(bad);
    console.log(`Claude Code user scope has no file to edit. Run:\n${claudeUserCommand(one.name, spec)}`);
    return;
  }
  if (!file) die('claude user scope has no config file; use `claude mcp list`');

  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const doc = parseStrict(text);

  if (cmd === 'list') {
    if (!doc) die(`${file} has comments or does not parse as plain JSON; read it by eye.`, 3);
    const names = Object.keys((doc[key(tool)] as Json | undefined) ?? {});
    console.log(names.length ? names.join('\n') : 'no servers');
    return;
  }
  if (cmd !== 'add' && cmd !== 'remove') die('commands: add, remove, list, pin');
  if (!one.name) die('--name is required');

  let entry: Json | null = null;
  if (cmd === 'add') {
    const bad = validate(one.name, spec, tool); if (bad) die(bad);
    entry = entryFor(tool, spec);
  }
  if (!doc) {
    console.error(`${file} has comments or does not parse as plain JSON, so nothing was written (a rewrite would drop them).`);
    if (entry) console.error(`Merge this under "${key(tool)}" by hand:\n${JSON.stringify({ [one.name]: entry }, null, 2)}`);
    process.exit(3);
  }
  const r = cmd === 'add' ? mergeAdd(doc, tool, one.name, entry!, flags.has('replace')) : mergeRemove(doc, tool, one.name);
  if (r.kind === 'refused') die(`${one.name} already exists in ${file} with different settings. Re-run with --replace to overwrite just that entry.`);
  if (r.kind === 'added' || r.kind === 'replaced' || r.kind === 'removed') {
    if (!dry) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(r.doc, null, 2) + '\n'); }
  }
  console.log(`${dry ? 'would be ' : ''}${r.kind}: ${one.name} in ${file}`);
}

if (require.main === module) main();
