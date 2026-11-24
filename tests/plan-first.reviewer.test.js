// Reviewer backend: Gemini first, then Ollama, then nothing; every failure is a quiet UNAVAILABLE; secrets are never sent.
// Fake Gemini and Ollama servers run on loopback.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { review, parseVerdict, readConfig, neverSend } = require('../skills/workflow/plan-first.reviewer.js');

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
const geminiReply = (text) => (_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })); };
const ollamaReply = (text) => (_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ response: text })); };
const status = (code) => (_q, res) => { res.statusCode = code; res.end('{}'); };
function home(ollamaBase) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  fs.writeFileSync(path.join(d, 'models.json'), JSON.stringify({ system2: { provider: 'ollama', baseUrl: ollamaBase, model: 'tiny' } }));
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

t('readConfig: default is static (no network until chosen); a valid file wins; junk is ignored', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  assert.strictEqual(readConfig(d).reviewer, 'static');
  fs.mkdirSync(path.join(d, '.claude'));
  fs.writeFileSync(path.join(d, '.claude', 'state-audit.json'), '{"reviewer":"ollama"}');
  assert.strictEqual(readConfig(d).reviewer, 'ollama');
  fs.writeFileSync(path.join(d, '.claude', 'state-audit.json'), '{"reviewer":"bogus"}');
  assert.strictEqual(readConfig(d).reviewer, 'static');
});

t('static reviewer asks no model', async () => {
  const r = await review('p', 'code', { reviewer: 'static' }, {});
  assert.strictEqual(r.status, 'UNAVAILABLE');
});

t('auto: Gemini answers, Ollama is not called, the key goes in a header not the URL', async () => {
  const g = await server(geminiReply('FAIL\nimpossible state'));
  const o = await server(ollamaReply('PASS'));
  const r = await review('prompt', 'code', { reviewer: 'auto' }, { GEMINI_API_KEY: 'k-123', GEMINI_API_BASE: g.base, AI_DEV_KIT_HOME: home(o.base) });
  g.s.close(); o.s.close();
  assert.deepStrictEqual([r.status, r.backend, r.findings], ['FAIL', 'gemini', 'impossible state']);
  assert.strictEqual(o.calls.length, 0);
  assert.strictEqual(g.calls[0].headers['x-goog-api-key'], 'k-123');
  assert.ok(!g.calls[0].url.includes('k-123'));
  assert.ok(JSON.parse(g.calls[0].body).contents[0].parts[0].text.includes('prompt'));
});

t('auto: a Gemini 429 falls back to Ollama and says why', async () => {
  const g = await server(status(429));
  const o = await server(ollamaReply('WARN\nsplit the flags'));
  const r = await review('p', 'c', { reviewer: 'auto' }, { GEMINI_API_KEY: 'k', GEMINI_API_BASE: g.base, AI_DEV_KIT_HOME: home(o.base) });
  g.s.close(); o.s.close();
  assert.deepStrictEqual([r.status, r.backend], ['WARN', 'ollama']);
  assert.ok(/429/.test(r.note));
});

t('auto: no key skips Gemini without a request; ollama-only never calls Gemini', async () => {
  const g = await server(geminiReply('FAIL\nx'));
  const o = await server(ollamaReply('PASS'));
  const env = { GEMINI_API_BASE: g.base, AI_DEV_KIT_HOME: home(o.base) };
  assert.strictEqual((await review('p', 'c', { reviewer: 'auto' }, env)).backend, 'ollama');
  assert.strictEqual((await review('p', 'c', { reviewer: 'ollama' }, { ...env, GEMINI_API_KEY: 'k' })).backend, 'ollama');
  g.s.close(); o.s.close();
  assert.strictEqual(g.calls.length, 0);
});

t('both down or a junk reply: UNAVAILABLE, never a throw', async () => {
  const dead = await server(status(500));
  const base = dead.base; dead.s.close();
  const r = await review('p', 'c', { reviewer: 'auto', timeoutMs: 2000 }, { GEMINI_API_KEY: 'k', GEMINI_API_BASE: base, AI_DEV_KIT_HOME: home(base) });
  assert.strictEqual(r.status, 'UNAVAILABLE');
  const junk = await server(ollamaReply('I think this looks fine!'));
  const r2 = await review('p', 'c', { reviewer: 'ollama' }, { AI_DEV_KIT_HOME: home(junk.base) });
  junk.s.close();
  assert.strictEqual(r2.status, 'UNAVAILABLE');
});

