// Kaggle add-on, unified executor: which coders a project allows, running a plan on the free router from this machine, the
// fall-through from kaggle, HANDOFF when nothing can write the code, and retry. A fake router runs on loopback; no Kaggle call is made.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const k = require('../skills/cloud/kaggle/kaggle.cli.js');
const BIN = path.join(__dirname, '..', 'skills', 'cloud', 'kaggle', 'kaggle.cli.js');

let failed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ku-'));

const PLAN = `# Plan

## Task 1: Debounce helper
Target: src/debounce.js
Check: none
Write src/debounce.js exporting debounce(fn, ms) with a cancel() method. No dependencies at all.

## Task 2: Config
Target: src/config.json, src/config.js
Check: none
Write a config.json with name and port keys and a config.js that reads and exports it as an object.
`;
const ANS1 = 'FILE: src/debounce.js\n```js\nfunction debounce(fn, ms) { let t; const w = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; w.cancel = () => clearTimeout(t); return w; }\nmodule.exports = debounce;\n```\n';
const ANS2 = 'FILE: src/config.json\n```json\n{"name":"x","port":1}\n```\nFILE: src/config.js\n```js\nmodule.exports = require("./config.json");\n```\n';

// The router answers task 1 or task 2 by what the prompt asks for.
function router(answerFor) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        calls.push({ url: req.url, auth: req.headers.authorization, body });
        const prompt = body ? JSON.parse(body).messages[0].content : '';
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: answerFor(prompt, calls.length) } }] }));
      });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const byTask = (a1 = ANS1, a2 = ANS2) => (prompt) => (/debounce/i.test(prompt) ? a1 : a2);

function project(coding) {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'plan.md'), PLAN);
  if (coding !== undefined) { fs.mkdirSync(path.join(d, '.claude')); fs.writeFileSync(path.join(d, '.claude', 'ai-backends.json'), JSON.stringify({ coding })); }
  return d;
}
function cli(args, dir, env) {
  const home = env.AI_DEV_KIT_HOME || tmp();
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [BIN, ...args], { cwd: dir, env: { ...process.env, KAGGLE_API_TOKEN: '', KAGGLE_API_KEY: '', KAGGLE_USERNAME: '', UNIFIED_API_KEY: '', AI_DEV_KIT_HOME: home, ...env } });
    let out = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out, home }));
  });
}

t('codingSteps: no file means kaggle only; the file wins; the order is fixed; --via forces one', () => {
  const none = tmp();
  assert.deepStrictEqual(k.codingSteps(none, 'auto'), ['kaggle']);
  assert.deepStrictEqual(k.codingSteps(project(['unified', 'kaggle']), 'auto'), ['kaggle', 'unified']);
  assert.deepStrictEqual(k.codingSteps(project(['unified']), 'auto'), ['unified']);
  assert.deepStrictEqual(k.codingSteps(project([]), 'auto'), []);
  assert.deepStrictEqual(k.codingSteps(project([]), 'unified'), ['unified']);
  assert.deepStrictEqual(k.codingSteps(project(['kaggle']), 'unified'), ['unified']);
});

t('no config and no Kaggle account: the old blocked message, nothing else', async () => {
  const p = project();
  const r = await cli(['run', 'plan.md'], p, {});
  assert.strictEqual(r.code, 3);
  assert.ok(/no Kaggle account name/.test(r.out));
});

t('a bad --via is a usage error', async () => {
  assert.strictEqual((await cli(['run', 'plan.md', '--via', 'gpu'], project(), {})).code, 2);
});

