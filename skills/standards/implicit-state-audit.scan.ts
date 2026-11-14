#!/usr/bin/env node
// Deterministic first pass of the implicit-state audit: finds hidden state machines in UI code without a model.
// Plain Node, no dependencies, no network. Costs zero tokens; a reviewer model (see plan-first/reviewer.js) only ever
// sees the files this pass flags.
//
//   node scan.js [file|folder ...] [--changed] [--json] [--root <dir>] [--no-cache]
//   node scan.js --hook <file>      what the state-audit mod runs after an edit: prints only WARN or FAIL, silent when clean
//
// With no path: the files git reports as changed, else every code file in the project (first 400).
// Rules:
//   bool-flags        3 or more boolean state flags in one scope (isLoading, isError, isOpen ...). FAIL when the flags
//                     include a loading + error + success trio, because the impossible combinations are then representable.
//   scattered-toggle  state held in DOM class or attribute changes at 3 or more places, 3 or more distinct names, in 2 or
//                     more functions, with no single owner.
//   timer-sequencing  2 or more setTimeout callbacks that change state: the order lives in the timers (temporal coupling).
// Not checked (judge by reading, or give the file to the reviewer): guardless transitions, state split across files.
// Results are cached by file hash in ~/.ai-dev-kit/cache/state-audit/ (AI_DEV_KIT_HOME moves it), so a repeat run costs nothing.
// Exit codes: 0 clean, 1 findings, 2 bad usage.
import fs = require('node:fs');
import path = require('node:path');
import crypto = require('node:crypto');
import os = require('node:os');
import { spawnSync } from 'node:child_process';

export interface StateFinding { file: string; line: number; rule: 'bool-flags' | 'scattered-toggle' | 'timer-sequencing'; level: 'warn' | 'fail'; flags: string[]; impossible: string[]; fix: string }

const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/i;
const SKIP_DIR = /^(node_modules|\.git|\.next|dist|build|coverage|vendor|\.claude|_sandbox|site|cloude|\.cache)$/;
const MAX_FILES = 400;
const CACHE_VERSION = 1;

const FLAG_NAME = /^(?:(?:is|has|should|can|show|hide|was|will)[A-Z]\w*|(?:loading|error|success|open|opened|closed|visible|hidden|active|enabled|disabled|busy|ready|done|dirty|pending|failed|submitting|editing|expanded|selected))$|(?:Loading|Error|Success|Open|Visible|Busy|Ready|Done|Pending|Failed|Submitting|Editing|Expanded|Selected|Active|Disabled|Enabled)$/;
const LOADING = /loading|pending|busy|submitting/i;
const ERROR = /error|failed/i;
const SUCCESS = /success|done|ready/i;

const lineOf = (text: string): ((i: number) => number) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1; } return lo + 1; };
};

// Blanks comments and keeps every newline, so offsets and line numbers stay valid.
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
}

// Code that only lives inside a string (a test fixture, a template, a code sample) is not state. Blanks the content of
// string and template literals that are long or span lines; short ones (class and attribute names) stay readable.
export function blankLongStrings(src: string): string {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c !== '"' && c !== "'" && c !== '`') { out += c; i++; continue; }
    let j = i + 1;
    while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; else if (c !== '`' && src[j] === '\n') break; j++; }
    if (j >= src.length || (c !== '`' && src[j] === '\n')) { out += c; i++; continue; } // an apostrophe or an unclosed quote: not a string
    const body = src.slice(i + 1, j);
    out += c + (body.length > 40 || body.includes('\n') ? body.replace(/[^\n]/g, ' ') : body) + c;
    i = j + 1;
  }
  return out;
}

// Test, story and fixture files describe state in sample code; automatic runs skip them (an explicit path still scans).
const TEST_FILE = /(?:[.-](?:test|spec|stories)\.[a-z]+$)|(?:(?:^|[\\/])(?:tests?|__tests__|__mocks__|fixtures?|e2e)[\\/])/i;
export const isTestFile = (rel: string): boolean => TEST_FILE.test(rel);

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}' && --depth === 0) return i + 1; }
  return s.length;
}

