#!/usr/bin/env node
// Runs the Stage 5 measurement on Kaggle for you: pushes bench.py as a private GPU script kernel, waits, downloads the
// output, prints the numbers. Uses your Kaggle token (KAGGLE_API_TOKEN or ~/.ai-dev-kit/.env) and spends free GPU quota.
//   node run.js [--dry-run] [--no-wait] [--fetch] [--user <name>] [--poll <seconds>] [--rating clearly-better|not-better]
//   --dry-run  write the kernel folder and print what would be pushed; no network, no quota
//   --no-wait  push and stop; later run with --fetch
//   --fetch    download the output of the last push and print the numbers
// Env: KAGGLE_RUNNER (node script used instead of the kaggle CLI: tests), AI_DEV_KIT_HOME, MODEL_DATASET, HF_TOKEN.
// Exit codes: 0 done, 1 error, 2 bad usage, 3 blocked (no token, no account name).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parse, gates, render } = require('./parse.js');

const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const stateDir = () => path.join(home(), 'kaggle', 'media-bench');
const SLUG = 'media-bench';

function readToken(env = process.env) {
  const clean = (v) => (v || '').replace(/[\r"']/g, '').trim();
  const e = clean(env.KAGGLE_API_TOKEN) || clean(env.KAGGLE_API_KEY);
  if (e) return e;
  try {
    for (const line of fs.readFileSync(path.join(home(), '.env'), 'utf8').replace(/\r/g, '').split('\n')) {
      const m = /^\s*(?:export\s+)?KAGGLE_API_(?:TOKEN|KEY)\s*=(.*)$/.exec(line);
      if (m && clean(m[1])) return clean(m[1]);
    }
  } catch { /* none */ }
  return '';
}

function kaggle(args, cfgDir) {
  let cmd, a;
  if (process.env.KAGGLE_RUNNER) { cmd = process.execPath; a = [process.env.KAGGLE_RUNNER, ...args]; }
  else if (!spawnSync('kaggle', ['--version'], { encoding: 'utf8' }).error) { cmd = 'kaggle'; a = args; }
  else { cmd = process.platform === 'win32' ? 'python' : 'python3'; a = ['-m', 'kaggle', ...args]; }
  const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, KAGGLE_API_TOKEN: readToken(), KAGGLE_CONFIG_DIR: cfgDir } });
  if (r.error) return { ok: false, out: r.error.message };
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() };
}

function account() {
  const i = process.argv.indexOf('--user');
  if (i >= 0) return process.argv[i + 1];
  try { return JSON.parse(fs.readFileSync(path.join(home(), 'kaggle', 'config.json'), 'utf8')).username || ''; } catch { return ''; }
}

function main() {
  const a = process.argv.slice(2);
  const flag = (f) => a.includes(f);
  const val = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const bad = a.filter((x) => x.startsWith('--') && !['--dry-run', '--no-wait', '--fetch', '--user', '--poll', '--rating'].includes(x));
  if (bad.length) { console.error('usage: node run.js [--dry-run] [--no-wait] [--fetch] [--user <name>] [--poll <s>] [--rating clearly-better|not-better]'); process.exit(2); }
  const user = account();
  if (!user) { console.error('No Kaggle account name. Pass --user <name> or run: node skills/cloud/kaggle/kaggle.cli.js setup'); process.exit(3); }
  const cfgDir = path.join(stateDir(), 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });
  const kernel = `${user}/${SLUG}`;
  const runDir = path.join(stateDir(), 'runs', 'last');

  if (!flag('--fetch')) {
    const work = path.join(stateDir(), 'push');
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    let py = fs.readFileSync(path.join(__dirname, 'bench.py'), 'utf8');
    if (process.env.HF_TOKEN) py = py.replace('import json, os, time, traceback', `import json, os, time, traceback\nos.environ["HF_TOKEN"] = ${JSON.stringify(process.env.HF_TOKEN)}`); // lives only in the private kernel source
    fs.writeFileSync(path.join(work, 'bench.py'), py);
    fs.writeFileSync(path.join(work, 'kernel-metadata.json'), JSON.stringify({ id: kernel, title: SLUG, code_file: 'bench.py', language: 'python', kernel_type: 'script', is_private: true, enable_gpu: true, enable_internet: true, dataset_sources: [], competition_sources: [], kernel_sources: [], model_sources: [] }, null, 2));
    if (flag('--dry-run')) { console.log(`dry run: would push ${kernel} from ${work} (GPU on, internet on, private). Expect 1-2 GPU hours of the 30 h weekly quota. No network used.`); return; }
    if (!readToken()) { console.error('No Kaggle token (KAGGLE_API_TOKEN, or KAGGLE_API_KEY in ~/.ai-dev-kit/.env).'); process.exit(3); }
    const push = kaggle(['kernels', 'push', '-p', work], cfgDir);
    if (!push.ok) { console.error('push failed: ' + push.out.slice(0, 300)); process.exit(1); }
    fs.writeFileSync(path.join(stateDir(), 'last.json'), JSON.stringify({ kernel, started: new Date().toISOString() }));
    console.log(`pushed ${kernel}. https://www.kaggle.com/code/${kernel}`);
    if (flag('--no-wait')) { console.log('not waiting. Later: node run.js --fetch'); return; }
    const poll = Number(val('--poll') ?? 60);
    for (let i = 0; i < 400; i++) {
      const s = kaggle(['kernels', 'status', kernel], cfgDir).out;
      if (/COMPLETE/.test(s)) break;
      if (/ERROR|CANCEL/.test(s)) { console.error('kernel ended with an error: ' + s.split('\n').pop() + '. Output may still hold partial results; try --fetch.'); process.exitCode = 1; break; }
      spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${poll * 1000})`]);
    }
  }

  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(runDir, { recursive: true });
  const o = kaggle(['kernels', 'output', kernel, '-p', runDir], cfgDir);
  const file = path.join(runDir, 'bench_results.jsonl');
  if (!o.ok || !fs.existsSync(file)) { console.error('fetch failed (still running?): ' + o.out.slice(0, 200)); process.exit(1); }
  const r = parse(fs.readFileSync(file, 'utf8'));
  console.log(render(r, gates(r, val('--rating'))));
  console.log(`\nImages and the raw results are in ${runDir}`);
}

main();