t('a slow server times out instead of hanging', async () => {
  const slow = await server(() => { /* never answers */ });
  const t0 = Date.now();
  const r = await review('p', 'c', { reviewer: 'ollama', timeoutMs: 300 }, { AI_DEV_KIT_HOME: home(slow.base) });
  slow.s.closeAllConnections?.(); slow.s.close();
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.ok(Date.now() - t0 < 5000);
});

t('a non-loopback Ollama URL is refused', async () => {
  const r = await review('p', 'c', { reviewer: 'ollama' }, { AI_DEV_KIT_HOME: home('http://example.com:11434') });
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.ok(/loopback/.test(r.note));
});

const { spawnSync } = require('node:child_process');
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.reviewer.js');

t('a missing models.json means Ollama on loopback with the small default model; a config with no system2 does too', async () => {
  const o = await server(ollamaReply('PASS'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  fs.writeFileSync(path.join(empty, 'models.json'), '{}');
  // the default base is 127.0.0.1:11434: nothing listens there in the test, so the call must end UNAVAILABLE, not throw
  const r = await review('p', 'c', { reviewer: 'ollama', timeoutMs: 1500 }, { AI_DEV_KIT_HOME: empty });
  o.s.close();
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.ok(/Ollama unreachable/.test(r.note), r.note);
});

t('a Gemini server that is down reports "Gemini unreachable" with the reason, and a timeout says timeout', async () => {
  const o = await server(ollamaReply('PASS'));
  const down = await review('p', 'c', { reviewer: 'auto' }, { GEMINI_API_KEY: 'k', GEMINI_API_BASE: 'http://127.0.0.1:1', AI_DEV_KIT_HOME: home(o.base) });
  assert.ok(/Gemini unreachable: (?!timeout)/.test(down.note), down.note);
  const slow = await server(() => {});
  const to = await review('p', 'c', { reviewer: 'auto', timeoutMs: 300 }, { GEMINI_API_KEY: 'k', GEMINI_API_BASE: slow.base, AI_DEV_KIT_HOME: home(o.base) });
  slow.s.close(); o.s.close();
  assert.ok(/Gemini unreachable: timeout/.test(to.note), to.note);
});

t('text is cut at 60000 characters, not before and not after', async () => {
  const sizes = [];
  const g = await server((_q, res, body) => { sizes.push(JSON.parse(body).contents[0].parts[0].text.length); geminiReply('PASS')(_q, res); });
  const env = { GEMINI_API_KEY: 'k', GEMINI_API_BASE: g.base };
  await review('', 'x'.repeat(60000), { reviewer: 'auto' }, env);
  await review('', 'x'.repeat(60001), { reviewer: 'auto' }, env);
  g.s.close();
  assert.deepStrictEqual(sizes, [2 + 60000, 2 + 60000]);
});

t('cli: bad usage exits 2, a PASS prints nothing, a missing file fails open', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'revcli-'));
  fs.writeFileSync(path.join(d, 'p.txt'), 'prompt'); fs.writeFileSync(path.join(d, 'a.js'), 'code');
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: d } });
  assert.strictEqual(run().status, 2);
  assert.strictEqual(run('--prompt', 'p.txt').status, 2);
  assert.strictEqual(run('--file', 'a.js').status, 2);
  assert.strictEqual(run('--prompt', 'p.txt', '--file', 'a.js', '--reviewer', 'bogus').status, 2);
  assert.strictEqual(run('--prompt', 'p.txt', '--file', 'a.js', '--wat').status, 2);
  assert.match(run().stderr, /^usage: reviewer\.js/);
  const ok = run('--prompt', 'p.txt', '--file', 'a.js', '--reviewer', 'static', '--root', d);
  assert.strictEqual(ok.status, 0); assert.strictEqual(ok.stdout, '');
  assert.strictEqual(run('--prompt', 'p.txt', '--file', 'missing.js').status, 0);
  assert.strictEqual(run('--prompt', 'p.txt', '--file', '.env').status, 0);
});

// A step that awaits forever would end the process with exit code 0 and look like a pass: fail unless every run block reached its end.
let finished = 0;
process.on('exit', () => { if (finished !== 1) { console.log('FAIL the test run never finished (something awaits forever)'); process.exitCode = 1; } });
(async () => {
  for (const [name, fn] of tests) { try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
  finished++;
  if (failed) { console.log('plan-first.reviewer.test: FAILED'); process.exit(1); }
  console.log('plan-first.reviewer.test: ok');
})();