interface Range { start: number; end: number }
function scopes(code: string): Range[] {
  const out: Range[] = [];
  for (const m of code.matchAll(/function\s*[\w$]*\s*\([^)]*\)\s*\{|=>\s*\{|class\s+[\w$]+[^{]*\{/g)) {
    const open = m.index! + m[0].length - 1;
    out.push({ start: open, end: matchBrace(code, open) });
  }
  return out;
}
const innermost = (rs: Range[], at: number): number => {
  let best = -1, size = Infinity;
  rs.forEach((r, i) => { if (at >= r.start && at < r.end && r.end - r.start < size) { best = i; size = r.end - r.start; } });
  return best;
};

function lifecycle(flags: string[]): { impossible: string[]; trio: boolean } {
  const l = flags.filter((f) => LOADING.test(f)), e = flags.filter((f) => ERROR.test(f)), s = flags.filter((f) => SUCCESS.test(f));
  const impossible: string[] = [];
  for (const [a, b] of [[l, e], [l, s], [e, s]] as string[][][]) if (a.length && b.length) impossible.push(`{ ${a[0]}: true, ${b[0]}: true }`);
  return { impossible, trio: !!(l.length && e.length && s.length) };
}

export function scanText(rel: string, text: string): StateFinding[] {
  const code = blankLongStrings(stripComments(text));
  const L = lineOf(code);
  const out: StateFinding[] = [];
  const fn = scopes(code);

  // Boolean flags, grouped by the scope that declares them.
  const groups = new Map<number, { names: Map<string, number> }>();
  const note = (scopeKey: number, name: string, idx: number): void => {
    if (!FLAG_NAME.test(name)) return;
    const g = groups.get(scopeKey) || { names: new Map() };
    if (!g.names.has(name)) g.names.set(name, idx);
    groups.set(scopeKey, g);
  };
  for (const m of code.matchAll(/const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[A-Z][\w$]*\s*\]\s*=\s*(?:React\.)?useState(?:<boolean>)?\(\s*(?:true|false)?\s*\)/g)) note(innermost(fn, m.index!), m[1], m.index!);
  for (const m of code.matchAll(/\blet\s+([A-Za-z_$][\w$]*)\s*(?::\s*boolean\s*)?=\s*(?:true|false)\b/g)) note(innermost(fn, m.index!), m[1], m.index!);
  for (const m of code.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*=\s*(?:true|false)\b/g)) note(innermost(fn, m.index!), m[1], m.index!);
  const braces: Range[] = [];
  for (let i = 0; i < code.length; i++) if (code[i] === '{') braces.push({ start: i, end: matchBrace(code, i) });
  for (const m of code.matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*(?:true|false)\s*(?=[,}\n])/g)) note(1_000_000 + innermost(braces, m.index!), m[1], m.index!);
  for (const [, g] of groups) {
    const names = [...g.names.keys()];
    if (names.length < 3) continue;
    const { impossible, trio } = lifecycle(names);
    out.push({
      file: rel, line: L(Math.min(...g.names.values())), rule: 'bool-flags', level: trio ? 'fail' : 'warn', flags: names, impossible,
      fix: trio ? "replace the flags with one state variable: type Status = 'idle' | 'loading' | 'success' | 'error'" : 'replace the flags with one state variable (a union of the states that can really occur)',
    });
  }

  // DOM state with no owner: class and attribute changes spread over several functions.
  const sites: { name: string; scope: number; at: number }[] = [];
  for (const m of code.matchAll(/classList\s*\.\s*(?:add|remove|toggle)\(\s*['"]([^'"]+)['"]/g)) sites.push({ name: 'class:' + m[1], scope: innermost(fn, m.index!), at: m.index! });
  for (const m of code.matchAll(/setAttribute\(\s*['"]((?:data|aria)-[\w-]+)['"]/g)) sites.push({ name: m[1], scope: innermost(fn, m.index!), at: m.index! });
  for (const m of code.matchAll(/\.dataset\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) sites.push({ name: 'data:' + m[1], scope: innermost(fn, m.index!), at: m.index! });
  if (sites.length >= 3 && new Set(sites.map((s) => s.name)).size >= 3 && new Set(sites.map((s) => s.scope)).size >= 2) {
    const names = [...new Set(sites.map((s) => s.name))];
    out.push({ file: rel, line: L(sites[0].at), rule: 'scattered-toggle', level: 'warn', flags: names, impossible: [], fix: 'give the element one owner: one function that sets one data-state value, and let CSS read it' });
  }

  // State sequenced by timers.
  const timers = [...code.matchAll(/setTimeout\s*\(/g)].filter((m) => /set(?!Timeout|Interval)[A-Z]\w*\(|classList|\.dataset\.|\.state\s*=/.test(code.slice(m.index!, m.index! + 220)));
  if (timers.length >= 2) out.push({ file: rel, line: L(timers[0].index!), rule: 'timer-sequencing', level: 'warn', flags: [], impossible: [], fix: 'model the steps as named states with explicit transitions instead of ordering them with timers' });
  return out;
}

// ---- files, cache, output ----
function listCode(root: string, dir: string, acc: string[]): void {
  if (acc.length >= MAX_FILES) return;
  let ents: fs.Dirent[] = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) listCode(root, path.join(dir, e.name), acc); }
    else if (CODE_FILE.test(e.name) && !/\.(min|d)\./.test(e.name)) { const rel = path.relative(root, path.join(dir, e.name)); if (!isTestFile(rel)) acc.push(rel); }
  }
}
function changedFiles(root: string): string[] {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter((f) => f && CODE_FILE.test(f) && !isTestFile(f) && !/(^|\/)(node_modules|handover)\//.test(f) && fs.existsSync(path.join(root, f)));
}

interface Cache { version: number; files: Record<string, { sha: string; findings: StateFinding[] }> }
// Kept in the per-user kit folder, never in the project: a cache file inside the repo would show up as an untracked file.
const cachePath = (root: string): string => path.join(process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit'), 'cache', 'state-audit', crypto.createHash('sha1').update(path.resolve(root)).digest('hex').slice(0, 12) + '.json');
function readCache(root: string): Cache {
  try { const c = JSON.parse(fs.readFileSync(cachePath(root), 'utf8')) as Cache; if (c.version === CACHE_VERSION) return c; } catch { /* no cache yet */ }
  return { version: CACHE_VERSION, files: {} };
}

export function scanFiles(root: string, files: string[], useCache = true): { findings: StateFinding[]; scanned: number; cached: number } {
  const cache = useCache ? readCache(root) : { version: CACHE_VERSION, files: {} as Cache['files'] };
  const findings: StateFinding[] = [];
  let cached = 0, dirty = false;
  for (const rel of files) {
    const abs = path.resolve(root, rel);
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const key = rel.split(path.sep).join('/');
    const sha = crypto.createHash('sha1').update(text).digest('hex');
    const hit = cache.files[key];
    if (hit && hit.sha === sha) { findings.push(...hit.findings); cached++; continue; }
    const f = scanText(key, text);
    cache.files[key] = { sha, findings: f };
    dirty = true;
    findings.push(...f);
  }
  if (useCache && dirty) {
    try { fs.mkdirSync(path.dirname(cachePath(root)), { recursive: true }); fs.writeFileSync(cachePath(root), JSON.stringify(cache)); } catch { /* a cache that cannot be written is not an error */ }
  }
  return { findings, scanned: files.length, cached };
}

export function formatTable(findings: StateFinding[]): string {
  if (!findings.length) return 'implicit-state-audit: no findings';
  const rows = findings.map((f) => `${f.level.toUpperCase().padEnd(4)} ${f.file}:${f.line}  ${f.rule}  ${f.flags.join(', ') || '-'}${f.impossible.length ? '\n     impossible: ' + f.impossible.join('; ') : ''}\n     fix: ${f.fix}`);
  return rows.join('\n') + `\nimplicit-state-audit: ${findings.filter((f) => f.level === 'fail').length} fail, ${findings.filter((f) => f.level === 'warn').length} warn`;
}

function main(): void {
  const argv = process.argv.slice(2);
  let root = process.cwd(), json = false, changed = false, useCache = true, hook: string | undefined;
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') root = path.resolve(argv[++i] || '');
    else if (a === '--json') json = true;
    else if (a === '--changed') changed = true;
    else if (a === '--no-cache') useCache = false;
    else if (a === '--hook') hook = argv[++i];
    else if (a.startsWith('--')) { console.error('usage: scan.js [file|folder ...] [--changed] [--json] [--root <dir>] [--no-cache] | --hook <file>'); process.exitCode = 2; return; }
    else paths.push(a);
  }
  if (hook !== undefined) {
    const rel = path.relative(root, path.resolve(root, hook));
    if (!CODE_FILE.test(rel) || isTestFile(rel) || /(^|[\\/])(node_modules|handover)[\\/]/.test(rel) || !fs.existsSync(path.resolve(root, rel))) return; // out of scope: silent
    const r = scanFiles(root, [rel], useCache);
    if (r.findings.length) { console.log(formatTable(r.findings)); process.exitCode = 1; }
    return;
  }
  let files: string[] = [];
  for (const p of paths) {
    const abs = path.resolve(root, p);
    if (!fs.existsSync(abs)) { console.error(`error: ${p} does not exist. Pass a file or folder inside ${root}.`); process.exitCode = 1; return; }
    if (fs.statSync(abs).isDirectory()) listCode(root, abs, files); else files.push(path.relative(root, abs));
  }
  // No path: the changed files; if there are none (and --changed was not given) the whole project.
  if (!paths.length) { files = changedFiles(root); if (!files.length && !changed) listCode(root, root, files); }
  const r = scanFiles(root, files, useCache);
  if (json) console.log(JSON.stringify({ scanned: r.scanned, cached: r.cached, findings: r.findings }));
  else console.log(formatTable(r.findings) + (r.scanned ? `  (${r.scanned} files, ${r.cached} from cache)` : ''));
  if (r.findings.length) process.exitCode = 1;
}

if (require.main === module) main();
