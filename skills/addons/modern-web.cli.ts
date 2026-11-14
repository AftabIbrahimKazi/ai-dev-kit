#!/usr/bin/env node
// Opt-in add-on: runs Chrome's modern-web-guidance `legacy-scan` on a project and shrinks its JSON to a short table, so the
// model reads a few rows and not raw JSON. The scanner is a separate package (GoogleChrome/modern-web-guidance-src, Apache-2.0)
// fetched with npx at run time, pinned to one version; nothing from it is copied into the kit. Plain Node, no dependencies.
//
//   node cli.js [folder] [--changed] [--limit <n>] [--refresh] [--json] [--dry-run]
//
// folder    the project to scan (default: the current folder); it is the scanner's working directory, never part of a command line
// --changed only report findings in files git shows as changed
// --limit    rows to print (default 25)
// --refresh  ignore the 24 hour cache
// --dry-run  print the command it would run and stop; nothing is downloaded
// Needs Node 22 or newer (the scanner's own requirement) and network the first time. Offline, an old Node or a scanner error
// prints one line and exits 0: a missing scan never blocks work. The scanner covers about 20% of its guidance (the patterns it
// can detect by rule); every finding is a candidate, to check against its keepWhen/dropWhen note before editing.
// Env: MODERN_WEB_RUNNER (a node script used instead of npx: tests and offline mirrors). Exit codes: 0 none, skipped or listed, 1 error, 2 bad usage.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import crypto = require('node:crypto');
import { spawnSync } from 'node:child_process';

export const PACKAGE = 'modern-web-guidance';
export const VERSION = '1.0.0'; // pinned: a floating "latest" would run new third-party code on every scan
const TTL_MS = 24 * 3600 * 1000;
const VENDOR = /(^|\/)(node_modules|vendor|third[-_]?party|dist|build|\.next)\/|\.min\.[a-z]+$/i;

// Where the kit's own rules already decide: the scanner's advice does not override them.
const KIT_WINS: [RegExp, string][] = [
  [/dialog|modal|popover/i, 'kit modal standard wins (coding-standards ui-standards modal rules); native <dialog> only where it meets them'],
  [/form|autocomplete|validation/i, 'kit form standard wins where it speaks (coding-standards ui-standards form rules)'],
];

export interface Hit { file: string; line: number; guide: string; text: string; retrieve: string; verify: string; note: string }

// The scanner's JSON shape is read tolerantly: any object with a file and a line is a finding, grouped by the nearest enclosing
// object that names a guide. Anything unrecognised is reported as such, never guessed at.
export function extractHits(json: unknown): Hit[] {
  const hits: Hit[] = [];
  const walk = (node: unknown, ctx: { guide: string; retrieve: string; verify: string }): void => {
    if (Array.isArray(node)) { for (const n of node) walk(n, ctx); return; }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const str = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
    const arr = (k: string): string[] => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []);
    const next = { ...ctx };
    const id = str('guideId') || str('guide') || str('ruleId') || str('rule') || str('id');
    if (id) next.guide = id;
    if (str('retrieveCommand')) next.retrieve = str('retrieveCommand');
    const keep = arr('keepWhen')[0] || arr('dropWhen')[0] || '';
    if (keep) next.verify = keep;
    if (typeof o.file === 'string' && typeof o.line === 'number') {
      const guide = next.guide || 'unknown';
      hits.push({ file: (o.file as string).replace(/\\/g, '/'), line: o.line as number, guide, text: (str('lineContent') || str('text') || str('snippet')).trim(), retrieve: next.retrieve, verify: next.verify, note: (KIT_WINS.find(([re]) => re.test(guide)) || [null, ''])[1] });
      return;
    }
    for (const v of Object.values(o)) walk(v, next);
  };
  walk(json, { guide: '', retrieve: '', verify: '' });
  return hits;
}

export function formatTable(hits: Hit[], limit: number, total: number): string {
  if (!hits.length) return 'modern-web: no legacy patterns found by the scanner (it covers about 20% of the guidance)';
  const rows = hits.slice(0, limit).map((h) => `${h.file}:${h.line}  ${h.guide}  ${h.text.slice(0, 70)}${h.note ? '\n    kit: ' + h.note : ''}`);
  const guides = [...new Set(hits.map((h) => h.guide))].slice(0, 8);
  const more = hits.length > limit ? `\n... and ${hits.length - limit} more` : '';
  return `${rows.join('\n')}${more}\nmodern-web: ${hits.length} candidate(s) of ${total} raw, ${guides.length} guide(s): ${guides.join(', ')}. Each is a candidate: check its keepWhen note, then \`npx ${PACKAGE}@${VERSION} retrieve <guide>\` for the replacement.`;
}

const home = (): string => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');

function stateKey(root: string): string {
  const git = (a: string[]): string => { const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout : ''; };
  return crypto.createHash('sha1').update([path.resolve(root), VERSION, git(['rev-parse', 'HEAD']), git(['status', '--porcelain'])].join('\n')).digest('hex').slice(0, 16);
}

