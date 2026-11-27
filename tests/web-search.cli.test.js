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

t('shapeSentences keeps the answer sentence, respects the per-hit and total caps, and falls back to windows when no sentence qualifies', () => {
  const filler = 'This sentence is filler text about nothing in particular at all. '.repeat(30);
  const raw = [
    { title: 'Rust blog', url: 'https://blog.rust-lang.org/2015/05/15/Rust-1.0', content: filler + 'Rust 1.0 was released on May 15, 2015 by the Rust Core Team. ' + filler },
    { title: 'Other', url: 'https://o.com/x', content: filler },
  ];
  const hits = ws.shapeSentences(raw, 'Rust 1.0 release date', 5, [], []);
  assert.ok(hits.length >= 1 && /May 15, 2015/.test(hits[0].snippet), JSON.stringify(hits));
  assert.ok(hits.reduce((n, h) => n + h.snippet.length, 0) <= 1500);
  const one = ws.shapeSentences(raw, 'Rust 1.0 release date', 5, [], [], 1500, 1);
  assert.strictEqual(one[0].snippet.split(/(?<=\.)\s/).length, 1, 'perHit 1 keeps one sentence');
  const noSentence = ws.shapeSentences([{ title: 'T', url: 'https://t.com/a', content: 'x'.repeat(900) }], 'q', 5, [], []);
  assert.strictEqual(noSentence.length, 1, 'falls back to the window result');
});

t('scoreSentence ranks query words first, then digits and names, and penalises very long text', () => {
  const w = ['rust', 'release'];
  assert.ok(ws.scoreSentence('Rust release notes for the team.', w) > ws.scoreSentence('Nothing relevant to see here at all.', w));
  assert.ok(ws.scoreSentence('Released in 2015 by Mozilla Research.', []) > ws.scoreSentence('released quietly by someone, some day.', []));
  assert.ok(ws.scoreSentence('a '.repeat(250), w) < ws.scoreSentence('a '.repeat(50), w));
});

// Every run gets its own AI_DEV_KIT_HOME so the search cache and config never touch the real ~/.ai-dev-kit.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-home-'));
function runAsync(args, env) {
  return new Promise((resolve) => cp.execFile(process.execPath, [BIN, ...args], { env: { ...process.env, AI_DEV_KIT_HOME: SANDBOX, ...env }, timeout: 20000 }, (e, so, se) => resolve({ code: e ? e.code : 0, so, se })));
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

t('modes: window keeps the old shape, sift returns the model digest, and a failed sift falls back to the sentence hits', async () => {
  const results = [{ title: 'One', url: 'https://a.com/1', content: 'Filler words here and there for padding the text. The answer is forty two exactly. More filler words follow after that.' }];
  let chatStatus = 200, chatText = 'The answer is forty two. https://a.com/1';
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/search') return res.end(JSON.stringify({ provider: 'fake', results }));
      res.statusCode = chatStatus; res.end(JSON.stringify({ choices: [{ message: { content: chatText } }] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: `http://127.0.0.1:${srv.address().port}` };
  const win = JSON.parse((await runAsync(['answer', 'forty'], { ...env, WEB_SEARCH_MODE: 'window' })).so);
  assert.strictEqual(win.digest, undefined);
  const sift = JSON.parse((await runAsync(['answer', 'forty'], { ...env, WEB_SEARCH_MODE: 'sift' })).so);
  assert.strictEqual(sift.digest, 'The answer is forty two. https://a.com/1');
  assert.ok(sift.hits.length >= 1, 'sentence hits ride along');
  chatStatus = 500;
  const dead = JSON.parse((await runAsync(['answer', 'forty'], { ...env, WEB_SEARCH_MODE: 'sift' })).so);
  assert.strictEqual(dead.digest, undefined); assert.ok(dead.hits.length >= 1, 'fallback keeps the hits');
  srv.close();
});

t('saved results: a search returns a cache id, and more lists, reads one hit, answers a new question, and refuses a bad id', async () => {
  const body = 'Padding sentence number one is here for length. '.repeat(8) + 'The capital of Australia is Canberra, not Sydney. ' + 'Padding sentence number two is here for length. '.repeat(8);
  const srv = http.createServer((req, res) => { req.on('data', () => {}); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ provider: 'fake', results: [{ title: 'Geo', url: 'https://g.com/a', content: body }, { title: 'Two', url: 'https://g.com/b', content: 'Other page about something else entirely, long enough to count.' }] })); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: `http://127.0.0.1:${srv.address().port}` };
  const out = JSON.parse((await runAsync(['capital', 'australia'], env)).so);
  srv.close();
  assert.ok(/^[0-9a-f]{6}$/.test(out.cacheId), out.cacheId);
  const list = await runAsync(['more', out.cacheId], {});
  assert.ok(/1\. Geo \(https:\/\/g\.com\/a/.test(list.so) && /2\. Two/.test(list.so), list.so);
  const one = await runAsync(['more', out.cacheId, '--hit', '1'], {});
  assert.ok(/Canberra/.test(one.so) && one.so.startsWith('Geo'), one.so.slice(0, 80));
  assert.ok(/no hit 9/.test((await runAsync(['more', out.cacheId, '--hit', '9'], {})).so));
  const ask = await runAsync(['more', out.cacheId, '--ask', 'what', 'is', 'the', 'capital', 'of', 'Australia'], {});
  assert.ok(/Canberra/.test(ask.so), ask.so);
  assert.strictEqual((await runAsync(['more', 'zzzzzz'], {})).code, 2);
  assert.strictEqual((await runAsync(['more', '../../etc'], {})).code, 2);
});

t('the cache keeps at most 40 entries', async () => {
  for (let i = 0; i < 43; i++) ws.saveCache('q' + i, [{ title: 't', url: 'https://a.com/' + i, content: 'c' }]);
  const dir = path.join(SANDBOX, 'search-cache');
  assert.ok(fs.readdirSync(dir).length <= 40, String(fs.readdirSync(dir).length));
});

t('web-search.json chooses the sifter once, and WEB_SEARCH_MODE overrides it', async () => {
  const results = [{ title: 'One', url: 'https://a.com/1', content: 'Filler words here and there for padding the text. The answer is forty two exactly. More filler words follow after that.' }];
  const srv = http.createServer((req, res) => { req.on('data', () => {}); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(req.url === '/v1/search' ? JSON.stringify({ provider: 'f', results }) : JSON.stringify({ choices: [{ message: { content: 'Digest text.' } }] })); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { UNIFIED_API_KEY: 'k', UNIFIED_API_BASE: `http://127.0.0.1:${srv.address().port}`, WEB_SEARCH_MODE: '' };
  const cfg = path.join(SANDBOX, 'web-search.json');
  fs.writeFileSync(cfg, JSON.stringify({ sift: 'router' }));
  assert.strictEqual(JSON.parse((await runAsync(['answer', 'forty'], env)).so).digest, 'Digest text.');
  assert.strictEqual(JSON.parse((await runAsync(['answer', 'forty'], { ...env, WEB_SEARCH_MODE: 'window' })).so).digest, undefined, 'env wins');
  fs.writeFileSync(cfg, JSON.stringify({ sift: 'off' }));
  assert.strictEqual(JSON.parse((await runAsync(['answer', 'forty'], env)).so).digest, undefined);
  fs.writeFileSync(cfg, '{not json');
  assert.strictEqual(JSON.parse((await runAsync(['answer', 'forty'], env)).so).digest, undefined, 'a broken file means the default');
  srv.close();
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
