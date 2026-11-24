const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const m = require('../skills/meta/skill-scope.semantic.js');

const CLI = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.semantic.js');
const results = [];
const t = (name, fn) => results.push([name, fn]);

// A stub that answers /health and the batch call with fixed yes-probabilities.
function stub(scores, { healthOk = true } = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    if (req.url === '/health') { res.statusCode = healthOk ? 200 : 503; return res.end('{}'); }
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push(JSON.parse(body));
      const answers = {};
      for (const k of Object.keys(JSON.parse(body).questions)) answers[k] = { noul: scores[k] ?? 0 };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results: [{ answers }] }));
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, port: srv.address().port })));
}
const runCli = (env, ...args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('close', (code) => resolve({ code, out }));
});

t('resolveBase: loopback only, and never with a hosted key', () => {
  assert.strictEqual(m.resolveBase({}), 'http://127.0.0.1:8000');
  assert.strictEqual(m.resolveBase({ LAYA_PORT: '9001' }), 'http://127.0.0.1:9001');
  assert.strictEqual(m.resolveBase({ SYSTEM1_BASE_URL: 'http://localhost:7000/' }), 'http://localhost:7000');
  assert.strictEqual(m.resolveBase({ SYSTEM1_BASE_URL: 'https://api.example.com' }), null);
  assert.strictEqual(m.resolveBase({ SYSTEM1_BASE_URL: 'not a url' }), null);
  assert.strictEqual(m.resolveBase({ SYSTEM1_API_KEY: 'k' }), null);
});

t('pick keeps only skills at or over their own threshold, best first', () => {
  const r = { results: [{ answers: { 'debug-protocol': { noul: 0.49 }, 'plan-first': { noul: 0.41 } } }] };
  assert.deepStrictEqual(m.pick(r, ['debug-protocol', 'plan-first']).map((h) => h.skill), ['plan-first']);
  const r2 = { results: [{ answers: { 'debug-protocol': { noul: 0.9 }, 'plan-first': { noul: 0.5 } } }] };
  assert.deepStrictEqual(m.pick(r2, ['plan-first', 'debug-protocol']).map((h) => h.skill), ['debug-protocol', 'plan-first']);
  assert.deepStrictEqual(m.pick({}, ['plan-first']), []);
});

t('the CLI prints a hit line and asks one call with one question per skill', async () => {
  const s = await stub({ 'debug-protocol': 0.82, 'plan-first': 0.1 });
  const r = await runCli({ SYSTEM1_BASE_URL: `http://127.0.0.1:${s.port}` }, 'the checkout page shows a blank screen after I click pay');
  s.srv.close();
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.trim(), 'debug-protocol\t0.82');
  assert.strictEqual(s.calls.length, 1);
  assert.deepStrictEqual(Object.keys(s.calls[0].questions).sort(), ['debug-protocol', 'plan-first']);
});

t('--skills limits the questions asked', async () => {
  const s = await stub({ 'plan-first': 0.7 });
  const r = await runCli({ SYSTEM1_BASE_URL: `http://127.0.0.1:${s.port}` }, '--skills', 'plan-first', 'switch the whole app to graphql');
  s.srv.close();
  assert.deepStrictEqual(Object.keys(s.calls[0].questions), ['plan-first']);
  assert.strictEqual(r.out.trim(), 'plan-first\t0.70');
});

t('nothing applies: exit 0 and no output', async () => {
  const s = await stub({});
  const r = await runCli({ SYSTEM1_BASE_URL: `http://127.0.0.1:${s.port}` }, 'add a footer with three links');
  s.srv.close();
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, '');
});

t('unavailable (health fails, port closed, hosted key) exits 2 and asks nothing', async () => {
  const s = await stub({ 'debug-protocol': 0.9 }, { healthOk: false });
  const bad = await runCli({ SYSTEM1_BASE_URL: `http://127.0.0.1:${s.port}` }, 'something is broken somewhere');
  s.srv.close();
  assert.strictEqual(bad.code, 2);
  assert.strictEqual(s.calls.length, 0);
  assert.strictEqual((await runCli({ LAYA_PORT: '9' }, 'x y z')).code, 2);
  assert.strictEqual((await runCli({ SYSTEM1_API_KEY: 'k' }, 'x y z')).code, 2);
});

t('skill-hint mod and this script agree on which skills are semantic', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'skill-hint', 'hooks', 'match.ts'), 'utf8');
  const listed = /SEMANTIC_SKILLS = \[([^\]]*)\]/.exec(src)[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepStrictEqual(listed.sort(), Object.keys(m.SEMANTIC).sort());
});

(async () => {
  for (const [name, fn] of results) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
  }
})();
