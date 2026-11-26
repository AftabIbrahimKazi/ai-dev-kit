// Reviewer on the shared cascade: config (new file and the old one), verdict parsing, fail-open, and the CLI end to end.
// Fake Ollama and router servers run on loopback.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { review, generate, parseVerdict, readConfig, neverSend } = require('../skills/workflow/plan-first.reviewer.js');
const REVIEWER = path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.reviewer.js');

let failed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

function server(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { calls.push({ url: req.url, headers: req.headers, body }); handler(req, res, body); });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const ollamaReply = (text) => (_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ response: text })); };
const routerReply = (text) => (_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: text } }] })); };
const status = (code) => (_q, res) => { res.statusCode = code; res.end('{}'); };
function home(ollamaBase) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  fs.writeFileSync(path.join(d, 'models.json'), JSON.stringify({ system2: { provider: 'ollama', baseUrl: ollamaBase, model: 'tiny' } }));
  return d;
}
function project(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'revp-'));
  fs.mkdirSync(path.join(d, '.claude'));
  for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(d, '.claude', n), typeof v === 'string' ? v : JSON.stringify(v));
  return d;
}

t('parseVerdict: PASS, WARN and FAIL on the first line; anything else is null', () => {
  assert.deepStrictEqual(parseVerdict('FAIL\nisLoading and isSuccess can both be true'), { status: 'FAIL', findings: 'isLoading and isSuccess can both be true' });
  assert.strictEqual(parseVerdict('**WARN**\nx').status, 'WARN');
  assert.strictEqual(parseVerdict('Sure! Here is my review'), null);
  assert.strictEqual(parseVerdict(''), null);
});

t('neverSend: env files, keys and secret-looking names', () => {
  for (const f of ['.env', '.env.local', 'a/server.pem', 'id_rsa', 'config/secrets.json', 'x/credentials.ts']) assert.ok(neverSend(f), f);
  for (const f of ['src/App.tsx', 'docs/plans/a.md']) assert.ok(!neverSend(f), f);
});

t('readConfig: no files means no backends; ai-backends.json wins in the fixed order', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  assert.deepStrictEqual(readConfig(d).backends, []);
  const p = project({ 'ai-backends.json': { review: ['unified', 'code', 'ollama'], goldfish: ['kaggle'] } });
  assert.deepStrictEqual(readConfig(p).backends, ['code', 'ollama', 'unified']);
  assert.deepStrictEqual(readConfig(p, 'goldfish').backends, ['kaggle']);
});

t('readConfig: an old state-audit.json reviewer maps to ollama; auto no longer means Gemini; goldfish never inherits it', () => {
  assert.deepStrictEqual(readConfig(project({ 'state-audit.json': { reviewer: 'ollama' } })).backends, ['ollama']);
  assert.deepStrictEqual(readConfig(project({ 'state-audit.json': { reviewer: 'auto' } })).backends, ['ollama']);
  assert.deepStrictEqual(readConfig(project({ 'state-audit.json': { reviewer: 'static' } })).backends, []);
  assert.deepStrictEqual(readConfig(project({ 'state-audit.json': { reviewer: 'ollama' } }), 'goldfish').backends, []);
  const p = project({ 'state-audit.json': { reviewer: 'ollama', timeoutMs: 9000, maxTokens: 77 }, 'ai-backends.json': { review: ['unified'] } });
  assert.deepStrictEqual(readConfig(p), { backends: ['unified'], timeoutMs: 9000, maxTokens: 77 }, 'the new file replaces the old reviewer value; tuning stays');
});

t('no model backend asks nothing: UNAVAILABLE', async () => {
  for (const b of [[], ['code']]) { const r = await review('p', 'code', { backends: b }, {}); assert.strictEqual(r.status, 'UNAVAILABLE'); }
});

t('ollama answers PASS, WARN and FAIL; findings and backend are returned', async () => {
  const o = await server(ollamaReply('WARN\nflag a and flag b are independent'));
  const r = await review('p', 'code', { backends: ['ollama'] }, { AI_DEV_KIT_HOME: home(o.base) });
  o.s.close();
  assert.deepStrictEqual([r.status, r.backend, r.findings], ['WARN', 'ollama', 'flag a and flag b are independent']);
});

t('an unusable reply falls through to the next backend; the note says why', async () => {
  const o = await server(ollamaReply('I think the code looks fine'));
  const u = await server(routerReply('PASS'));
  const r = await review('p', 'code', { backends: ['ollama', 'unified'] }, { AI_DEV_KIT_HOME: home(o.base), UNIFIED_API_BASE: u.base, UNIFIED_API_KEY: 'k' });
  o.s.close(); u.s.close();
  assert.strictEqual(r.backend, 'unified');
  assert.ok(/ollama reply was not usable/.test(r.note));
});

t('every failure is a quiet UNAVAILABLE', async () => {
  const o = await server(status(500));
  const r = await review('p', 'code', { backends: ['ollama', 'unified'] }, { AI_DEV_KIT_HOME: home(o.base) });
  o.s.close();
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.ok(/ollama HTTP 500/.test(r.note) && /UNIFIED_API_KEY/.test(r.note));
});

t('generate returns any non-empty text', async () => {
  const o = await server(ollamaReply('step 3 names a file that does not exist'));
  const r = await generate('p', 'plan', { backends: ['ollama'] }, { AI_DEV_KIT_HOME: home(o.base) });
  o.s.close();
  assert.deepStrictEqual([r.backend, r.text], ['ollama', 'step 3 names a file that does not exist']);
});

t('CLI: WARN exits 1 with findings, PASS exits 0 quietly, a secret file is never read, bad usage exits 2', async () => {
  const o = await server(ollamaReply('WARN\nhidden state'));
  const p = project({ 'ai-backends.json': { review: ['ollama'] } });
  fs.writeFileSync(path.join(p, 'ask.txt'), 'review this');
  fs.writeFileSync(path.join(p, 'App.tsx'), 'const x = 1');
  fs.writeFileSync(path.join(p, '.env'), 'KEY=1');
  const env = { ...process.env, AI_DEV_KIT_HOME: home(o.base) };
  // async: the fake server lives in this process, so a blocking spawn would starve it
  const run = (...a) => new Promise((resolve) => { const c = spawn(process.execPath, [REVIEWER, ...a], { cwd: p, env }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (status) => resolve({ status, stdout: out })); });
  let r = await run('--prompt', 'ask.txt', '--file', 'App.tsx');
  assert.strictEqual(r.status, 1); assert.ok(/WARN \(ollama\)\nhidden state/.test(r.stdout));
  const calls = o.calls.length;
  r = await run('--prompt', 'ask.txt', '--file', '.env');
  assert.strictEqual(r.status, 0); assert.strictEqual(o.calls.length, calls, 'the .env file reached no model');
  r = await run('--prompt', 'ask.txt', '--file', 'App.tsx', '--backends', 'code');
  assert.strictEqual(r.status, 0, 'code alone asks no model');
  assert.strictEqual((await run('--prompt', 'ask.txt', '--file', 'App.tsx', '--backends', 'gemini')).status, 2);
  assert.strictEqual((await run('--bogus')).status, 2);
  o.s.close();
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }
  }
  if (failed) process.exit(1);
})();
