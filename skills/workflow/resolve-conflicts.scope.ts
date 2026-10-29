#!/usr/bin/env node
// Mechanical half of the resolve-conflicts skill: lists the conflict set with a side legend and role scope,
// then verifies the resolution against that scope. Plain Node + git, any tool.
//
//   node scope.js list  [--role R] [--out leave|ours|theirs] [--cwd D] [--json] [--no-save]
//   node scope.js check [--role R] [--out leave|ours|theirs] [--cwd D] [--json]
//
// list  prints the legend (which branch is ours/theirs), then one row per conflicted file:
//       path  hunks  kind(code|generated)  scope(in|out|-)  and saves the set to <git-dir>/resolve-conflicts.json.
// check re-reads that saved set after resolution and exits 1 when a marker remains in an in-scope file, an
//       out-of-scope file was resolved against its policy, or an out-of-scope file does not match the side it was given.
// Roles (optional): <cwd>/.claude/, .opencode/ or .agents/ conflict-roles.json (first found)
//   { "default": "frontend", "roles": { "frontend": { "in": ["src/ui/**"], "out": ["server/**"], "outOfScope": "leave" } } }
// With "in" listed, a file matching neither list is out of scope; with only "out", a non-matching file is in scope.
import childProcess = require('node:child_process');
import fs = require('node:fs');
import path = require('node:path');

const { spawnSync } = childProcess;

const POLICIES = ['leave', 'ours', 'theirs'];
const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$|\.min\.(js|css)$|\.map$|(^|\/)(dist|build)\//i;
const MARKER = /^<{7}( |$)/m;

const norm = (p: string): string => p.split(path.sep).join('/');
function git(args: string[], cwd: string): { out: string; code: number | null } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { out: (r.stdout || '').trim(), code: r.status };
}
function globRe(g: string): RegExp {
  const s = norm(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
  return new RegExp('(^|/)' + s + '$');
}

export interface ScopeArgs { cmd?: string; role: string | null; out: string | null; cwd: string; json: boolean; save: boolean }

export function parseArgs(argv: string[]): ScopeArgs {
  const o: ScopeArgs = { cmd: argv[0], role: null, out: null, cwd: process.cwd(), json: false, save: true };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--role') o.role = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--cwd') o.cwd = path.resolve(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--no-save') o.save = false;
  }
  if (o.out && !POLICIES.includes(o.out)) throw new Error(`--out must be one of ${POLICIES.join('|')}`);
  return o;
}

interface RoleConfig { default?: string; roles?: Record<string, { in?: string[]; out?: string[]; outOfScope?: string }> }
export interface Role { name: string; inRe: RegExp[]; outRe: RegExp[]; outOfScope: string }

export function loadRole(cwd: string, name: string | null): Role | null {
  let cfg: RoleConfig | null = null;
  for (const dir of ['.claude', '.opencode', '.agents']) {
    try { cfg = JSON.parse(fs.readFileSync(path.join(cwd, dir, 'conflict-roles.json'), 'utf8')); break; } catch { /* try the next tool folder */ }
  }
  const wanted = name || (cfg && cfg.default);
  if (!wanted) return null;
  const def = cfg && cfg.roles && cfg.roles[wanted];
  if (!def) throw new Error(`role "${wanted}" is not defined in conflict-roles.json`);
  return {
    name: wanted,
    inRe: (def.in || []).map(globRe),
    outRe: (def.out || []).map(globRe),
    outOfScope: def.outOfScope || 'leave',
  };
}
export function scopeOf(role: Role | null, file: string): 'in' | 'out' | '-' {
  if (!role) return '-';
  if (role.outRe.some((re) => re.test(file))) return 'out';
  if (role.inRe.length && !role.inRe.some((re) => re.test(file))) return 'out';
  return 'in';
}