function changedSet(root: string): Set<string> | null {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return new Set(r.stdout.split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '').replace(/\\/g, '/')).filter(Boolean));
}

// The command to run. On Windows npx is a .cmd file that cannot be spawned directly, so npm's own npx-cli.js runs under node.
export function runnerCommand(env: NodeJS.ProcessEnv = process.env, platform = process.platform): { cmd: string; args: string[] } {
  const tail = ['legacy-scan', '.', '--json'];
  if (env.MODERN_WEB_RUNNER) return { cmd: process.execPath, args: [env.MODERN_WEB_RUNNER, ...tail] };
  if (platform === 'win32') {
    const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (fs.existsSync(cli)) return { cmd: process.execPath, args: [cli, '--yes', `${PACKAGE}@${VERSION}`, ...tail] };
  }
  return { cmd: 'npx', args: ['--yes', `${PACKAGE}@${VERSION}`, ...tail] };
}

export interface ScanOutcome { json?: unknown; skipped?: string; cached?: boolean }

export function scan(root: string, opt: { refresh?: boolean; env?: NodeJS.ProcessEnv; nodeVersion?: string } = {}): ScanOutcome {
  const env = opt.env || process.env;
  const major = Number((opt.nodeVersion || process.versions.node).split('.')[0]);
  if (!env.MODERN_WEB_RUNNER && major < 22) return { skipped: `${PACKAGE} needs Node 22 or newer (you have ${opt.nodeVersion || process.versions.node})` };
  const dir = path.join(home(), 'cache', 'modern-web');
  const file = path.join(dir, stateKey(root) + '.json');
  if (!opt.refresh) {
    try { if (Date.now() - fs.statSync(file).mtimeMs < TTL_MS) return { json: JSON.parse(fs.readFileSync(file, 'utf8')), cached: true }; } catch { /* no usable cache */ }
  }
  const { cmd, args } = runnerCommand(env);
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, env });
  if (r.error) return { skipped: /ENOENT/.test(r.error.message) ? 'npx was not found: install Node with npm' : `the scanner did not start (${r.error.message.slice(0, 80)})` };
  if (r.status !== 0 && !r.stdout.trim()) return { skipped: `the scanner failed or the network is unreachable (exit ${r.status}); try again online` };
  let json: unknown;
  try { json = JSON.parse(r.stdout); } catch { return { skipped: 'the scanner printed something that is not JSON; try --refresh, or update the add-on' }; }
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(json)); } catch { /* the cache is optional */ }
  return { json };
}

function main(): void {
  const a = process.argv.slice(2);
  let folder = '.', changed = false, limit = 25, refresh = false, asJson = false, dry = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--changed') changed = true;
    else if (a[i] === '--refresh') refresh = true;
    else if (a[i] === '--json') asJson = true;
    else if (a[i] === '--dry-run') dry = true;
    else if (a[i] === '--limit') limit = Number(a[++i]);
    else if (a[i].startsWith('--')) { folder = '\0'; break; }
    else folder = a[i].replace(/\\/g, '/');
  }
  if (folder === '\0' || !Number.isInteger(limit) || limit < 1) { console.error('usage: modern-web cli.js [folder] [--changed] [--limit <n>] [--refresh] [--json] [--dry-run]'); process.exitCode = 2; return; }
  const root = path.resolve(folder);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`error: ${folder} is not a folder. Pass the project folder.`); process.exitCode = 1; return; }
  if (dry) { const c = runnerCommand(); console.log(`would run (in ${root}): ${c.cmd === process.execPath ? 'node' : c.cmd} ${c.args.map((x) => (x === process.execPath ? 'node' : path.isAbsolute(x) ? path.basename(x) : x)).join(' ')}\nnothing was downloaded`); return; }
  const out = scan(root, { refresh });
  if (out.skipped) { console.log(`modern-web scan skipped: ${out.skipped}`); return; }
  const raw = extractHits(out.json).filter((h) => !VENDOR.test(h.file));
  if (!raw.length && out.json && typeof out.json === 'object' && !Array.isArray(out.json) && Object.keys(out.json as object).length && !JSON.stringify(out.json).includes('"file"')) {
    console.log(`modern-web: the scanner's output has no file and line pairs; keys: ${Object.keys(out.json as object).slice(0, 8).join(', ')}. The add-on may need an update for a newer scanner.`);
    return;
  }
  const ch = changed ? changedSet(root) : null;
  const hits = ch ? raw.filter((h) => ch.has(h.file) || [...ch].some((c) => c.endsWith('/' + h.file) || h.file.endsWith('/' + c))) : raw;
  if (asJson) console.log(JSON.stringify({ cached: !!out.cached, total: raw.length, hits }));
  else console.log(formatTable(hits, limit, raw.length) + (out.cached ? '  (cached)' : ''));
}

if (require.main === module) main();
