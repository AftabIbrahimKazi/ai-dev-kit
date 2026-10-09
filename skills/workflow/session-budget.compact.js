#!/usr/bin/env node
// Shrinks long command output (tests, builds, installs) without dropping any failure line.
// Works in any tool: pipe text in, or let it run the command and keep the exit code.
//
//   node compact.js < output.txt                 compact stdin
//   node compact.js -- npm test                  run the command, print compacted output, exit with its code
//   node compact.js -- "npm test -- -t 'a b'"    one argument is used as the whole command line, as typed
//   options: --max N (line budget, default 150)  --save-raw DIR  --no-save-raw
//   When output is compacted, the full text is kept in ~/.ai-dev-kit/raw (AI_DEV_KIT_HOME overrides), newest 20.
//
// Contract: every line that looks like a failure survives (see FAILURE). Only these are dropped or merged:
// ANSI codes, progress/spinner lines, repeated blank lines, passing-test lines, library stack frames, and
// consecutive duplicate lines (merged as "line  (x N)"). Output under 40 lines or saving under 15% is returned unchanged.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FAILURE = /(error|fail|✗|✘|✖|×|exception|panic|traceback|fatal|denied|cannot|can't|unable|undefined|assert|expected|received|warn|deprecat|⚠|not ok|exit code|time(?:d)? ?out|missing|invalid|unexpected|\bTS\d{4}\b)/i;
const PASS_LINE = /^\s*(✓|✔|√)\s|^\s*PASS\s|^\s*ok \d+\s+-\s|^\s*[.sS]+(\s+\[\s*\d+%\])?\s*$/;
const PROGRESS = /^[\s⠁-⣿\-=#>|/\\]*$|^\s*\d{1,3}%|\bnpm http fetch\b|^\s*[#=>\-]{6,}\s*\d*%?\s*$/;
const LIB_FRAME = /^\s+at .*(node_modules|node:internal|internal\/|<anonymous>)/;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

function tidy(text) {
  return text.replace(ANSI, '').replace(/\r\n/g, '\n').split('\n').map((l) => (l.includes('\r') ? l.split('\r').filter(Boolean).pop() || '' : l));
}

function compact(input, { max = 150 } = {}) {
  const raw = tidy(input);
  while (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
  if (raw.length < 40) return { text: raw.join('\n'), changed: false, stats: {} };

  const stats = { pass: 0, noise: 0, frames: 0, dup: 0, blank: 0, omitted: 0 };
  let lines = [];
  for (const l of raw) {
    if (FAILURE.test(l) && !PASS_LINE.test(l)) { lines.push(l); continue; }
    if (PASS_LINE.test(l) && !/[FEx]/.test(l.replace(/\[\s*\d+%\]/, ''))) { stats.pass++; continue; }
    if (LIB_FRAME.test(l)) { stats.frames++; continue; }
    if (l.trim() !== '' && PROGRESS.test(l)) { stats.noise++; continue; }
    if (l.trim() === '' && lines.length && lines[lines.length - 1].trim() === '') { stats.blank++; continue; }
    lines.push(l);
  }
  // merge consecutive duplicates
  const merged = [];
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
    const out = [];
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

function footer(r, rawPath) {
  const s = r.stats;
  const parts = [s.pass && `${s.pass} passing-test`, s.frames && `${s.frames} library frames`, s.noise && `${s.noise} progress`, s.dup && `${s.dup} duplicates`, s.blank && `${s.blank} blank`, s.omitted && `${s.omitted} omitted`].filter(Boolean);
  return `[compacted ${r.from} -> ${r.to} lines; dropped ${parts.join(', ') || 'noise'}${rawPath ? '; full output: ' + rawPath : ''}]`;
}

function saveRaw(dir, text) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.writeFileSync(file, text);
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().slice(0, -20);
  for (const f of old) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* best effort */ } }
  return file;
}

function finish(text, opts) {
  const r = compact(text, opts);
  if (!r.changed) return r.text;
  const rawPath = opts.saveRaw ? saveRaw(opts.saveRaw, text) : null;
  return r.text + '\n' + footer(r, rawPath);
}

// Quote one argument for the shell that spawn({ shell: true }) uses: cmd.exe on Windows, sh elsewhere.
function quoteArg(a, win = process.platform === 'win32') {
  if (/^[\w@%+=:,./\\-]+$/.test(a)) return a;
  return win ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, "'\\''")}'`;
}

function main() {
  const a = process.argv.slice(2);
  const home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
  const opts = { max: 150, saveRaw: path.join(home, 'raw') };
  const dd = a.indexOf('--');
  const own = dd === -1 ? a : a.slice(0, dd);
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--max') opts.max = Number(own[++i]);
    else if (own[i] === '--save-raw') opts.saveRaw = own[++i];
    else if (own[i] === '--no-save-raw') opts.saveRaw = null;
  }
  if (dd !== -1) {
    const cmd = a.slice(dd + 1);
    if (!cmd.length) { console.error('compact: no command after --'); process.exitCode = 2; return; }
    // One string, no args array: Node would only concatenate the args unquoted (and warns, DEP0190).
    const line = cmd.length === 1 ? cmd[0] : cmd.map((x) => quoteArg(x)).join(' ');
    const child = spawn(line, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { buf += d; });
    child.on('error', (e) => { console.error('compact: ' + e.message); process.exitCode = 127; });
    child.on('close', (code) => { process.stdout.write(finish(buf, opts) + '\n'); process.exitCode = code == null ? 1 : code; });
    return;
  }
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { buf += d; });
  process.stdin.on('end', () => { process.stdout.write(finish(buf, opts) + '\n'); });
}

if (require.main === module) main();
module.exports = { compact, finish, quoteArg, FAILURE };
