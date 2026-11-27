// web-digest script: public-URL gate, code trim, skips, and the CLI with a fake router and a fake obscura.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const wd = require('../skills/addons/web-digest.cli.js');

let failed = false;
const queue = [];
function t(name, fn) { queue.push([name, fn]); }

t('publicUrl accepts public http(s) and refuses private, loopback, bare and odd schemes', () => {
  for (const u of ['https://example.com/a?b=1', 'http://docs.python.org/3/', 'https://8.8.8.8/']) assert.ok(wd.publicUrl(u), u);
  for (const u of ['http://localhost:3000', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.2/', 'http://172.16.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://intranet/', 'http://printer.local/', 'file:///etc/passwd', 'ftp://example.com/', 'nonsense', 'https://svc.internal/']) assert.strictEqual(wd.publicUrl(u), null, u);
  assert.ok(wd.publicUrl('http://172.32.0.1/'), '172.32 is public');
});

t('trimPage drops blanks and repeats and caps the size', () => {
  assert.strictEqual(wd.trimPage('a\n\n\n  b  \r\nb\nc'), 'a\nb\nc');
  assert.strictEqual(wd.trimPage('x'.repeat(30000)).length, 24000);
});

function run(args, env) {
  return cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'skills', 'addons', 'web-digest.cli.js'), ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 20000 });
}

// A fake obscura is a .js file: the script runs a .js binary through node.
function fakeObscura(dir, body) {
  const js = path.join(dir, 'fake-obscura.js');
  fs.writeFileSync(js, body);
  return js;
}

t('check prints the three status lines and exits 0', () => {
  const r = run(['check'], { E2E_OBSCURA_BIN: '', UNIFIED_API_KEY: 'k', AI_DEV_KIT_HOME: os.tmpdir(), PATH: '' });
  assert.strictEqual(r.status, 0);
  assert.ok(/^obscura: /m.test(r.stdout) && /router key: set/.test(r.stdout) && /router: http/.test(r.stdout), r.stdout);
});

t('skips with exit 2: no args, private url, no obscura', () => {
  assert.strictEqual(run([], {}).status, 2);
  assert.ok(/not a public/.test(run(['http://127.0.0.1/', 'q'], {}).stderr));
  const r = run(['https://example.com/', 'q'], { E2E_OBSCURA_BIN: '', AI_DEV_KIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'wd-')), PATH: path.dirname(process.execPath) === '' ? '' : '/nonexistent' });
  assert.strictEqual(r.status, 2);
  assert.ok(/obscura not installed/.test(r.stderr), r.stderr);
});

t('full path: fake obscura plus fake router returns the digest and never prints the key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  const bin = fakeObscura(dir, "console.log('Example Domain\\nThis domain is for use in illustrative examples in documents.\\nMore information');");
  let seen = null;
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { seen = { auth: req.headers.authorization, body: JSON.parse(b) }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'A reserved example domain.' } }] })); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const r = await new Promise((resolve) => cp.execFile(process.execPath, [path.join(__dirname, '..', 'skills', 'addons', 'web-digest.cli.js'), 'https://example.com/', 'What is this?'], { env: { ...process.env, E2E_OBSCURA_BIN: bin, UNIFIED_API_KEY: 'sekret-key-123', UNIFIED_API_BASE: `http://127.0.0.1:${port}` }, timeout: 20000 }, (e, so, se) => resolve({ code: e ? e.code : 0, so, se })));
  srv.close();
  assert.strictEqual(r.code, 0, r.se);
  const out = JSON.parse(r.so);
  assert.strictEqual(out.result, 'A reserved example domain.');
  assert.strictEqual(out.url, 'https://example.com/');
  assert.ok(out.bytes > 0 && out.pageChars > 40);
  assert.strictEqual(seen.auth, 'Bearer sekret-key-123');
  assert.ok(seen.body.messages[0].content.includes('What is this?') && seen.body.messages[0].content.includes('illustrative examples'));
  assert.ok(!r.so.includes('sekret') && !r.se.includes('sekret'));
});

t('router down or empty page: exit 2 with a reason, nothing on stdout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  const bin = fakeObscura(dir, "console.log('Example Domain\\nThis domain is for use in illustrative examples in documents.');");
  const down = run(['https://example.com/', 'q'], { E2E_OBSCURA_BIN: bin, UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: 'http://127.0.0.1:1' });
  assert.strictEqual(down.status, 2); assert.strictEqual(down.stdout, '');
  const empty = fakeObscura(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-')), "console.log('');");
  const e = run(['https://example.com/', 'q'], { E2E_OBSCURA_BIN: empty, UNIFIED_API_KEY: 'k' });
  assert.strictEqual(e.status, 2); assert.ok(/empty page|too short/.test(e.stderr), e.stderr);
  const nokey = run(['https://example.com/', 'q'], { E2E_OBSCURA_BIN: bin, UNIFIED_API_KEY: '', AI_DEV_KIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'wd-')) });
  assert.strictEqual(nokey.status, 2); assert.ok(/UNIFIED_API_KEY/.test(nokey.stderr), nokey.stderr);
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed = true; console.log('FAIL ' + name + '\n' + (e && e.stack || e)); }
  }
  if (failed) { console.log('web-digest.cli.test: FAILED'); process.exit(1); }
  console.log('web-digest.cli.test: ok');
})();
