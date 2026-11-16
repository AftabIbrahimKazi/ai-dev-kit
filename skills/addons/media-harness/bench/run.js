#!/usr/bin/env node
// Runs the Stage 5 measurement on Kaggle for you: pushes bench.py as a private GPU script kernel, waits, downloads the
// output, prints the numbers. Uses your Kaggle token (KAGGLE_API_TOKEN or ~/.ai-dev-kit/.env) and spends free GPU quota.
//   node run.js [--dry-run] [--no-wait] [--fetch] [--user <name>] [--poll <seconds>] [--max-minutes N] [--rating clearly-better|not-better]
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

// Same Kaggle plumbing as the coding-execution add-on (skills/cloud/kaggle): token, CLI, weekly ledger, open-session block, delete-as-stop.
const { readToken, kaggleCommand, slugFor, budgetCheck, weekMinutes } = require('../../../cloud/kaggle/kaggle.cli.js');
const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const root = path.resolve(__dirname, '..', '..', '..', '..'); // the kit repo: the project this ledger belongs to
const stateDir = () => path.join(home(), 'kaggle', slugFor(root));
const benchDir = () => path.join(stateDir(), 'media-bench');
const SLUG = 'media-bench';
const EST_MIN = 40; // bench.py ends itself after 45 min; the plan is about 15-40

function kaggle(args, cfgDir) {
  const { cmd, args: a } = kaggleCommand(args);
  const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, KAGGLE_API_TOKEN: readToken(), KAGGLE_CONFIG_DIR: cfgDir } });
  if (r.error) return { ok: false, out: r.error.message };
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() };
}

const ledgerFile = () => path.join(stateDir(), 'ledger.jsonl');
const NL = String.fromCharCode(10);
const readLedger = () => { try { return fs.readFileSync(ledgerFile(), 'utf8').split(NL).filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const writeLedger = (rows) => { fs.mkdirSync(stateDir(), { recursive: true }); fs.writeFileSync(ledgerFile(), rows.map((r) => JSON.stringify(r)).join(NL) + NL); };
function closeRow(rows, row, status) { row.finished = new Date().toISOString(); row.status = status; row.minutes = Math.ceil((Date.now() - Date.parse(row.started)) / 60000); writeLedger(rows); }

function account() {
  const i = process.argv.indexOf('--user');
  if (i >= 0) return process.argv[i + 1];
  try { return JSON.parse(fs.readFileSync(path.join(home(), 'kaggle', 'config.json'), 'utf8')).username || ''; } catch { return ''; }
}

function main() {
  const a = process.argv.slice(2);
  const flag = (f) => a.includes(f);
  const val = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const bad = a.filter((x) => x.startsWith('--') && !['--dry-run', '--no-wait', '--fetch', '--user', '--poll', '--rating', '--max-minutes', '--force'].includes(x));
  if (bad.length) { console.error('usage: node run.js [--dry-run] [--no-wait] [--fetch] [--user <name>] [--poll <s>] [--rating clearly-better|not-better]'); process.exit(2); }
  const user = account();
  if (!user) { console.error('No Kaggle account name. Pass --user <name> or run: node skills/cloud/kaggle/kaggle.cli.js setup'); process.exit(3); }
  const cfgDir = path.join(home(), 'kaggle', 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });
  const kernel = `${user}/${SLUG}`;
  const runDir = path.join(benchDir(), 'runs', 'last');

  if (!flag('--fetch')) {
    const work = path.join(benchDir(), 'push');
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    let py = fs.readFileSync(path.join(__dirname, 'bench.py'), 'utf8');
    if (process.env.HF_TOKEN) py = py.replace('import json, os, time, traceback', `import json, os, time, traceback\nos.environ["HF_TOKEN"] = ${JSON.stringify(process.env.HF_TOKEN)}`); // lives only in the private kernel source
    fs.writeFileSync(path.join(work, 'bench.py'), py);
    fs.writeFileSync(path.join(work, 'kernel-metadata.json'), JSON.stringify({ id: kernel, title: SLUG, code_file: 'bench.py', language: 'python', kernel_type: 'script', is_private: true, enable_gpu: true, enable_internet: true, dataset_sources: [], competition_sources: [], kernel_sources: [], model_sources: [] }, null, 2));
    if (flag('--dry-run')) { console.log(`dry run: would push ${kernel} from ${work} (GPU on, internet on, private). Expect 1-2 GPU hours of the 30 h weekly quota. No network used.`); return; }
    if (!readToken()) { console.error('No Kaggle token (KAGGLE_API_TOKEN, or KAGGLE_API_KEY in ~/.ai-dev-kit/.env).'); process.exit(3); }
    const rows = readLedger();
    const block = budgetCheck(rows, EST_MIN, flag('--force'));
    if (block) { console.error('blocked: ' + block); process.exit(3); }
    const push = kaggle(['kernels', 'push', '-p', work], cfgDir);
    if (!push.ok) { console.error('push failed: ' + push.out.slice(0, 300)); process.exit(1); }
    const row = { id: Math.random().toString(16).slice(2, 8), kernel, started: new Date().toISOString(), status: 'running', tasks: 1 };
    rows.push(row); writeLedger(rows);
    console.log(`pushed ${kernel}. https://www.kaggle.com/code/${kernel}`);
    if (flag('--no-wait')) { console.log('not waiting. Later: node run.js --fetch'); return; }
    // The GPU quota is 30 h a week: never leave a session running unattended. After --max-minutes (default 75, queue time
    // included) the kernel is stopped. bench.py also ends itself when its own 45 min budget is spent.
    const poll = Number(val('--poll') ?? 60);
    const deadline = Date.now() + Number(val('--max-minutes') ?? 75) * 60000;
    for (;;) {
      const s = kaggle(['kernels', 'status', kernel], cfgDir).out;
      if (/COMPLETE/.test(s)) { closeRow(rows, row, 'done'); break; }
      if (/ERROR|CANCEL/.test(s)) { closeRow(rows, row, 'error'); console.error('kernel ended: ' + s.split('\n').pop() + '. Output may still hold partial results; try --fetch.'); process.exitCode = 1; break; }
      if (Date.now() > deadline) {
        const d = kaggle(['kernels', 'delete', kernel, '--yes'], cfgDir);
        closeRow(rows, row, d.ok ? 'stopped' : 'stop-failed');
        console.error(`stopped: still not finished after the time cap, so the kernel was ${d.ok ? 'deleted to free the GPU' : 'NOT deleted (' + d.out.slice(0, 120) + '); stop it on kaggle.com now'}.`);
        process.exit(1);
      }
      spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${poll * 1000})`]);
    }
  }

  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(runDir, { recursive: true });
  const o = kaggle(['kernels', 'output', kernel, '-p', runDir], cfgDir);
  const file = path.join(runDir, 'bench_results.jsonl');
  if (!o.ok || !fs.existsSync(file)) { console.error('fetch failed (still running?): ' + o.out.slice(0, 200)); process.exit(1); }
  const lrows = readLedger(); const open = lrows.filter((x) => !x.finished && x.kernel === kernel).pop();
  if (open) closeRow(lrows, open, 'done'); // a --no-wait push is closed here, like the coding flow's fetch
  const r = parse(fs.readFileSync(file, 'utf8'));
  console.log(render(r, gates(r, val('--rating'))));
  console.log(`\nImages and the raw results are in ${runDir}`);
}

main();
