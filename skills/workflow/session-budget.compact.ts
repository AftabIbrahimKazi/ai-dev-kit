#!/usr/bin/env node
// Shrinks long command output (tests, builds, installs) without dropping any failure line.
// Works in any tool: pipe text in, or let it run the command and keep the exit code.
//
//   node compact.js < output.txt                 compact stdin
//   node compact.js -- npm test                  run the command, print compacted output, exit with its code
//   node compact.js -- "npm test -- -t 'a b'"    one argument is used as the whole command line, as typed
//   options: --max N (line budget, default 150)  --save-raw DIR  --no-save-raw
//            --report-exit  always exit 0 and print "exit code: N" last (for slash commands, where a non-zero exit aborts the command)
//   When output is compacted, the full text is kept in ~/.ai-dev-kit/raw (AI_DEV_KIT_HOME overrides), newest 20.
//
// Contract: every line that looks like a failure survives (see FAILURE). Only these are dropped or merged:
// ANSI codes, progress/spinner lines, repeated blank lines, passing-test lines, library stack frames, and
// consecutive duplicate lines (merged as "line  (x N)"). Output under 40 lines or saving under 15% is returned unchanged.
import childProcess = require('node:child_process');
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

const { spawn } = childProcess;

export const FAILURE = /(error|fail|✗|✘|✖|×|exception|panic|traceback|fatal|denied|cannot|can't|unable|undefined|assert|expected|received|warn|deprecat|⚠|not ok|exit code|time(?:d)? ?out|missing|invalid|unexpected|\bTS\d{4}\b)/i;
const PASS_LINE = /^\s*(✓|✔|√)\s|^\s*PASS\s|^\s*ok \d+\s+-\s|^\s*[.sS]+(\s+\[\s*\d+%\])?\s*$/;
const PROGRESS = /^[\s⠁-⣿\-=#>|/\\]*$|^\s*\d{1,3}%|\bnpm http fetch\b|^\s*[#=>\-]{6,}\s*\d*%?\s*$/;
const LIB_FRAME = /^\s+at .*(node_modules|node:internal|internal\/|<anonymous>)/;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

function tidy(text: string): string[] {
  return text.replace(ANSI, '').replace(/\r\n/g, '\n').split('\n').map((l) => (l.includes('\r') ? l.split('\r').filter(Boolean).pop() || '' : l));
}

export interface CompactStats { pass?: number; noise?: number; frames?: number; dup?: number; blank?: number; omitted?: number }
export interface CompactResult { text: string; changed: boolean; stats: CompactStats; from?: number; to?: number }

export function compact(input: string, { max = 150 }: { max?: number } = {}): CompactResult {
  const raw = tidy(input);
  while (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
  if (raw.length < 40) return { text: raw.join('\n'), changed: false, stats: {} };

  const stats: Required<CompactStats> = { pass: 0, noise: 0, frames: 0, dup: 0, blank: 0, omitted: 0 };
  let lines: string[] = [];
  for (const l of raw) {
    if (FAILURE.test(l) && !PASS_LINE.test(l)) { lines.push(l); continue; }
    if (PASS_LINE.test(l) && !/[FEx]/.test(l.replace(/\[\s*\d+%\]/, ''))) { stats.pass++; continue; }
    if (LIB_FRAME.test(l)) { stats.frames++; continue; }
    if (l.trim() !== '' && PROGRESS.test(l)) { stats.noise++; continue; }
    if (l.trim() === '' && lines.length && lines[lines.length - 1].trim() === '') { stats.blank++; continue; }
    lines.push(l);
  }
  // merge consecutive duplicates
  const merged: { line: string; n: number }[] = [];
  for (const l of lines) {
    const prev = merged[merged.length - 1];
    if (prev && prev.line === l && l.trim() !== '') prev.n++;
    else merged.push({ line: l, n: 1 });
  }
  stats.dup = lines.length - merged.length;
  lines = merged.map((m) => (m.n > 1 ? `${m.line}  (x${m.n})` : m.line));

  // budget: keep first 10, last 25 and every failure line with context; fill the rest in order
  if (lines.length > max) {
    const keep = new Array(lines.length).fill(false);
    for (let i = 0; i < Math.min(10, lines.length); i++) keep[i] = true;
    for (let i = Math.max(0, lines.length - 25); i < lines.length; i++) keep[i] = true;
    lines.forEach((l, i) => {
      if (FAILURE.test(l)) for (let k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 4); k++) keep[k] = true;
    });
    let used = keep.filter(Boolean).length;
    for (let i = 0; i < lines.length && used < max; i++) if (!keep[i]) { keep[i] = true; used++; }
    const out: string[] = [];
    let gap = 0;
    lines.forEach((l, i) => {
      if (keep[i]) { if (gap) { out.push(`[... ${gap} lines omitted ...]`); stats.omitted += gap; gap = 0; } out.push(l); } else gap++;
    });
    if (gap) { out.push(`[... ${gap} lines omitted ...]`); stats.omitted += gap; }
    lines = out;
  }

  const saved = 1 - lines.join('\n').length / Math.max(1, raw.join('\n').length);
  if (saved < 0.15) return { text: raw.join('\n'), changed: false, stats };
  return { text: lines.join('\n'), changed: true, stats, from: raw.length, to: lines.length };
}

function footer(r: CompactResult, rawPath: string | null): string {
  const s = r.stats;
  const parts = [s.pass && `${s.pass} passing-test`, s.frames && `${s.frames} library frames`, s.noise && `${s.noise} progress`, s.dup && `${s.dup} duplicates`, s.blank && `${s.blank} blank`, s.omitted && `${s.omitted} omitted`].filter(Boolean);
  return `[compacted ${r.from} -> ${r.to} lines; dropped ${parts.join(', ') || 'noise'}${rawPath ? '; full output: ' + rawPath : ''}]`;
}

function saveRaw(dir: string, text: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.writeFileSync(file, text);
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().slice(0, -20);
  for (const f of old) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* best effort */ } }
  return file;
}

