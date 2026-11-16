const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const { slugFor } = require('../skills/cloud/kaggle/kaggle.cli.js');
const root = path.resolve(__dirname, '..');
const run = path.join(__dirname, '..', 'skills', 'addons', 'media-harness', 'bench', 'run.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-run-'));
const runner = path.join(tmp, 'fake-kaggle.js');
fs.writeFileSync(runner, `
const fs=require('fs'),path=require('path');const a=process.argv.slice(2);
fs.appendFileSync(path.join(${JSON.stringify(tmp)},'calls.log'),a.join(' ')+'\\n');
if(a[1]==='status'){console.log(process.env.FAKE_STUCK?'status: RUNNING':'status: COMPLETE');}
if(a[1]==='output'){const d=a[a.indexOf('-p')+1];fs.writeFileSync(path.join(d,'bench_results.jsonl'),[
 JSON.stringify({test:'env',gpus:['Tesla T4'],ok:true}),
 JSON.stringify({test:'model_load',model:'flux-schnell',seconds:30,ok:true,source:'huggingface'}),
 JSON.stringify({test:'image_1024',model:'flux-schnell',seconds:15,ok:true}),
 JSON.stringify({test:'video_81f_480p',model:'wan22-5b',seconds:600,ok:true}),
 JSON.stringify({test:'done',ok:true})].join('\\n'));}
`);
const env = { ...process.env, KAGGLE_RUNNER: runner, AI_DEV_KIT_HOME: tmp, KAGGLE_API_TOKEN: 'fake' };
fs.mkdirSync(path.join(tmp, 'kaggle'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'kaggle', 'config.json'), JSON.stringify({ username: 'someone' }));

t('dry run makes no kaggle call and writes the kernel folder', () => {
  const r = spawnSync(process.execPath, [run, '--dry-run'], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(tmp, 'calls.log')));
  const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'kaggle', slugFor(root), 'media-bench', 'push', 'kernel-metadata.json'), 'utf8'));
  assert.strictEqual(meta.id, 'someone/media-bench');
  assert.ok(meta.enable_gpu && meta.is_private && meta.kernel_type === 'script');
});
t('full run pushes, polls, fetches and prints the gates', () => {
  const r = spawnSync(process.execPath, [run, '--poll', '0'], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 0, r.stderr);
  const calls = fs.readFileSync(path.join(tmp, 'calls.log'), 'utf8');
  assert.ok(/kernels push/.test(calls) && /kernels status/.test(calls) && /kernels output/.test(calls));
  assert.ok(/Video gate: PASS/.test(r.stdout) && /waiting for your side-by-side rating/.test(r.stdout));
});
t('the run is recorded in the shared weekly ledger and closed when done', () => {
  const rows = fs.readFileSync(path.join(tmp, 'kaggle', slugFor(root), 'ledger.jsonl'), 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.length >= 1 && rows.every((r) => r.finished && r.kernel === 'someone/media-bench'));
});
t('an open session blocks a second push (exit 3)', () => {
  fs.appendFileSync(path.join(tmp, 'kaggle', slugFor(root), 'ledger.jsonl'), JSON.stringify({ id: 'x', kernel: 'someone/other', started: new Date().toISOString(), status: 'running' }) + String.fromCharCode(10));
  const r = spawnSync(process.execPath, [run, '--poll', '0'], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 3);
  assert.ok(/session is still open/.test(r.stderr));
  const f = path.join(tmp, 'kaggle', slugFor(root), 'ledger.jsonl');
  const NL = String.fromCharCode(10);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(NL).filter((l) => l && !l.includes('someone/other')).join(NL) + NL);
});
t('no token blocks with exit 3', () => {
  const r = spawnSync(process.execPath, [run], { encoding: 'utf8', env: { ...env, KAGGLE_API_TOKEN: '', KAGGLE_API_KEY: '', AI_DEV_KIT_HOME: tmp } });
  assert.strictEqual(r.status, 3);
});
t('HF_TOKEN goes into the pushed kernel only, not into stdout', () => {
  const r = spawnSync(process.execPath, [run, '--dry-run'], { encoding: 'utf8', env: { ...env, HF_TOKEN: 'hf_secret123' } });
  assert.ok(!r.stdout.includes('hf_secret123'));
  assert.ok(fs.readFileSync(path.join(tmp, 'kaggle', slugFor(root), 'media-bench', 'push', 'bench.py'), 'utf8').includes('hf_secret123'));
});
t('a stuck kernel is deleted at the time cap, never left running', () => {
  fs.rmSync(path.join(tmp, 'calls.log'), { force: true });
  const r = spawnSync(process.execPath, [run, '--poll', '0', '--max-minutes', '0'], { encoding: 'utf8', env: { ...env, FAKE_STUCK: '1' } });
  assert.strictEqual(r.status, 1);
  assert.ok(/kernels delete someone\/media-bench --yes/.test(fs.readFileSync(path.join(tmp, 'calls.log'), 'utf8')));
  assert.ok(/deleted to free the GPU/.test(r.stderr));
});
t('unknown flag exits 2', () => assert.strictEqual(spawnSync(process.execPath, [run, '--nope'], { encoding: 'utf8', env }).status, 2));
fs.rmSync(tmp, { recursive: true, force: true });
