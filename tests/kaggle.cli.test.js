// kaggle add-on: plan lint, prompt assembly, answer parsing, gates, budget, token reading, and the CLI end to end with a fake kaggle runner.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const k = require('../skills/addons/kaggle.cli.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kg-'));
const BIN = path.join(__dirname, '..', 'skills', 'addons', 'kaggle.cli.js');

const GOOD = `# Plan

## Task 1: Debounce helper
Target: src/debounce.js
Check: node --test
Standards: CX-1
Write src/debounce.js exporting debounce(fn, ms) with a cancel() method. No dependencies at all.

## Task 2: Config
Target: src/config.json, src/config.js
Check: none
Write a config.json with name and port keys and a config.js that reads and exports it as an object.
`;

t('parsePlan: good plan has two tasks and no problems', () => {
  const r = k.parsePlan(GOOD);
  assert.strictEqual(r.tasks.length, 2);
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(r.tasks[1].targets, ['src/config.json', 'src/config.js']);
  assert.strictEqual(r.tasks[0].id, '1');
});
t('parsePlan: flags missing target, check, short text, "see above", 3 targets, repo-wide', () => {
  const bad = '## Task 1: a\nWrite it.\n\n## Task 2: b\nTarget: a.js, b.js, c.js\nCheck: none\nDo as in see above and then refactor the whole codebase please now.\n';
  const p = k.parsePlan(bad).problems.join('|');
  for (const w of ['no Target', 'no Check', 'too short', 'see above', '3 targets', 'repo-wide']) assert.ok(p.includes(w), w + ' in ' + p);
});
t('parsePlan: a plan with no tasks is a problem', () => assert.ok(k.parsePlan('# nothing').problems[0].includes('no "## Task')));

t('buildPrompt: includes rules, context, task; skips secrets and missing files; warns over cap', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'util.js'), 'exports.x = 1;');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  const std = tmp(); fs.writeFileSync(path.join(std, 'CX-1.md'), 'Rule text here');
  const task = { id: '1', title: 'a', targets: ['a.js'], check: 'none', standards: ['CX-1', 'CX-9'], context: ['util.js', '.env', 'nope.js'], text: 'x'.repeat(60) };
  const b = k.buildPrompt(task, root, std);
  assert.ok(b.prompt.includes('Rule text here') && b.prompt.includes('exports.x = 1') && b.prompt.includes('(rule id only'));
  assert.ok(!b.prompt.includes('SECRET'));
  assert.ok(b.notes.some((n) => n.includes('secret-looking')) && b.notes.some((n) => n.includes('not found')));
  const big = k.buildPrompt({ ...task, text: 'y'.repeat(100000), context: [] }, root);
  assert.ok(big.notes.some((n) => n.includes('over the')));
});

t('parseFiles: reads FILE blocks, rejects absolute and parent paths', () => {
  const ans = 'FILE: src/a.js\n```js\nconst a = 1;\n```\n\n**FILE: `b/c.json`**\n```json\n{"x":1}\n```\nFILE: ../evil.js\n```js\nx\n```\nFILE: /abs.js\n```js\ny\n```\n';
  const f = k.parseFiles(ans);
  assert.deepStrictEqual(f.map((x) => x.path), ['src/a.js', 'b/c.json']);
  assert.strictEqual(f[0].content, 'const a = 1;\n');
});
t('gateFile: placeholder, bad JS, bad JSON, cut HTML, empty; clean passes', () => {
  assert.ok(k.gateFile('a.js', '// rest of the file\n').some((x) => x.includes('placeholder')));
  assert.ok(k.gateFile('a.js', 'const = ;').some((x) => x.includes('syntax')));
  assert.ok(k.gateFile('a.json', '{bad').some((x) => x.includes('invalid JSON')));
  assert.ok(k.gateFile('a.html', '<html><body>').some((x) => x.includes('cut off')));
  assert.ok(k.gateFile('a.txt', '  ').includes('empty file'));
  assert.deepStrictEqual(k.gateFile('a.js', 'const a = 1;\nmodule.exports = a;\n'), []);
});

