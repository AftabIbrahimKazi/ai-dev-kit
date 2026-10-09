#!/usr/bin/env node
// Mechanical half of the pre-commit skill: staged-diff checks that need no judgment.
// Works in any tool (plain Node + git). Prints a compact report; exit 1 when a BLOCK finding exists.
//
//   node check.js [--staged | --all | --push] [--files a,b] [--message TEXT | --message-file F] [--cwd D] [--json]
//   node check.js --detect "<shell command>" [--shell powershell]  -> JSON describing any git commit/push in it
//
// Modes: --staged (default) the index; --all tracked changes vs HEAD (git commit -a); --push commits no remote has.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|astro|html|php)$/i;
const DEBUG = [
  ['console.log/debug', /console\.(log|debug)\s*\(/],
  ['debugger', /\bdebugger\s*;/],
  ['FIXME', /\bFIXME\b/],
];
// block: a match is a leak with high confidence. Generic assignments only warn.
const SECRETS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/, true],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}/, true],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/, true],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/, true],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, true],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/, true],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, true],
  ['generic credential assignment', /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['"][^'"\s]{16,}['"]/i, false],
];
const SENSITIVE_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]+)?|id_rsa|id_ed25519|credentials\.json|[^/]+\.(pem|pfx|p12|key))$/i;
// Debug probes are normal in tests and in CLI scripts (output is their job): skip those paths.
const SKIP_DEBUG = /(^|\/)(\.claude|tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[a-z]+$/i;
const isCliScript = (cwd, file) => {
  try {
    const fd = fs.openSync(path.join(cwd, file), 'r');
    const b = Buffer.alloc(2);
    fs.readSync(fd, b, 0, 2, 0);
    fs.closeSync(fd);
    return b.toString() === '#!';
  } catch { return false; }
};
const COMMIT_TYPES =['feat', 'fix', 'patch', 'style', 'refactor', 'chore', 'docs', 'test', 'remove'];
const BIG_FILE = 1024 * 1024;

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { out: r.stdout || '', err: r.stderr || '', code: r.status };
}

// ---- diff parsing: added lines with file and new line number ----
function addedLines(diffText) {
  const rows = [];
  let file = null;
  let n = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { n = Number(h[1]); continue; }
    if (file && line.startsWith('+') && !line.startsWith('+++')) { rows.push({ file, line: n, text: line.slice(1) }); n++; }
  }
  return rows;
}

// handover/locks.d/ is role-session lane state (gitignored, claimed by mkdir). This check runs inside a hook,
// so git is told to leave it out: its content is never read. Handover notes are scanned like any file.
const LANE = 'handover/locks.d';
function collect(mode, cwd, files) {
  const scope = ['--', ...(files && files.length ? files : [':/']), `:(top,exclude)${LANE}`];
  if (mode === 'push') {
    // Whole range in one call each: a repo with no remote counts its full history as unpushed.
    const range = ['HEAD', '--not', '--remotes'];
    const count = Number(git(['rev-list', '--count', ...range], cwd).out.trim()) || 0;
    if (!count) return { diff: '', names: [], label: 'push, 0 unpushed commit(s)' };
    const diff = git(['log', '-p', '--format=', '-U0', '--no-color', ...range, ...scope], cwd).out;
    const names = new Set(git(['log', '--name-only', '--format=', ...range, ...scope], cwd).out.split('\n').filter(Boolean));
    return { diff, names: [...names], label: `push, ${count} unpushed commit(s)` };
  }
  if (mode === 'all') {
    return {
      diff: git(['diff', 'HEAD', '-U0', '--no-color', ...scope], cwd).out,
      names: git(['diff', 'HEAD', '--name-only', '--diff-filter=ACMR', ...scope], cwd).out.split('\n').filter(Boolean),
      label: 'tracked changes',
    };
  }
  return {
    diff: git(['diff', '--cached', '-U0', '--no-color', ...scope], cwd).out,
    names: git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', ...scope], cwd).out.split('\n').filter(Boolean),
    label: 'staged',
  };
}

const mask = (v) => `${v.slice(0, 4)}… (${v.length} chars)`; // never print a whole secret