t('run on unified: both tasks written, staged, gated; the router saw auto, the key, and each task prompt', async () => {
  const r = await router(byTask());
  const p = project(['unified']);
  const x = await cli(['run', 'plan.md'], p, { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k-77' });
  r.s.close();
  assert.strictEqual(x.code, 0, x.out);
  assert.ok(/unified results: 2 of 2 task\(s\) passed/.test(x.out), x.out);
  assert.ok(/no GPU quota used/.test(x.out));
  assert.strictEqual(r.calls.length, 2);
  const sent = JSON.parse(r.calls[0].body);
  assert.deepStrictEqual([r.calls[0].url, r.calls[0].auth, sent.model], ['/v1/chat/completions', 'Bearer k-77', 'auto']);
  assert.ok(/debounce/i.test(sent.messages[0].content) && /FILE: <path>/.test(sent.messages[0].content), 'the full task prompt, with the output rules');
  const stage = fs.readdirSync(x.home).length && path.join(x.home, 'kaggle');
  const staged = fs.readdirSync(stage).filter((n) => n !== 'cfg' && n !== 'config.json')[0];
  assert.ok(fs.existsSync(path.join(stage, staged, 'staging', 'src', 'debounce.js')));
  assert.ok(!fs.existsSync(path.join(p, 'src')), 'nothing is written into the repo');
});

t('auto with kaggle and unified allowed, but no Kaggle token: it says why and uses unified', async () => {
  const r = await router(byTask());
  const x = await cli(['run', 'plan.md'], project(['kaggle', 'unified']), { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k' });
  r.s.close();
  assert.ok(/kaggle skipped: no Kaggle account name/.test(x.out), x.out);
  assert.ok(/unified results: 2 of 2/.test(x.out));
  assert.strictEqual(r.calls.length, 2);
});

t('nothing allowed: HANDOFF, exit 3, the router is never called', async () => {
  const r = await router(byTask());
  const x = await cli(['run', 'plan.md'], project([]), { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k' });
  r.s.close();
  assert.strictEqual(x.code, 3);
  assert.ok(/^HANDOFF/.test(x.out.trim()) && /Write the code yourself/.test(x.out));
  assert.strictEqual(r.calls.length, 0);
});

t('unified allowed but no key and kaggle not ready: HANDOFF naming the missing key', async () => {
  const x = await cli(['run', 'plan.md'], project(['kaggle', 'unified']), { UNIFIED_API_BASE: 'http://127.0.0.1:1', AI_DEV_KIT_HOME: tmp() });
  assert.strictEqual(x.code, 3);
  assert.ok(/HANDOFF/.test(x.out) && /UNIFIED_API_KEY/.test(x.out), x.out);
});

t('a bad answer is reported; retry re-asks only the failed task on unified; the third round is refused', async () => {
  const bad = 'FILE: src/debounce.js\n```js\nconst = ;\n```\n';
  const r = await router(byTask(bad, ANS2));
  const p = project(['unified']);
  const env = { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k', AI_DEV_KIT_HOME: tmp() };
  const a = await cli(['run', 'plan.md'], p, env);
  assert.ok(/1 of 2/.test(a.out) && /FAIL 1/.test(a.out) && /syntax error/.test(a.out), a.out);
  const before = r.calls.length;
  const b = await cli(['retry'], p, env);
  assert.ok(/0 of 1/.test(b.out), b.out);
  assert.strictEqual(r.calls.length, before + 1, 'only the failed task went back');
  assert.ok(/YOUR PREVIOUS ANSWER FAILED/.test(JSON.parse(r.calls[r.calls.length - 1].body).messages[0].content));
  await cli(['retry'], p, env);
  assert.ok(/two rounds/.test((await cli(['retry'], p, env)).out));
  r.s.close();
});

t('a router that fails is reported per task and the plan still ends with a report', async () => {
  const s = http.createServer((q, res) => { res.statusCode = 500; res.end('{}'); });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const x = await cli(['run', 'plan.md'], project(['unified']), { UNIFIED_API_BASE: `http://127.0.0.1:${s.address().port}`, UNIFIED_API_KEY: 'k' });
  s.close();
  assert.ok(/task 1: error/.test(x.out) && /0 of 2/.test(x.out), x.out);
});

t('a secret in a Context file never reaches the router', async () => {
  const r = await router(byTask());
  const p = project(['unified']);
  fs.mkdirSync(path.join(p, 'src'), { recursive: true });
  fs.writeFileSync(path.join(p, 'src', 'util.js'), 'const token = "abcdef0123456789zz"; module.exports = 1;\n');
  fs.writeFileSync(path.join(p, 'plan.md'), PLAN.replace('Check: none\nWrite src/debounce', 'Check: none\nContext: src/util.js\nWrite src/debounce'));
  await cli(['run', 'plan.md'], p, { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k' });
  r.s.close();
  assert.ok(r.calls.length >= 1 && !r.calls.some((c) => c.body.includes('abcdef0123456789zz')));
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }
  }
  if (failed) process.exit(1);
})();