t('readToken: env first, .env fallback, trims spaces, quotes and CR', () => {
  assert.strictEqual(k.readToken({ KAGGLE_API_TOKEN: ' KGAT_abc ' }), 'KGAT_abc');
  const h = tmp(); fs.writeFileSync(path.join(h, '.env'), 'OTHER=1\r\nKAGGLE_API_KEY= "KGAT_xyz"\r\n');
  assert.strictEqual(k.readToken({ AI_DEV_KIT_HOME: h }), 'KGAT_xyz');
  assert.strictEqual(k.readToken({ AI_DEV_KIT_HOME: tmp() }), '');
});
t('budgetCheck: open session blocks, weekly cap blocks, --force passes, old rows do not count', () => {
  const now = new Date().toISOString();
  assert.ok(k.budgetCheck([{ id: 'a', kernel: 'u/k', started: now, status: 'running' }], 10, false).includes('session is still open'));
  const used = [{ id: 'a', kernel: 'u/k', started: now, finished: now, minutes: 1500, status: 'done' }];
  assert.ok(k.budgetCheck(used, 400, false).includes('weekly GPU budget'));
  assert.strictEqual(k.budgetCheck(used, 400, true), '');
  assert.strictEqual(k.budgetCheck([{ id: 'a', kernel: 'u/k', started: '2020-01-01T00:00:00Z', finished: '2020-01-01T01:00:00Z', minutes: 9999, status: 'done' }], 60, false), '');
});
t('buildNotebook: embeds jobs, model and caps; valid notebook JSON; no placeholders left', () => {
  const nb = JSON.parse(k.buildNotebook({ tasks: [{ id: '1', prompt: 'p' }] }, fs.readFileSync(path.join(__dirname, '..', 'skills', 'addons', 'kaggle.worker.py'), 'utf8')));
  const src = nb.cells[0].source.join('');
  assert.ok(!/__JOBS_B64__|__MODEL__|__CAPS_JSON__/.test(src));
  assert.ok(src.includes('qwen3-coder:30b'));
  const b64 = /base64\.b64decode\("([^"]+)"\)/.exec(src)[1];
  assert.strictEqual(JSON.parse(Buffer.from(b64, 'base64').toString()).tasks[0].prompt, 'p');
  assert.strictEqual(k.kernelMetadata('me', 'adk-x').id, 'me/adk-x');
});

// ---- the CLI with a fake kaggle runner ----
function fakeRunner(dir, answers) {
  const f = path.join(dir, 'fake-kaggle.js');
  fs.writeFileSync(f, `const fs=require('fs'),path=require('path');const d=${JSON.stringify(dir)};const a=process.argv.slice(2);
fs.appendFileSync(path.join(d,'calls.txt'),a.join(' ')+'\\n');
if(a[0]==='--version'){console.log('kaggle 2.2.5');process.exit(0)}
if(a[1]==='push'){const p=a[a.indexOf('-p')+1];if(!fs.existsSync(path.join(p,'worker.ipynb'))||!fs.existsSync(path.join(p,'kernel-metadata.json'))){console.error('missing files');process.exit(1)}const nb=JSON.parse(fs.readFileSync(path.join(p,'worker.ipynb'),'utf8'));const b=/b64decode\\("([^"]+)"\\)/.exec(nb.cells[0].source.join(''))[1];fs.writeFileSync(path.join(d,'ids.json'),JSON.stringify(JSON.parse(Buffer.from(b,'base64').toString()).tasks.map(x=>x.id)));console.log('Kernel version 1 successfully pushed.');process.exit(0)}
if(a[1]==='status'){const c=path.join(d,'n.txt');const n=Number(fs.existsSync(c)?fs.readFileSync(c,'utf8'):0)+1;fs.writeFileSync(c,String(n));console.log(n<2?'status "RUNNING"':'status "COMPLETE"');process.exit(0)}
if(a[1]==='output'){const p=a[a.indexOf('-p')+1];fs.mkdirSync(path.join(p,'out'),{recursive:true});const ans=JSON.parse(fs.readFileSync(path.join(d,'answers.json'),'utf8'));
const tasks=[];const ids=JSON.parse(fs.readFileSync(path.join(d,'ids.json'),'utf8'));for(const [id,text] of Object.entries(ans).filter(([i])=>ids.includes(i))){fs.writeFileSync(path.join(p,'out',id+'.txt'),text);tasks.push({id,status:'ok',gen_tokens:50})}
fs.writeFileSync(path.join(p,'results.json'),JSON.stringify({tasks,elapsed_s:420}));process.exit(0)}
if(a[1]==='delete'){console.log('deleted');process.exit(0)}
process.exit(1)`);
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(answers));
  return f;
}
const GOODANS = {
  '1': 'FILE: src/debounce.js\n```js\nfunction debounce(fn, ms) { let t; const w = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; w.cancel = () => clearTimeout(t); return w; }\nmodule.exports = debounce;\n```\n',
  '2': 'FILE: src/config.json\n```json\n{"name":"x","port":1}\n```\nFILE: src/config.js\n```js\nmodule.exports = require("./config.json");\n```\n',
};
function cli(args, dir, env) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout + r.stderr) };
}
function project() { const p = tmp(); fs.writeFileSync(path.join(p, 'plan.md'), GOOD); return p; }

