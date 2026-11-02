// Size check for the notes every session pays for: handover.md (and handover/<role>.md) and each skill's learnings.md.
// Prints nothing when everything is within its limit, so a session-start hook costs no tokens until a limit is crossed.
//
//   node size.js check [--cwd <project>] [--max-lines 120] [--max-bullets 30] [--quiet] [--strict] [--json]
//
// check:  handover files over --max-lines, handover files with more than one session section (the log failure mode),
//         learnings.md files over --max-bullets. One line per problem, then one line naming the memory-gardener skill.
// --strict exits 1 when a limit is crossed (default exit 0). --quiet is accepted for hooks and changes nothing: silence
// is already the default. Reads files only; never edits anything. No network. Exit codes: 0 done, 1 strict failure, 2 bad usage.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const MAX_LINES = 120;
export const MAX_BULLETS = 30;

export interface Problem { file: string; kind: 'lines' | 'sessions' | 'bullets'; found: number; limit: number }

function countLines(text: string): number {
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
}

// A "session section" is a level-2 heading that names a session; the rule is exactly one, called "Last session".
export function countSessionSections(text: string): number {
  return text.split(/\r?\n/).filter((l) => /^##\s+/.test(l) && /session/i.test(l)).length;
}

export function countBullets(text: string): number {
  return text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
}

function handoverFiles(cwd: string): string[] {
  const out: string[] = [];
  const root = path.join(cwd, 'handover.md');
  if (fs.existsSync(root)) out.push(root);
  const dir = path.join(cwd, 'handover');
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (n.endsWith('.md') && n !== 'board.md' && fs.statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

function learningsFiles(cwd: string): string[] {
  const out: string[] = [];
  for (const root of ['.claude/skills', '.opencode/skills', '.agents/skills']) {
    const abs = path.join(cwd, root);
    if (!fs.existsSync(abs)) continue;
    for (const n of fs.readdirSync(abs)) {
      const p = path.join(abs, n, 'learnings.md');
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out;
}

export function check(cwd: string, maxLines = MAX_LINES, maxBullets = MAX_BULLETS): Problem[] {
  const problems: Problem[] = [];
  const rel = (p: string) => path.relative(cwd, p).split(path.sep).join('/');
  for (const f of handoverFiles(cwd)) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = countLines(text);
    if (lines > maxLines) problems.push({ file: rel(f), kind: 'lines', found: lines, limit: maxLines });
    const sessions = countSessionSections(text);
    if (sessions > 1) problems.push({ file: rel(f), kind: 'sessions', found: sessions, limit: 1 });
  }
  for (const f of learningsFiles(cwd)) {
    const bullets = countBullets(fs.readFileSync(f, 'utf8'));
    if (bullets > maxBullets) problems.push({ file: rel(f), kind: 'bullets', found: bullets, limit: maxBullets });
  }
  return problems;
}

export function describe(p: Problem): string {
  if (p.kind === 'lines') return `${p.file}: ${p.found} lines (limit ${p.limit})`;
  if (p.kind === 'sessions') return `${p.file}: ${p.found} session sections (want 1, "## Last session")`;
  return `${p.file}: ${p.found} bullets (limit ${p.limit})`;
}

function parse(argv: string[]): { cwd: string; maxLines: number; maxBullets: number; strict: boolean; json: boolean } | null {
  const [cmd, ...rest] = argv;
  if (cmd !== 'check') return null;
  const a = { cwd: process.cwd(), maxLines: MAX_LINES, maxBullets: MAX_BULLETS, strict: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--cwd') a.cwd = path.resolve(rest[++i] ?? '');
    else if (f === '--max-lines') a.maxLines = Number(rest[++i]);
    else if (f === '--max-bullets') a.maxBullets = Number(rest[++i]);
    else if (f === '--strict') a.strict = true;
    else if (f === '--json') a.json = true;
    else if (f === '--quiet') continue;
    else return null;
  }
  if (!(a.maxLines > 0) || !(a.maxBullets > 0)) return null;
  return a;
}

function main(): void {
  const a = parse(process.argv.slice(2));
  if (!a) {
    console.error('usage: size.js check [--cwd <project>] [--max-lines N] [--max-bullets N] [--quiet] [--strict] [--json]');
    process.exitCode = 2;
    return;
  }
  const problems = check(a.cwd, a.maxLines, a.maxBullets);
  if (a.json) console.log(JSON.stringify({ ok: problems.length === 0, problems }));
  else if (problems.length) {
    console.log('Notes over their limit (every session pays for these):');
    for (const p of problems) console.log('- ' + describe(p));
    console.log('Run the memory-gardener skill to demote or delete, then keep one "## Last session" block.');
  }
  if (a.strict && problems.length) process.exitCode = 1;
}

if (require.main === module) main();