export interface FinishOptions { max?: number; saveRaw?: string | null }

export function finish(text: string, opts: FinishOptions): string {
  const r = compact(text, opts);
  if (!r.changed) return r.text;
  const rawPath = opts.saveRaw ? saveRaw(opts.saveRaw, text) : null;
  return r.text + '\n' + footer(r, rawPath);
}

// Quote one argument for the shell that spawn({ shell: true }) uses: cmd.exe on Windows, sh elsewhere.
export function quoteArg(a: string, win: boolean = process.platform === 'win32'): string {
  if (/^[\w@%+=:,./\\-]+$/.test(a)) return a;
  if (win) {
    // Windows quoting: escape quotes and preserve backslashes before quotes / at end.
    const escaped = a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/g, '$1$1');
    return `"${escaped}"`;
  }
  return `'${a.replace(/'/g, "'\\''")}'`;
}

interface MainOptions extends FinishOptions { reportExit?: boolean }

function main(): void {
  const a = process.argv.slice(2);
  const home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
  const opts: MainOptions = { max: 150, saveRaw: path.join(home, 'raw') };
  const dd = a.indexOf('--');
  const own = dd === -1 ? a : a.slice(0, dd);
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--max') opts.max = Number(own[++i]);
    else if (own[i] === '--save-raw') opts.saveRaw = own[++i];
    else if (own[i] === '--no-save-raw') opts.saveRaw = null;
    else if (own[i] === '--report-exit') opts.reportExit = true;
  }
  if (dd !== -1) {
    const cmd = a.slice(dd + 1);
    if (!cmd.length) { console.error('compact: no command after --'); process.exitCode = 2; return; }
    // One string, no args array: Node would only concatenate the args unquoted (and warns, DEP0190).
    const line = cmd.length === 1 ? cmd[0] : cmd.map((x) => quoteArg(x)).join(' ');
    const child = spawn(line, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout!.on('data', (d) => { buf += d; });
    child.stderr!.on('data', (d) => { buf += d; });
    child.on('error', (e) => { console.error('compact: ' + e.message); process.exitCode = 127; });
    child.on('close', (code) => {
      const c = code == null ? 1 : code;
      process.stdout.write(finish(buf, opts) + '\n');
      if (opts.reportExit) process.stdout.write(`exit code: ${c}\n`); else process.exitCode = c;
    });
    return;
  }
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { buf += d; });
  process.stdin.on('end', () => { process.stdout.write(finish(buf, opts) + '\n'); });
}

if (require.main === module) main();
