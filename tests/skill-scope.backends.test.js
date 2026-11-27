// backends detector: loopback-only probes, model lists, key names (never values), the search-ready flag, and a down machine.
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const bk = require('../skills/meta/skill-scope.backends.js');

let failed = false;
const queue = [];
function t(name, fn) { queue.push([name, fn]); }
const BIN = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.backends.js');

function serve(routes) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const r = routes[req.url];
      res.setHeader('content-type', 'application/json');
      if (!r) { res.statusCode = 404; return res.end('{}'); }
      res.end(JSON.stringify(r));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function run(env) {
  return new Promise((resolve) => cp.execFile(process.execPath, [BIN, '--json'], { env: { ...process.env, ...env }, timeout: 20000 }, (e, so) => resolve(JSON.parse(so))));
}
const DEAD = { OLLAMA_HOST: 'http://127.0.0.1:1', LMSTUDIO_PORT: '1', LLAMACPP_PORT: '1', LAYA_PORT: '1', UNIFIED_API_BASE: 'http://127.0.0.1:1' };

t('loopback only: a remote host in a variable falls back to the local default', () => {
  assert.strictEqual(bk.loopback('http://evil.example.com:11434', 'http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.strictEqual(bk.loopback('localhost:5000', 'x'), 'http://localhost:5000');
  assert.strictEqual(bk.loopback('http://127.0.0.1:9', 'x'), 'http://127.0.0.1:9');
  assert.strictEqual(bk.loopback('', 'dflt'), 'dflt');
  assert.strictEqual(bk.loopback('not a url at all %%', 'dflt'), 'dflt');
});

t('keyNames returns names from the environment and the .env file, never values', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  fs.writeFileSync(path.join(home, '.env'), 'GEMINI_API_KEY=secretvalue1\nEMPTY_API_KEY=\n# COMMENTED_API_KEY=x\nKAGGLE_API_KEY=abc\n');
  const old = { h: process.env.AI_DEV_KIT_HOME, k: process.env.UNIFIED_API_KEY };
  process.env.AI_DEV_KIT_HOME = home; process.env.UNIFIED_API_KEY = 'envvalue2';
  try {
    const names = bk.keyNames();
    assert.ok(names.includes('GEMINI_API_KEY') && names.includes('KAGGLE_API_KEY') && names.includes('UNIFIED_API_KEY'), names.join());
    assert.ok(!names.includes('EMPTY_API_KEY') && !names.includes('COMMENTED_API_KEY'));
    assert.ok(!JSON.stringify(names).includes('secretvalue1') && !JSON.stringify(names).includes('envvalue2'));
  } finally { for (const [k, v] of [['AI_DEV_KIT_HOME', old.h], ['UNIFIED_API_KEY', old.k]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});

t('everything down: all five back ends reported as not reachable, search not ready, exit 0', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const r = await run({ ...DEAD, AI_DEV_KIT_HOME: home, UNIFIED_API_KEY: '' });
  assert.deepStrictEqual(r.backends.map((b) => b.id), ['ollama', 'lmstudio', 'llamacpp', 'laya', 'router']);
  assert.ok(r.backends.every((b) => b.reachable === false));
  assert.strictEqual(r.searchReady, false);
  assert.match(r.backends[4].note, /no UNIFIED_API_KEY/);
});

t('fake servers: model names, counts, the router key header, and search readiness', async () => {
  let seenAuth = null;
  const ollama = await serve({ '/api/tags': { models: [{ name: 'qwen2.5:1.5b' }, { name: 'llama3:8b' }] } });
  const lm = await serve({ '/v1/models': { data: [{ id: 'phi-3' }] } });
  const laya = await serve({ '/health': { ok: true } });
  const routerSrv = http.createServer((req, res) => {
    seenAuth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'auto' }, { id: 'fusion' }] }));
    if (req.url === '/v1/providers') return res.end(JSON.stringify({ providers: [{ platform: 'aihorde' }, { platform: 'parallel' }] }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => routerSrv.listen(0, '127.0.0.1', r));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const r = await run({
    ...DEAD, AI_DEV_KIT_HOME: home, UNIFIED_API_KEY: 'sekret-router-key',
    OLLAMA_HOST: `http://127.0.0.1:${ollama.address().port}`, LMSTUDIO_PORT: String(lm.address().port), LAYA_PORT: String(laya.address().port),
    UNIFIED_API_BASE: `http://127.0.0.1:${routerSrv.address().port}`,
  });
  for (const s of [ollama, lm, laya, routerSrv]) s.close();
  const by = Object.fromEntries(r.backends.map((b) => [b.id, b]));
  assert.ok(by.ollama.reachable && by.ollama.count === 2 && by.ollama.models[0] === 'qwen2.5:1.5b');
  assert.ok(by.lmstudio.reachable && by.lmstudio.models[0] === 'phi-3');
  assert.ok(by.laya.reachable);
  assert.ok(by.llamacpp.reachable === false);
  assert.ok(by.router.reachable && by.router.count === 2);
  assert.strictEqual(r.searchReady, true);
  assert.strictEqual(seenAuth, 'Bearer sekret-router-key');
  assert.ok(!JSON.stringify(r).includes('sekret-router-key'), 'the key value never appears in the report');
  assert.deepStrictEqual(r.chatModels.slice(0, 2), ['ollama:qwen2.5:1.5b', 'ollama:llama3:8b']);
});

t('the text report lists each back end up or down and the key names line', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const out = await new Promise((resolve) => cp.execFile(process.execPath, [BIN], { env: { ...process.env, ...DEAD, AI_DEV_KIT_HOME: home, UNIFIED_API_KEY: '' }, timeout: 20000 }, (e, so) => resolve(so)));
  assert.ok(/^down\s+Ollama/m.test(out) && /^down\s+Free router/m.test(out), out);
  assert.ok(/keys \(names only\):/.test(out) && /web search through the router: not available/.test(out), out);
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed = true; console.log('FAIL ' + name + '\n' + (e && e.stack || e)); }
  }
  if (failed) { console.log('skill-scope.backends.test: FAILED'); process.exit(1); }
  console.log('skill-scope.backends.test: ok');
})();