function checkMessage(msg) {
  const out = [];
  const lines = msg.replace(/\r/g, '').split('\n');
  const header = lines[0] || '';
  const m = /^([a-z]+)(\([^)]+\))?(!)?: (.+)$/.exec(header);
  if (!m) out.push({ sev: 'BLOCK', kind: 'message', msg: `header "${header.slice(0, 50)}" is not "type: summary"` });
  else {
    if (!COMMIT_TYPES.includes(m[1])) out.push({ sev: 'BLOCK', kind: 'message', msg: `type "${m[1]}" not in ${COMMIT_TYPES.join('|')}` });
    if (header.length > 50) out.push({ sev: 'WARN', kind: 'message', msg: `header is ${header.length} chars (limit 50)` });
    if (/\.$/.test(m[4])) out.push({ sev: 'WARN', kind: 'message', msg: 'header ends with a period' });
  }
  if (lines.length > 1 && lines[1] !== '') out.push({ sev: 'WARN', kind: 'message', msg: 'no blank line after the header' });
  const long = lines.slice(2).filter((l) => l.length > 72 && !/^\s*(?:https?:|BREAKING CHANGE:)/.test(l)).length;
  if (long) out.push({ sev: 'WARN', kind: 'message', msg: `${long} body line(s) over 72 chars` });
  return out;
}

function check(opts) {
  const cwd = opts.cwd || process.cwd();
  const mode = opts.mode || 'staged';
  const { diff, names, label } = collect(mode, cwd, opts.files);
  const findings = [];

  for (const f of names) {
    if (SENSITIVE_FILE.test(f)) findings.push({ sev: 'BLOCK', kind: 'file', file: f, msg: 'secret-bearing file is in the change set' });
    const abs = path.join(cwd, f);
    try { if (mode !== 'push' && fs.statSync(abs).size > BIG_FILE) findings.push({ sev: 'WARN', kind: 'size', file: f, msg: `${(fs.statSync(abs).size / BIG_FILE).toFixed(1)} MB file` }); } catch { /* deleted or unreadable */ }
  }

  const cli = new Map(); // shebang check once per file, not once per added line
  const isCli = (f) => { if (!cli.has(f)) cli.set(f, isCliScript(cwd, f)); return cli.get(f); };
  for (const r of addedLines(diff)) {
    for (const [name, re, block] of SECRETS) {
      const m = re.exec(r.text);
      if (m) findings.push({ sev: block ? 'BLOCK' : 'WARN', kind: 'secret', file: r.file, line: r.line, msg: `${name} ${mask(m[0])}` });
    }
    if (CODE_EXT.test(r.file) && !SKIP_DEBUG.test(r.file) && !isCli(r.file)) {
      for (const [name, re] of DEBUG) if (re.test(r.text)) findings.push({ sev: 'WARN', kind: 'debug', file: r.file, line: r.line, msg: name });
    }
  }

  if (mode === 'staged') {
    const lane = git(['diff', '--cached', '--name-only', '--', `:(top)${LANE}`], cwd).out.split('\n').filter(Boolean); // names only
    if (lane.length) findings.push({ sev: 'WARN', kind: 'lane-state', msg: `${lane.length} file(s) under ${LANE}/ staged: local lane state, unstage it and add ${LANE}/ to .gitignore` });
    const staged = new Set(names);
    const dirty = git(['diff', '--name-only'], cwd).out.split('\n').filter((f) => staged.has(f));
    if (dirty.length) findings.push({ sev: 'WARN', kind: 'half-staged', msg: `unstaged edits also in: ${dirty.slice(0, 5).join(', ')}` });
    const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd).out.split('\n').filter(Boolean);
    if (untracked.length) findings.push({ sev: 'WARN', kind: 'untracked', msg: `${untracked.length} untracked: ${untracked.slice(0, 6).join(', ')}${untracked.length > 6 ? ', …' : ''}` });
  }

  if (opts.message) findings.push(...checkMessage(opts.message));
  return { label, files: names.length, findings };
}

function report(res) {
  const b = res.findings.filter((f) => f.sev === 'BLOCK').length;
  const w = res.findings.length - b;
  const head = `precommit-check (${res.label}, ${res.files} file(s)): ${b} BLOCK, ${w} WARN`;
  const rows = res.findings
    .sort((x, y) => (x.sev === y.sev ? 0 : x.sev === 'BLOCK' ? -1 : 1))
    .map((f) => `${f.sev.padEnd(5)} ${f.kind}${f.file ? '  ' + f.file + (f.line ? ':' + f.line : '') : ''}  ${f.msg}`);
  return [head, ...rows].join('\n');
}