function gitDir(cwd: string): string { return path.resolve(cwd, git(['rev-parse', '--git-dir'], cwd).out); }
interface Legend { op: string; ours: string; theirs: string }
function legend(cwd: string): Legend {
  const dir = gitDir(cwd);
  const has = (n: string): boolean => fs.existsSync(path.join(dir, n));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).out;
  if (has('rebase-merge') || has('rebase-apply')) return { op: 'rebase', ours: 'the branch being rebased onto (upstream)', theirs: 'your commit being replayed' };
  if (has('MERGE_HEAD')) return { op: 'merge', ours: branch, theirs: git(['name-rev', '--name-only', 'MERGE_HEAD'], cwd).out || 'MERGE_HEAD' };
  if (has('CHERRY_PICK_HEAD')) return { op: 'cherry-pick', ours: branch, theirs: 'the picked commit' };
  if (has('REVERT_HEAD')) return { op: 'revert', ours: branch, theirs: 'the reverted change' };
  return { op: 'none', ours: branch, theirs: '-' };
}
function unmerged(cwd: string): string[] {
  const r = git(['diff', '--name-only', '--diff-filter=U'], cwd).out;
  return r ? r.split('\n') : [];
}
const readText = (cwd: string, f: string): string | null => { try { return fs.readFileSync(path.join(cwd, f), 'utf8'); } catch { return null; } };
const hunks = (text: string | null): number => (text ? (text.match(/^<{7}( |$)/gm) || []).length : 0);
const stageSha = (cwd: string, n: number, f: string): string | null => { const r = git(['rev-parse', `:${n}:${f}`], cwd); return r.code === 0 ? r.out : null; };
const savePath = (cwd: string): string => path.join(gitDir(cwd), 'resolve-conflicts.json');

export interface ConflictRow { file: string; hunks: number; kind: 'generated' | 'code'; scope: 'in' | 'out' | '-'; ours: string | null; theirs: string | null }
export interface ListInfo { legend: Legend; role: string | null | undefined; outOfScope: string | null; rows: ConflictRow[] }

export function list(o: ScopeArgs): ListInfo {
  const files = unmerged(o.cwd);
  const role = loadRole(o.cwd, o.role);
  const rows: ConflictRow[] = files.map((file) => ({
    file,
    hunks: hunks(readText(o.cwd, file)),
    kind: GENERATED.test(file) ? 'generated' : 'code',
    scope: scopeOf(role, file),
    ours: stageSha(o.cwd, 2, file),
    theirs: stageSha(o.cwd, 3, file),
  }));
  const info: ListInfo = { legend: legend(o.cwd), role: role && role.name, outOfScope: o.out || (role && role.outOfScope) || null, rows };
  if (o.save && rows.length) fs.writeFileSync(savePath(o.cwd), JSON.stringify(info, null, 1));
  return info;
}

export interface CheckResult { policy: string; total: number; left: string[]; fails: string[] }

export function check(o: ScopeArgs): CheckResult {
  let saved: ListInfo;
  try { saved = JSON.parse(fs.readFileSync(savePath(o.cwd), 'utf8')); } catch { throw new Error('no saved conflict set; run "list" before resolving'); }
  const policy = o.out || saved.outOfScope || 'leave';
  const open = new Set(unmerged(o.cwd));
  const fails: string[] = [];
  const left: string[] = [];
  for (const r of saved.rows) {
    const text = readText(o.cwd, r.file);
    if (r.scope === 'out') {
      if (policy === 'leave') {
        if (open.has(r.file) || MARKER.test(text || '')) left.push(r.file);
        else fails.push(`${r.file}  out of scope but was resolved (policy: leave)`);
      } else {
        const want = policy === 'ours' ? r.ours : r.theirs;
        const have = text === null ? null : git(['hash-object', '--', r.file], o.cwd).out;
        if (have !== want) fails.push(`${r.file}  out of scope; must equal ${policy}`);
      }
    } else if (MARKER.test(text || '')) {
      fails.push(`${r.file}  conflict markers remain`);
    }
  }
  return { policy, total: saved.rows.length, left, fails };
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  if (o.cmd === 'list') {
    const info = list(o);
    if (o.json) { console.log(JSON.stringify(info, null, 1)); return; }
    const { legend: l } = info;
    console.log(`${l.op}: ours = ${l.ours}; theirs = ${l.theirs}`);
    if (info.role) console.log(`role: ${info.role}; out-of-scope policy: ${info.outOfScope}`);
    if (!info.rows.length) { console.log('no conflicted files'); return; }
    for (const r of info.rows) console.log(`${r.file}  hunks=${r.hunks}  ${r.kind}  scope=${r.scope}`);
    return;
  }
  if (o.cmd === 'check') {
    const res = check(o);
    if (o.json) console.log(JSON.stringify(res, null, 1));
    else {
      for (const f of res.fails) console.log('FAIL ' + f);
      for (const f of res.left) console.log('LEFT ' + f + '  (for the owner)');
      console.log(`${res.total} conflicted, ${res.fails.length} failed, ${res.left.length} left for the owner`);
    }
    if (res.fails.length) process.exitCode = 1;
    return;
  }
  console.error('usage: scope.js list|check [--role R] [--out leave|ours|theirs] [--cwd D] [--json]');
  process.exitCode = 2;
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('error: ' + (e as Error).message); process.exitCode = 2; }
}
