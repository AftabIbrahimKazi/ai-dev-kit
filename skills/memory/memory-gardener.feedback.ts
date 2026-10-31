#!/usr/bin/env node
// Collects lessons that would help any project (not just this one) into a local, never-committed file, for memory-gardener.
// It never pushes, sends or opens anything. Sharing a lesson with a public kit repo is a manual step by the owner.
//
//   node feedback.js add --skill <name> --text "<lesson>" [--cwd D]
//   node feedback.js check [--cwd D]       scrub-check the whole file; exit 1 if anything is flagged
//   node feedback.js list  [--cwd D]       first 30 bullets
//
// The file is kit-feedback.md in the project root. It is created only by `add`, and the script adds it to .gitignore.
// `add` refuses a lesson the scrub flags (URL, email, IP, absolute path, long token, or a word in a deny list).
// Deny lists, one word or phrase per line: .kit-feedback-deny in the project root (also gitignored) and
// ~/.ai-dev-kit/feedback-deny.txt for words that apply to every project, such as an employer name.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

const FILE = 'kit-feedback.md';
const DENY_LOCAL = '.kit-feedback-deny';
const HEADER = [
  '# Kit feedback (local only)',
  '',
  'Lessons that may help any project. This file is in .gitignore and is never pushed by any kit script.',
  'This kit is public: before sharing any of this, remove company, client and product details.',
  '',
  '',
].join('\n');

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'URL', re: /\bhttps?:\/\/\S+/i },
  { name: 'email address', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { name: 'IP address', re: /\b\d{1,3}(\.\d{1,3}){3}\b/ },
  { name: 'absolute path', re: /(^|[\s`(])([A-Za-z]:[\\/]|\/(home|Users|var|etc|opt|srv|mnt)\/|\\\\[\w-]+\\)/ },
  { name: 'internal host name', re: /\b[\w-]+\.(internal|corp|local|intra|lan)\b/i },
  { name: 'long token (possible key)', re: /\b[A-Za-z0-9_-]{32,}\b/ },
];

function denyWords(cwd: string): string[] {
  const words: string[] = [];
  for (const f of [path.join(cwd, DENY_LOCAL), path.join(os.homedir(), '.ai-dev-kit', 'feedback-deny.txt')]) {
    try {
      for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const w = l.trim();
        if (w && !w.startsWith('#')) words.push(w.toLowerCase());
      }
    } catch { /* no list here */ }
  }
  return words;
}

// Why a line should not be shared, or an empty list when it looks clean.
export function scrub(line: string, deny: string[]): string[] {
  const why: string[] = [];
  for (const p of PATTERNS) if (p.re.test(line)) why.push(p.name);
  const low = line.toLowerCase();
  for (const w of deny) if (low.includes(w)) why.push('deny-list entry "' + w + '"');
  return why;
}

function ensureIgnored(cwd: string, entries: string[]): void {
  const gi = path.join(cwd, '.gitignore');
  const body = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const have = new Set(body.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !have.has(e));
  if (!missing.length) return;
  const sep = body && !body.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(gi, body + sep + missing.join('\n') + '\n');
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function run(argv: string[]): { code: number; out: string } {
  const cmd = argv[0];
  const cwd = path.resolve(arg(argv, '--cwd') ?? process.cwd());
  const file = path.join(cwd, FILE);
  const deny = denyWords(cwd);

  if (cmd === 'add') {
    const skill = (arg(argv, '--skill') ?? '').trim();
    const text = (arg(argv, '--text') ?? '').replace(/\s+/g, ' ').trim();
    if (!/^[a-z0-9-]+$/.test(skill) || !text) return { code: 2, out: 'usage: feedback.js add --skill <name> --text "<lesson>"' };
    const why = scrub(text, deny);
    if (why.length) return { code: 2, out: 'not written: the lesson contains ' + why.join(', ') + '. Rewrite it so it names no company, client, URL or path.' };
    const n = new Date();
    const date = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); // local date
    const body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : HEADER;
    const line = '- [' + skill + '] ' + date + ' ' + text + '\n';
    if (body.includes(' ' + text + '\n')) return { code: 0, out: 'already recorded' };
    fs.writeFileSync(file, body + (body.endsWith('\n') ? '' : '\n') + line);
    ensureIgnored(cwd, [FILE, DENY_LOCAL]);
    return { code: 0, out: 'added to ' + FILE + ' (local only, in .gitignore)' };
  }

  if (cmd === 'check') {
    if (!fs.existsSync(file)) return { code: 0, out: 'no ' + FILE + ' here' };
    const flagged: string[] = [];
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (!l.startsWith('- [')) return;
      const why = scrub(l, deny);
      if (why.length) flagged.push('line ' + (i + 1) + ': ' + why.join(', '));
    });
    return flagged.length
      ? { code: 1, out: flagged.length + ' line(s) flagged, do not share yet:\n' + flagged.join('\n') }
      : { code: 0, out: 'clean: no URLs, emails, IPs, paths, long tokens or deny-list words found. Still read it once before sharing.' };
  }

  if (cmd === 'list') {
    if (!fs.existsSync(file)) return { code: 0, out: 'no ' + FILE + ' here' };
    const bullets = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- ['));
    return { code: 0, out: bullets.slice(0, 30).join('\n') + (bullets.length > 30 ? '\n... ' + (bullets.length - 30) + ' more' : '') };
  }

  return { code: 2, out: 'usage: feedback.js <add|check|list> [options]' };
}

if (require.main === module) {
  const r = run(process.argv.slice(2));
  (r.code === 0 ? console.log : console.error)(r.out);
  process.exit(r.code);
}