// ---- shell command parsing: is this a git commit or push, and with what? ----
// ps = PowerShell: backtick escapes (backslash is a plain path character), '' inside single quotes,
// @'...'@ / @"..."@ here-strings, and a lone & is the call operator, not a separator.
function tokenize(cmd, ps = false) {
  const ESC = ps ? '`' : '\\';
  const segments = [];
  let toks = [];
  let cur = '';
  let has = false;
  let q = null;
  const endTok = () => { if (has) toks.push(cur); cur = ''; has = false; };
  const endSeg = () => { endTok(); if (toks.length) segments.push(toks); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) { if (ps && q === "'" && cmd[i + 1] === "'") { cur += "'"; i++; } else q = null; }
      else if (c === ESC && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (ps && c === '@' && (cmd[i + 1] === "'" || cmd[i + 1] === '"') && /^\r?\n/.test(cmd.slice(i + 2, i + 4))) {
      const close = '\n' + cmd[i + 1] + '@'; // the closing quote and @ start a line
      const start = cmd.indexOf('\n', i + 2) + 1;
      const end = cmd.indexOf(close, start - 1);
      cur += cmd.slice(start, end < 0 ? cmd.length : end).replace(/\r$/, '');
      has = true;
      i = end < 0 ? cmd.length : end + close.length - 1;
    } else if (c === '"' || c === "'") { q = c; has = true; }
    else if (c === ESC && i + 1 < cmd.length) { cur += cmd[++i]; has = true; }
    else if (/\s/.test(c) && c !== '\n') endTok();
    else if (c === '\n' || c === ';') endSeg();
    else if (c === '&' || c === '|') {
      if (ps && c === '&' && cmd[i + 1] !== '&') { endTok(); continue; }
      endSeg(); if (cmd[i + 1] === c) i++;
    }
    else { cur += c; has = true; }
  }
  endSeg();
  return segments;
}

function detect(cmd, ps = false) {
  const res = { isCommit: false, isPush: false, all: false, amend: false, noVerify: false, force: false, stages: false, messages: [], unparsableMessage: false };
  const dynamic = ps ? /\$\(/ : /\$\(|`/; // text the shell would substitute before git sees it
  for (const toks of tokenize(cmd, ps)) {
    let i = 0;
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
    if (!toks[i] || path.basename(toks[i]).replace(/\.exe$/i, '') !== 'git') continue;
    i++;
    while (i < toks.length && toks[i].startsWith('-')) {
      i += toks[i] === '-c' || toks[i] === '-C' ? 2 : 1;
    }
    const sub = toks[i];
    const rest = toks.slice(i + 1);
    if (['add', 'rm', 'mv', 'stash', 'apply', 'restore', 'checkout', 'reset', 'merge', 'rebase', 'cherry-pick'].includes(sub)) res.stages = true;
    if (sub === 'commit') {
      res.isCommit = true;
      for (let k = 0; k < rest.length; k++) {
        const t = rest[k];
        if (t === '--all' || (/^-[a-zA-Z]+$/.test(t) && t.includes('a') && !/^-[mFC]/.test(t))) res.all = true;
        if (t === '--amend') res.amend = true;
        if (t === '--no-verify' || t === '-n') res.noVerify = true;
        let msg = null;
        if (t === '-m' || t === '--message') msg = rest[++k];
        else if (t.startsWith('--message=')) msg = t.slice(10);
        else if (/^-[a-zA-Z]*m$/.test(t) && t !== '-m') msg = rest[++k]; // -am "text"
        else if (/^-m./.test(t)) msg = t.slice(2);
        if (msg != null) { if (dynamic.test(msg)) res.unparsableMessage = true; else res.messages.push(msg); }
        if (t === '-F' || t === '--file' || t === '-C' || t === '-c') res.unparsableMessage = true;
      }
    } else if (sub === 'push') {
      res.isPush = true;
      if (rest.some((t) => t === '-f' || t === '--force' || t.startsWith('--force-with-lease') || t === '--force-if-includes')) res.force = true;
    }
  }
  return res;
}

function main() {
  const a = process.argv.slice(2);
  const opt = { mode: 'staged' };
  let json = false;
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--json') json = true;
    else if (k === '--staged') opt.mode = 'staged';
    else if (k === '--all') opt.mode = 'all';
    else if (k === '--push') opt.mode = 'push';
    else if (k === '--files') opt.files = a[++i].split(',').filter(Boolean);
    else if (k === '--message') opt.message = a[++i];
    else if (k === '--message-file') opt.message = fs.readFileSync(a[++i], 'utf8');
    else if (k === '--cwd') opt.cwd = a[++i];
    else if (k === '--detect') {
      const s = a.indexOf('--shell');
      console.log(JSON.stringify(detect(a[++i] || '', s >= 0 && /^(powershell|pwsh)$/i.test(a[s + 1] || ''))));
      return;
    }
  }
  const res = check(opt);
  console.log(json ? JSON.stringify(res, null, 2) : report(res));
  process.exitCode = res.findings.some((f) => f.sev === 'BLOCK') ? 1 : 0;
}

if (require.main === module) main();
module.exports = { check, detect, checkMessage, addedLines, tokenize, report };
