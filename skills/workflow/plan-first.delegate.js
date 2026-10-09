#!/usr/bin/env node
// Runs a plan on a cheaper Claude model in one headless call and prints a compact result.
// Part of plan-first's delegated execution (plan mode only). Claude Code executor only for now.
//
//   node delegate.js <plan-file> --tier haiku|sonnet|opus [--cwd D] [--cli PATH] [--timeout SEC] [--dry-run]
//
// Prints: model, exit, time, cost, tokens, the files the run changed, and the executor's short report.
// Appends one row to ~/.ai-dev-kit/ledger/delegate.jsonl (override the folder with AI_DEV_KIT_HOME).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const TOOLS = 'Bash,Read,Edit,Write,Glob,Grep';
// The plan header says "do not commit"; these make it a rule the CLI enforces, not a request.
const DENIED = ['Bash(git commit:*)', 'Bash(git push:*)'];

function semverKey(name) {
  const m = /claude-code-(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? m.map(Number).slice(1) : [0, 0, 0];
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function pathHits() {
  const w = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return w.status === 0 ? w.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

// A PATH hit that can be spawned without a shell. On Windows `where` lists npm's extensionless sh shim first,
// which cannot run; take a .exe, or turn npm's claude.cmd into the cli.js it wraps (run with node).
function runnable(hit, platform) {
  if (platform !== 'win32') return hit;
  if (/\.exe$/i.test(hit)) return hit;
  if (/\.cmd$/i.test(hit)) {
    const js = path.join(path.dirname(hit), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(js)) return js;
  }
  return null;
}

// Finds the Claude Code binary: --cli, CLAUDE_CODE_BIN, PATH, the newest VS Code extension copy, ~/.local/bin.
function findCli(explicit, home = os.homedir(), env = process.env, hits = pathHits, platform = process.platform) {
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  if (env.CLAUDE_CODE_BIN && fs.existsSync(env.CLAUDE_CODE_BIN)) return env.CLAUDE_CODE_BIN;
  for (const h of hits()) { const p = runnable(h, platform); if (p) return p; }
  const exe = platform === 'win32' ? 'claude.exe' : 'claude';
  const extDir = path.join(home, '.vscode', 'extensions');
  if (fs.existsSync(extDir)) {
    const cands = fs.readdirSync(extDir).filter((d) => d.startsWith('anthropic.claude-code-'))
      .sort((a, b) => cmp(semverKey(b), semverKey(a)))
      .map((d) => path.join(extDir, d, 'resources', 'native-binary', exe)).filter((p) => fs.existsSync(p));
    if (cands.length) return cands[0];
  }
  const local = path.join(home, '.local', 'bin', exe);
  return fs.existsSync(local) ? local : null;
}

function buildArgs(tier) {
  // --disallowedTools takes several values, so it stays last (the plan goes in on stdin, not as an argument).
  return ['-p', '--model', MODELS[tier], '--effort', 'low', '--output-format', 'json', '--no-session-persistence',
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS, '--disallowedTools', ...DENIED];
}

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const lines = (r) => (r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []);
const sig = (cwd, f) => { try { const s = fs.statSync(path.join(cwd, f)); return `${s.size}:${s.mtimeMs}`; } catch { return null; } };

// What the tree looked like before the run. `git stash create` stores the working tree as a commit without
// touching anything, so a file that was already dirty and is edited again still shows up afterwards.
function snapshot(cwd) {
  if (git(cwd, 'rev-parse', '--is-inside-work-tree').status !== 0) return null;
  const stash = git(cwd, 'stash', 'create');
  const hasHead = git(cwd, 'rev-parse', '--verify', '-q', 'HEAD').status === 0;
  const base = (stash.status === 0 && stash.stdout.trim()) || (hasHead ? 'HEAD' : null);
  const untracked = new Map(lines(git(cwd, 'ls-files', '--others', '--exclude-standard')).map((f) => [f, sig(cwd, f)]));
  const status = new Set(lines(git(cwd, 'status', '--porcelain')));
  return { base, untracked, status };
}

// Files the run created, changed or deleted, relative to the snapshot.
function changedSince(cwd, snap) {
  if (!snap) return null;
  const out = new Set();
  if (snap.base) for (const f of lines(git(cwd, 'diff', '--name-only', snap.base))) out.add(f);
  else for (const l of lines(git(cwd, 'status', '--porcelain'))) if (!snap.status.has(l)) out.add(l.slice(3)); // no commit yet
  for (const f of lines(git(cwd, 'ls-files', '--others', '--exclude-standard'))) if (snap.untracked.get(f) !== sig(cwd, f)) out.add(f);
  return [...out];
}

function words(text, n) {
  const w = String(text || '').trim().split(/\s+/);
  return w.length > n ? w.slice(0, n).join(' ') + ' …' : w.join(' ');
}

function run(opts) {
  const { planFile, tier, cwd, cliPath, timeoutSec = 900, dryRun = false, home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit') } = opts;
  if (!MODELS[tier]) return { code: 2, text: `delegate: unknown tier "${tier}" (use ${Object.keys(MODELS).join('|')})` };
  if (!planFile || !fs.existsSync(planFile)) return { code: 2, text: `delegate: plan file not found: ${planFile}` };
  const cli = findCli(cliPath);
  if (!cli) return { code: 2, text: 'delegate: Claude Code binary not found. Pass --cli PATH or set CLAUDE_CODE_BIN, or ask the user to switch model with /model.' };
  const args = buildArgs(tier);
  const isJs = /\.(c|m)?js$/i.test(cli);
  const cmd = isJs ? process.execPath : cli;
  const full = isJs ? [cli, ...args] : args;
  if (dryRun) return { code: 0, text: `delegate (dry run): ${cmd} ${full.join(' ')}\n  cwd: ${cwd}\n  plan: ${planFile} (${fs.statSync(planFile).size} bytes)` };

  const before = snapshot(cwd);
  const t0 = Date.now();
  const r = spawnSync(cmd, full, { cwd, input: fs.readFileSync(planFile, 'utf8'), encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024 });
  const wall = Date.now() - t0;
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* not JSON: reported below */ }
  const changed = changedSince(cwd, before);

  const u = (j && j.usage) || {};
  const row = {
    ts: new Date().toISOString(), tier, model: MODELS[tier], exit: r.status, wallMs: wall,
    usd: j && j.total_cost_usd != null ? j.total_cost_usd : null, in: u.input_tokens, out: u.output_tokens,
    cr: u.cache_read_input_tokens, cw: u.cache_creation_input_tokens, turns: j && j.num_turns, files: changed ? changed.length : null,
  };
  try {
    const dir = path.join(home, 'ledger');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'delegate.jsonl'), JSON.stringify(row) + '\n');
  } catch { /* ledger is best effort */ }

  const n = (x) => (x == null ? '?' : Number(x).toLocaleString('en-US'));
  const out = [];
  if (r.error && r.error.code === 'ETIMEDOUT') out.push(`delegate: TIMED OUT after ${timeoutSec}s; the executor may have left partial edits.`);
  out.push(`delegate: ${tier} (${MODELS[tier]}, effort low) exit ${r.status} in ${(wall / 1000).toFixed(0)}s | cost ${row.usd == null ? 'n/a' : '$' + row.usd.toFixed(4)} | in ${n(u.input_tokens)} out ${n(u.output_tokens)} cache r ${n(u.cache_read_input_tokens)} w ${n(u.cache_creation_input_tokens)} | turns ${n(row.turns)}`);
  out.push(changed == null ? 'changed: unknown (not a git repo)' : changed.length ? `changed: ${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', …' : ''} (${changed.length} file(s) changed by this run)` : 'changed: nothing (no file differs from before the run)');
  if (j && j.result) out.push('executor report: ' + words(j.result, 120));
  else out.push('executor output was not JSON: ' + words((r.stdout || '') + ' ' + (r.stderr || ''), 60));
  out.push(`Verify it yourself: run the plan checks and read the diff${before && before.base && before.base !== 'HEAD' ? ` against the pre-run snapshot (git diff ${before.base.slice(0, 12)})` : ' (git diff)'}. The executor report is not proof.`);
  return { code: r.status === 0 && j && !j.is_error ? 0 : 1, text: out.join('\n'), row };
}

function main() {
  const a = process.argv.slice(2);
  const o = { planFile: undefined, tier: undefined, cwd: process.cwd() };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--tier') o.tier = a[++i];
    else if (k === '--cwd') o.cwd = path.resolve(a[++i]);
    else if (k === '--cli') o.cliPath = a[++i];
    else if (k === '--timeout') o.timeoutSec = Number(a[++i]);
    else if (k === '--dry-run') o.dryRun = true;
    else if (!o.planFile) o.planFile = a[i];
  }
  const res = run(o);
  console.log(res.text);
  process.exitCode = res.code;
}

if (require.main === module) main();
module.exports = { run, findCli, buildArgs, snapshot, changedSince, MODELS };
