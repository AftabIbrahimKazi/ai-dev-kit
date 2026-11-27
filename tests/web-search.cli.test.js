// web-search script: URL cleanup, snippet window, hit shaping, and the CLI with a fake router.
const assert = require('node:assert');
const cp = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const ws = require('../skills/addons/web-search.cli.js');

let failed = false;
const queue = [];
function t(name, fn) { queue.push([name, fn]); }
const BIN = path.join(__dirname, '..', 'skills', 'addons', 'web-search.cli.js');

t('cleanUrl drops tracking parameters, the fragment and a trailing slash, and keeps real parameters', () => {
  assert.strictEqual(ws.cleanUrl('https://a.com/x/?utm_source=n&id=7&fbclid=z#top'), 'https://a.com/x?id=7');
  assert.strictEqual(ws.cleanUrl('https://a.com/'), 'https://a.com');
  assert.strictEqual(ws.cleanUrl('not a url'), 'not a url');
});

t('bestWindow returns short text whole and picks the window that holds the query words', () => {
  assert.strictEqual(ws.bestWindow('short text', 'x'), 'short text');
  const filler = 'lorem ipsum dolor sit amet '.repeat(40);
  const text = filler + 'Node.js 24 was released on May 6 2025 as the Current line. ' + filler;
  const w = ws.bestWindow(text, 'node.js 24 released date', 200);
  assert.ok(/released on May 6/.test(w), w);
  assert.ok(w.length <= 210, String(w.length));
  assert.ok(w.startsWith('...'));
});

t('bestWindow strips markdown links and marks', () => {
  assert.strictEqual(ws.bestWindow('See [the docs](https://x.y/z) now', 'q'), 'See the docs now');
});

t('shape dedupes by cleaned url, applies allow and block lists, caps the count, skips rows without url or title', () => {
  const raw = [
    { title: 'A', url: 'https://a.com/p?utm_source=x', content: 'one' },
    { title: 'A again', url: 'https://a.com/p', content: 'dup' },
    { title: 'B', url: 'https://www.b.org/q', content: 'two' },
    { title: 'C', url: 'https://sub.c.net/r', content: 'three' },
    { title: '', url: 'https://d.com', content: 'no title' },
    { url: 'https://e.com', title: 'E', content: 'five' },
  ];
  assert.deepStrictEqual(ws.shape(raw, 'q', 10, [], []).map((h) => h.title), ['A', 'B', 'C', 'E']);
  assert.deepStrictEqual(ws.shape(raw, 'q', 2, [], []).map((h) => h.title), ['A', 'B']);
  assert.deepStrictEqual(ws.shape(raw, 'q', 10, ['b.org', 'c.net'], []).map((h) => h.title), ['B', 'C']);
  assert.deepStrictEqual(ws.shape(raw, 'q', 10, [], ['a.com', 'c.net']).map((h) => h.title), ['B', 'E']);
});

function runAsync(args, env) {
  return new Promise((resolve) => cp.execFile(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, timeout: 20000 }, (e, so, se) => resolve({ code: e ? e.code : 0, so, se })));
}

t('check prints the two status lines; no query exits 2', async () => {
  const c = await runAsync(['check'], { UNIFIED_API_KEY: 'k' });
  assert.strictEqual(c.code, 0);
  assert.ok(/router key: set/.test(c.so) && /router: http/.test(c.so), c.so);
  assert.strictEqual((await runAsync([], {})).code, 2);
});

t('full path: fake router returns trimmed deduped hits, the key goes in the header only', async () => {
  let seen = null;
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
      seen = { url: req.url, method: req.method, auth: req.headers.authorization, body: JSON.parse(b) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ query: 'q', provider: 'fake', results: [
        { title: 'One', url: 'https://a.com/1?utm_medium=x', content: 'x '.repeat(900) + 'target words here ' + 'y '.repeat(900) },
        { title: 'One dup', url: 'https://a.com/1', content: 'dup' },
        { title: 'Two', url: 'https://b.org/2', content: 'short body' },
      ] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const r = await runAsync(['target', 'words', '--max', '5'], { UNIFIED_API_KEY: 'sekret-key-123', UNIFIED_API_BASE: `http://127.0.0.1:${srv.address().port}` });
  srv.close();
  assert.strictEqual(r.code, 0, r.se);
  const out = JSON.parse(r.so);
  assert.strictEqual(out.provider, 'fake');
  assert.deepStrictEqual(out.hits.map((h) => h.url), ['https://a.com/1', 'https://b.org/2']);
  assert.ok(out.hits[0].snippet.length < 400 && /target words/.test(out.hits[0].snippet), out.hits[0].snippet);
  assert.strictEqual(seen.method, 'POST'); assert.strictEqual(seen.url, '/v1/search');
  assert.strictEqual(seen.auth, 'Bearer sekret-key-123');
  assert.strictEqual(seen.body.query, 'target words');
  assert.ok(!r.so.includes('sekret') && !r.se.includes('sekret'));
});

t('failures exit 2 with a reason and print nothing on stdout: no key, router down, HTTP error, no hits', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  const nokey = await runAsync(['q'], { UNIFIED_API_KEY: '', AI_DEV_KIT_HOME: home });
  assert.strictEqual(nokey.code, 2); assert.ok(/UNIFIED_API_KEY/.test(nokey.se), nokey.se); assert.strictEqual(nokey.so, '');
  const down = await runAsync(['q'], { UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: 'http://127.0.0.1:1' });
  assert.strictEqual(down.code, 2); assert.strictEqual(down.so, '');
  for (const [status, body, want] of [[500, '{}', /HTTP 500/], [200, JSON.stringify({ results: [] }), /no usable hits/]]) {
    const srv = http.createServer((q, s) => { s.statusCode = status; s.end(body); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const r = await runAsync(['q'], { UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: `http://127.0.0.1:${srv.address().port}` });
    srv.close();
    assert.strictEqual(r.code, 2); assert.ok(want.test(r.se), r.se); assert.strictEqual(r.so, '');
  }
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); console.log('ok   ' + name); } catch (e) { failed = true; console.log('FAIL ' + name + '\n' + (e && e.stack || e)); }
  }
  if (failed) { console.log('web-search.cli.test: FAILED'); process.exit(1); }
  console.log('web-search.cli.test: ok');
})();