t('cli: usage errors exit 2', () => assert.strictEqual(cli([], tmp(), {}).code, 2));
t('cli plan: prints task count and GPU estimate, exit 0; bad plan exit 1', () => {
  const p = project();
  const r = cli(['plan', 'plan.md'], p, { AI_DEV_KIT_HOME: tmp() });
  assert.strictEqual(r.code, 0, r.out); assert.ok(/2 task\(s\), about \d+ GPU min/.test(r.out), r.out);
  fs.writeFileSync(path.join(p, 'bad.md'), '## Task 1: x\nhi\n');
  assert.strictEqual(cli(['plan', 'bad.md'], p, { AI_DEV_KIT_HOME: tmp() }).code, 1);
});
t('cli run: pushes, polls, fetches, stages files, gates pass, ledger and usage updated', () => {
  const p = project(), h = tmp(), d = tmp();
  const env = { AI_DEV_KIT_HOME: h, KAGGLE_RUNNER: fakeRunner(d, GOODANS), KAGGLE_API_TOKEN: ' KGAT_t ' };
  assert.strictEqual(cli(['setup', '--user', 'me'], p, env).code, 0);
  const r = cli(['run', 'plan.md', '--poll', '0'], p, env);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.out.includes('2 of 2 task(s) passed'), r.out);
  const calls = fs.readFileSync(path.join(d, 'calls.txt'), 'utf8');
  assert.ok(/kernels push/.test(calls) && /kernels status/.test(calls) && /kernels output/.test(calls));
  const stage = fs.readdirSync(path.join(h, 'kaggle')).filter((x) => x !== 'cfg' && x !== 'config.json')[0];
  assert.ok(fs.existsSync(path.join(h, 'kaggle', stage, 'staging', 'src', 'debounce.js')));
  assert.ok(!fs.existsSync(path.join(p, 'src')), 'nothing written into the repo');
  const u = cli(['usage'], p, env); assert.ok(/7 days: 7 min/.test(u.out), u.out);
});
t('cli run: a bad answer is reported, retry re-pushes only the failed task, third round refused', () => {
  const p = project(), h = tmp(), d = tmp();
  const bad = { ...GOODANS, '1': 'FILE: src/debounce.js\n```js\nconst = ;\n```\n' };
  const env = { AI_DEV_KIT_HOME: h, KAGGLE_RUNNER: fakeRunner(d, bad), KAGGLE_API_TOKEN: 'KGAT_t' };
  cli(['setup', '--user', 'me'], p, env);
  const r = cli(['run', 'plan.md', '--poll', '0'], p, env);
  assert.ok(r.out.includes('1 of 2') && r.out.includes('FAIL 1') && r.out.includes('syntax error'), r.out);
  fs.rmSync(path.join(d, 'n.txt'), { force: true });
  const r2 = cli(['retry', '--poll', '0'], p, env);
  assert.ok(r2.out.includes('0 of 1') && r2.out.includes('1 task(s)'), r2.out);
  fs.rmSync(path.join(d, 'n.txt'), { force: true });
  cli(['retry', '--poll', '0'], p, env);
  fs.rmSync(path.join(d, 'n.txt'), { force: true });
  assert.ok(cli(['retry', '--poll', '0'], p, env).out.includes('two rounds'));
});
t('cli run: blocked without token, without user, and while a session is open', () => {
  const p = project(), h = tmp(), d = tmp();
  const base = { AI_DEV_KIT_HOME: h, KAGGLE_RUNNER: fakeRunner(d, GOODANS), KAGGLE_API_TOKEN: '' };
  assert.strictEqual(cli(['run', 'plan.md'], p, base).code, 3);
  cli(['setup', '--user', 'me'], p, { ...base, KAGGLE_API_TOKEN: 'KGAT_t' });
  assert.strictEqual(cli(['run', 'plan.md'], p, base).code, 3);
  const env = { ...base, KAGGLE_API_TOKEN: 'KGAT_t' };
  assert.strictEqual(cli(['run', 'plan.md', '--no-wait'], p, env).code, 0);
  const again = cli(['run', 'plan.md', '--no-wait'], p, env);
  assert.strictEqual(again.code, 3); assert.ok(again.out.includes('session is still open'), again.out);
  assert.ok(cli(['stop'], p, env).out.includes('stopped'));
  assert.strictEqual(cli(['run', 'plan.md', '--no-wait'], p, env).code, 0);
});

console.log(failed ? `${failed} FAILED` : 'all ok');
process.exitCode = failed ? 1 : 0;
