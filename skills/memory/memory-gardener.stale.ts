#!/usr/bin/env node
// Lists memory bullets that name files which no longer exist, for memory-gardener. Report only: it never edits.
// A bullet is only a candidate; a lesson about a deleted file can still be a true general lesson, so the model decides.
//
//   node stale.js [--cwd D] [--json]
//
// Scans learnings.md under the skill roots (.claude/skills, .opencode/skills, .agents/skills), memory-bank/*.md,
// handover.md and handover/*.md (never handover/locks.d). Looks at `backticked` tokens that look like repo paths:
// they contain a "/" and end in a file extension, or are a bare file name with a common source extension.
// Skipped: URLs, globs, placeholders (<x>, {x}), absolute and home paths, and paths under node_modules/dist/.git.
// Exit 0 always; the report says how many bullets are candidates.
import fs = require('node:fs');
import path = require('node:path');

const ROOTS = ['.claude/skills', '.opencode/skills', '.agents/skills'];
const EXT = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|html?|md|json|php|py|vue|svelte|astro|liquid|sh|ya?ml|toml)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.git|\.next|\.astro)(\/|$)/;

function filesToScan(cwd: string): string[] {
  const out: string[] = [];
  for (const r of ROOTS) {
    const dir = path.join(cwd, r);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(dir, e.name, 'learnings.md');
      if (fs.existsSync(f)) out.push(f);
    }
  }
  const mb = path.join(cwd, 'memory-bank');
  if (fs.existsSync(mb)) for (const f of fs.readdirSync(mb)) if (f.endsWith('.md')) out.push(path.join(mb, f));
  if (fs.existsSync(path.join(cwd, 'handover.md'))) out.push(path.join(cwd, 'handover.md'));
  const ho = path.join(cwd, 'handover');
  if (fs.existsSync(ho)) {
    for (const e of fs.readdirSync(ho, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.md')) out.push(path.join(ho, e.name));
  }
  return out;
}

// Path-looking tokens in a line of markdown.
export function pathsIn(line: string): string[] {
  const found: string[] = [];
  for (const m of line.matchAll(/`([^`\s]+)`/g)) {
    let p = m[1].replace(/[:,;.)]+$/, '').replace(/:\d+(-\d+)?$/, '');
    if (!EXT.test(p) || /^\.[a-z0-9]+$/i.test(p.split('/').pop()!)) continue; // a bare extension like `.ts` is not a file
    if (/^(https?:|~|\/|[A-Za-z]:)/.test(p) || /[*<>{}$]/.test(p)) continue;
    p = p.replace(/^\.\//, '');
    if (!p.includes('/') && !/\.(js|jsx|mjs|cjs|ts|tsx|css|scss|php|py|vue|svelte|astro)$/i.test(p)) continue;
    if (SKIP_PATH.test(p)) continue;
    found.push(p);
  }
  return found;
}

// A token is present if it exists from the project root, or (a bare name) anywhere in a short walk of the project.
function exists(cwd: string, p: string, index: Set<string>): boolean {
  if (fs.existsSync(path.join(cwd, p))) return true;
  if (!p.includes('/')) return index.has(p);
  return index.has(p) || [...index].some((x) => x.endsWith('/' + p));
}

function walk(cwd: string): Set<string> {
  const set = new Set<string>();
  const go = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === '.next') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(dir, e.name), r); else { set.add(r); set.add(e.name); }
    }
  };
  go(cwd, '');
  return set;
}

export interface StaleBullet { file: string; line: number; missing: string[]; text: string }
export interface ScanResult { bullets: number; stale: StaleBullet[] }

export function scan(cwd: string): ScanResult {
  const index = walk(cwd);
  const stale: StaleBullet[] = [];
  let bullets = 0;
  for (const file of filesToScan(cwd)) {
    const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
    lines.forEach((line, i) => {
      if (!/^\s*(?:[-*]|\d+\.)\s/.test(line)) return;
      bullets++;
      const missing = [...new Set(pathsIn(line))].filter((p) => !exists(cwd, p, index));
      if (missing.length) stale.push({ file: path.relative(cwd, file).split(path.sep).join('/'), line: i + 1, missing, text: line.trim().slice(0, 110) });
    });
  }
  return { bullets, stale };
}

function main(argv: string[]): number {
  let cwd = process.cwd(), json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd') cwd = path.resolve(argv[++i] || '.');
    else if (argv[i] === '--json') json = true;
    else { console.error('usage: node stale.js [--cwd D] [--json]'); return 2; }
  }
  const r = scan(cwd);
  if (json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`stale-check: ${r.stale.length} of ${r.bullets} bullet(s) name a file that no longer exists`);
  for (const s of r.stale) console.log(`${s.file}:${s.line}  missing ${s.missing.join(', ')}\n    ${s.text}`);
  if (r.stale.length) console.log('candidates only: delete a bullet only if the lesson is also tied to that file; keep it if it still holds in general.');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
