#!/usr/bin/env node
// Mechanical per-file checks for the pre-merge-gate skill; also run by the edit-check mod after each edit.
// Prints only problems (nothing when clean), one line each: path:line  rule  message. Exit 1 on findings.
//
//   node edit-check.js <file...> [--cwd D] [--json]
//
// Checks, in order: syntax (js/mjs/cjs, json, php, py), the project's ESLint / Stylelint when installed with a
// config, tsc when enabled, and the coding-standards rules when the project has them. The rules come from the
// code-audit engine (the "edit" profile) when it is installed next to this skill; without it a frozen copy of the
// same seven rules below runs. tests/code-audit.test.js asserts the two agree. Project-wide audits: code-audit.
// Config (optional): <cwd>/.claude/edit-check.json
//   { "standards": "auto|on|off", "tsc": false, "eslint": true, "stylelint": true, "ignore": ["glob"...], "styleBlocks": "count|forbid" }
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MAX_LINES = 15;
const CSS_EXT = /\.(css|scss|sass|less|pcss)$/i;
const MARKUP_EXT = /\.(html?|php|vue|svelte|astro|jsx|tsx|twig)$/i;
const TOKEN_FILE = /(token|variable|theme|palette|colou?rs?)/i;
const EMAIL_FILE = /e-?mail|mailer|newsletter/i;

const norm = (p) => p.split(path.sep).join('/');
const run = (cmd, args, cwd, timeout = 25000) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
const which = (bin) => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' }); return r.status === 0; };

