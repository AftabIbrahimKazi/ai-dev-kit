// image-gen on the free router: allowed or not, success, quota cooldown, temporary failure, status and reset, the MCP tool list.
// The CLI runs as a child process against a fake router on loopback; placeholders use a dead host so the local SVG is written.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const CLI = path.join(__dirname, '..', 'skills', 'mcp', 'mcp-manager.image-gen.js');

let failed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
function router(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { calls.push({ url: req.url, auth: req.headers.authorization, body }); handler(req, res, body); });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const ok = (_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ created: 1, data: [{ b64_json: JPEG.toString('base64') }], model: '@cf/black-forest-labs/flux-1-schnell', provider: 'cloudflare' })); };
const status = (code) => (_q, res) => { res.statusCode = code; res.end('{}'); };

function project(imageList) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgp-'));
  if (imageList) { fs.mkdirSync(path.join(dir, '.claude')); fs.writeFileSync(path.join(dir, '.claude', 'ai-backends.json'), JSON.stringify({ image: imageList })); }
  return dir;
}
function run(cwd, args, extraEnv = {}) {
  const home = extraEnv.__home || fs.mkdtempSync(path.join(os.tmpdir(), 'imgh-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home, AI_DEV_KIT_HOME: home, IMAGE_GEN_HOME: path.join(home, 'ig'), PLACEHOLDER_API_BASE: 'http://127.0.0.1:1', ...extraEnv };
  delete env.__home;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, ...args], { cwd, env });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err, home }));
  });
}

t('not allowed in the project: a placeholder with a notice, and the router is never called', async () => {
  const r = await router(ok);
  const cwd = project(null);
  const x = await run(cwd, ['generate', 'a hero image', '--out', path.join(cwd, 'a.png')], { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k' });
  r.s.close();
  const j = JSON.parse(x.out);
  assert.strictEqual(j.placeholder, true);
  assert.ok(/no image backend is allowed/.test(x.err));
  assert.strictEqual(r.calls.length, 0);
  assert.ok(fs.existsSync(j.file));
});

t('allowed: the router makes the image; the file, provider and model come back; the request is model auto with a size and the key', async () => {
  const r = await router(ok);
  const cwd = project(['unified']);
  const x = await run(cwd, ['generate', 'a hero image', '--style', 'isometric', '--aspect', '1:1', '--out', path.join(cwd, 'hero.png')], { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k-9' });
  r.s.close();
  const j = JSON.parse(x.out);
  assert.strictEqual(x.code, 0);
  assert.deepStrictEqual([j.placeholder, j.provider, j.model], [false, 'cloudflare', '@cf/black-forest-labs/flux-1-schnell']);
  assert.ok(j.file.endsWith('.jpg') && fs.readFileSync(j.file).equals(JPEG), 'saved with the real extension');
  const sent = JSON.parse(r.calls[0].body);
  assert.deepStrictEqual([r.calls[0].url, r.calls[0].auth, sent.model, sent.size], ['/v1/images/generations', 'Bearer k-9', 'auto', '1024x1024']);
  assert.ok(/isometric illustration/.test(sent.prompt), 'the style was added to the prompt');
});

t('no key: a placeholder and a clear note, no crash', async () => {
  const cwd = project(['unified']);
  const x = await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'n.png')], { UNIFIED_API_BASE: 'http://127.0.0.1:1', UNIFIED_API_KEY: '' });
  assert.strictEqual(JSON.parse(x.out).placeholder, true);
  assert.ok(/UNIFIED_API_KEY/.test(x.err));
});

t('a 429 pauses the router for an hour: the next call never reaches it; reset clears the pause', async () => {
  const r = await router(status(429));
  const cwd = project(['unified']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'imgh-'));
  const env = { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k', __home: home };
  const a = await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'a.png')], env);
  assert.strictEqual(JSON.parse(a.out).placeholder, true);
  assert.ok(/Pausing the router/.test(a.err) && r.calls.length === 1);
  const b = await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'b.png')], env);
  assert.ok(/paused until/.test(b.err) && r.calls.length === 1, 'cooling down: no second call');
  assert.ok(JSON.parse((await run(cwd, ['status'], env)).out).cooldownUntil);
  assert.ok(/cooldown cleared/.test((await run(cwd, ['reset'], env)).out));
  await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'c.png')], env);
  assert.strictEqual(r.calls.length, 2, 'after reset the router is tried again');
  r.s.close();
});

t('a 500 is temporary: a placeholder, no pause, the next call tries again', async () => {
  const r = await router(status(500));
  const cwd = project(['unified']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'imgh-'));
  const env = { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k', __home: home };
  await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'a.png')], env);
  await run(cwd, ['generate', 'x', '--out', path.join(cwd, 'b.png')], env);
  r.s.close();
  assert.strictEqual(r.calls.length, 2);
  assert.strictEqual(JSON.parse((await run(cwd, ['status'], env)).out).cooldownUntil, null);
});

t('bad input is refused before anything is called', async () => {
  const r = await router(ok);
  const cwd = project(['unified']);
  const env = { UNIFIED_API_BASE: r.base, UNIFIED_API_KEY: 'k' };
  assert.strictEqual((await run(cwd, ['generate', '', '--out', 'x.png'], env)).code, 1);
  assert.ok(/unknown style/.test((await run(cwd, ['generate', 'x', '--style', 'nope'], env)).err));
  assert.ok(/aspect must be/.test((await run(cwd, ['generate', 'x', '--aspect', '5:7'], env)).err));
  assert.strictEqual((await run(cwd, ['ai-edit', 'f.png', 'x'], env)).code, 2, 'ai-edit is gone: usage error');
  r.s.close();
  assert.strictEqual(r.calls.length, 0);
});

t('MCP lists exactly generate_image and enhance_image', async () => {
  const cwd = project(null);
  const out = await new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, 'mcp'], { cwd });
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; if (buf.trim().split('\n').length >= 2) { c.kill(); resolve(buf); } });
    c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) + '\n');
    setTimeout(() => c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n'), 200);
    setTimeout(() => { c.kill(); resolve(buf); }, 4000);
  });
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  const list = lines.find((l) => l.id === 2);
  assert.ok(list, 'tools/list answered');
  assert.deepStrictEqual(list.result.tools.map((x) => x.name), ['generate_image', 'enhance_image']);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }
  }
  if (failed) process.exit(1);
})();