function loadConfig(cwd) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'edit-check.json'), 'utf8')); } catch { return {}; }
}
function globRe(g) {
  const s = norm(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
  return new RegExp('(^|/)' + s + '$');
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const blank = (m) => m.replace(/[^\n]/g, ' '); // keep newlines so line numbers survive

// The code-audit engine: installed as a sibling skill folder, or beside this file in the kit repo.
let auditEngine;
function engine() {
  if (auditEngine !== undefined) return auditEngine;
  auditEngine = null;
  for (const p of [path.join(__dirname, '..', 'code-audit', 'audit.js'), path.join(__dirname, 'code-audit.audit.js'), path.join(__dirname, '..', 'standards', 'code-audit.audit.js')]) {
    try { if (fs.existsSync(p)) { auditEngine = require(p); break; } } catch { /* a broken engine falls back to the frozen pack */ }
  }
  return auditEngine;
}

// ---- standards pack (frozen fallback: the engine's "edit" profile is the maintained copy) ----
function standards(rel, text) {
  const out = [];
  const add = (line, rule, msg) => out.push({ file: rel, line, rule, msg });
  if (CSS_EXT.test(rel)) {
    let css = text.replace(/\/\*[\s\S]*?\*\//g, blank);
    if (/\.(scss|sass|less)$/i.test(rel)) css = css.replace(/(^|[^:])(\/\/[^\n]*)/g, (m, p, c) => p + blank(c)); // line comments, not url(http://...)
    css.split('\n').forEach((l, i) => {
      if (/!\s*important\b/i.test(l)) add(i + 1, 'css-14', '!important is banned');
      if (/\bfont-weight\s*:\s*(bold|bolder|lighter|normal|semi-?bold|medium|light)\b/i.test(l)) add(i + 1, 'css-04', 'font-weight must be numeric');
      // custom-property definitions (--x: #fff) are how tokens are declared, so they are not flagged here
      const noUrl = l.replace(/url\([^)]*\)/gi, '').replace(/--[\w-]+\s*:[^;}]*/g, '');
      if (!TOKEN_FILE.test(path.basename(rel)) && /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\s*\(/i.test(noUrl)) add(i + 1, 'css-10', 'hardcoded colour, use a token');
    });
  }
  if (MARKUP_EXT.test(rel)) {
    for (const m of text.matchAll(/<img\b[^>]*>/gis)) {
      if (!/\balt\s*=/i.test(m[0]) && !/\{\s*\.\.\./.test(m[0])) add(lineOf(text, m.index), 'h-04', '<img> has no alt attribute');
    }
    for (const m of text.matchAll(/\sstyle\s*=/gi)) add(lineOf(text, m.index), 'h-02', 'inline style');
    for (const m of text.matchAll(/\s(align|valign|bgcolor)\s*=/gi)) add(lineOf(text, m.index), 'h-05', `presentational attribute ${m[1].toLowerCase()}`);
    if (!EMAIL_FILE.test(rel)) for (const m of text.matchAll(/<(br|strong|small)\b/gi)) add(lineOf(text, m.index), 'h-10', `<${m[1].toLowerCase()}> is banned in UI markup`);
  }
  return out;
}

// ---- syntax and project linters ----
function syntax(rel, abs, text, cwd) {
  const ext = path.extname(rel).toLowerCase();
  const fail = (msg, line = 1) => [{ file: rel, line, rule: 'syntax', msg }];
  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    const r = run(process.execPath, ['--check', abs], cwd, 15000);
    if (r.status !== 0) {
      const l = (r.stderr || '').split('\n').find((x) => /SyntaxError/.test(x)) || 'syntax error';
      const n = /:(\d+)\s*$/m.exec((r.stderr || '').split('\n')[0] || '');
      return fail(l.trim(), n ? Number(n[1]) : 1);
    }
  } else if (ext === '.json') {
    try { JSON.parse(text); } catch (e) { return fail('invalid JSON: ' + e.message); }
  } else if (ext === '.php' && which('php')) {
    const r = run('php', ['-l', abs], cwd, 15000);
    if (r.status !== 0) {
      const o = (r.stdout + r.stderr).split('\n').find((x) => /error/i.test(x)) || 'php syntax error';
      const n = /on line (\d+)/.exec(o);
      return fail(o.replace(/^PHP /, '').replace(/ in .* on line \d+/, '').trim(), n ? Number(n[1]) : 1);
    }
  } else if (ext === '.py' && which('python')) {
    const r = run('python', ['-m', 'py_compile', abs], cwd, 15000);
    if (r.status !== 0) return fail(((r.stderr || '').trim().split('\n').pop() || 'python syntax error'));
  }
  return [];
}

function hasAny(cwd, names) { return names.some((n) => fs.existsSync(path.join(cwd, n))); }
function binPath(cwd, candidates) { return candidates.map((c) => path.join(cwd, c)).find((p) => fs.existsSync(p)); }

function eslint(rel, abs, cwd) {
  if (!/\.(js|jsx|ts|tsx|mjs|cjs|vue)$/i.test(rel)) return [];
  const cfg = hasAny(cwd, ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml']);
  const bin = binPath(cwd, ['node_modules/eslint/bin/eslint.js']);
  if (!cfg || !bin) return [];
  const r = run(process.execPath, [bin, '-f', 'json', '--no-warn-ignored', abs], cwd);
  try {
    return JSON.parse(r.stdout).flatMap((f) => f.messages.map((m) => ({ file: rel, line: m.line || 1, rule: 'eslint:' + (m.ruleId || 'parse'), msg: m.message })));
  } catch { return []; }
}

function stylelint(rel, abs, cwd) {
  if (!CSS_EXT.test(rel)) return [];
  const cfg = hasAny(cwd, ['stylelint.config.js', 'stylelint.config.cjs', 'stylelint.config.mjs', '.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs', '.stylelintrc.yml']);
  const bin = binPath(cwd, ['node_modules/stylelint/bin/stylelint.mjs', 'node_modules/stylelint/bin/stylelint.js']);
  if (!cfg || !bin) return [];
  const r = run(process.execPath, [bin, '-f', 'json', abs], cwd);
  try {
    const j = JSON.parse(r.stdout || r.stderr);
    return j.flatMap((f) => f.warnings.map((w) => ({ file: rel, line: w.line || 1, rule: 'stylelint:' + w.rule, msg: w.text.replace(/\s*\(.*\)\s*$/, '') })));
  } catch { return []; }
}

function tsc(rel, cwd) {
  if (!/\.(ts|tsx)$/i.test(rel) || !fs.existsSync(path.join(cwd, 'tsconfig.json'))) return [];
  const bin = binPath(cwd, ['node_modules/typescript/bin/tsc']);
  if (!bin) return [];
  const r = run(process.execPath, [bin, '--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], cwd, 60000);
  const out = [];
  for (const l of (r.stdout || '').split('\n')) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(l.trim());
    if (m && norm(path.resolve(cwd, m[1])) === norm(path.resolve(cwd, rel))) out.push({ file: rel, line: Number(m[2]), rule: m[3], msg: m[4] });
  }
  return out;
}

function checkFile(file, cwd, cfg) {
  const abs = path.resolve(cwd, file);
  const rel = norm(path.relative(cwd, abs));
  if (rel.startsWith('..') || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return [];
  if (/(^|\/)(node_modules|\.git|dist|build|\.next|vendor)\//.test(rel)) return [];
  if ((cfg.ignore || []).some((g) => globRe(g).test(rel))) return [];
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { return []; }
  if (text.length > 2 * 1024 * 1024) return [];
  const out = syntax(rel, abs, text, cwd);
  if (!out.length) {
    if (cfg.eslint !== false) out.push(...eslint(rel, abs, cwd));
    if (cfg.stylelint !== false) out.push(...stylelint(rel, abs, cwd));
    if (cfg.tsc === true) out.push(...tsc(rel, cwd));
  }
  const std = cfg.standards || 'auto';
  if (std === 'on' || (std === 'auto' && fs.existsSync(path.join(cwd, 'coding-standards')))) out.push(...(engine() ? engine().checkText(rel, text, cfg, 'edit') : standards(rel, text)));
  return out;
}

function main() {
  const a = process.argv.slice(2);
  let cwd = process.cwd();
  let json = false;
  const files = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--cwd') cwd = path.resolve(a[++i]);
    else if (a[i] === '--json') json = true;
    else files.push(a[i]);
  }
  const cfg = loadConfig(cwd);
  const findings = files.flatMap((f) => checkFile(f, cwd, cfg));
  if (json) console.log(JSON.stringify(findings, null, 2));
  else if (findings.length) {
    const lines = findings.slice(0, MAX_LINES).map((f) => `${f.file}:${f.line}  ${f.rule}  ${f.msg}`);
    if (findings.length > MAX_LINES) lines.push(`(+${findings.length - MAX_LINES} more)`);
    console.log(lines.join('\n'));
  }
  process.exitCode = findings.length ? 1 : 0;
}

if (require.main === module) main();
module.exports = { checkFile, standards, loadConfig };
