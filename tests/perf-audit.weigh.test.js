const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { weigh, checkHtml, findDist } = require('../skills/workflow/perf-audit.weigh.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'perf-audit.weigh.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'weigh space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });
const big = (n) => Buffer.alloc(n, 0); // incompressible enough? zeros gzip tiny -- use random for chunks
const random = (n) => require('node:crypto').randomBytes(n);

t('finds dist and totals JS and CSS with gzip sizes', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html><head></head><body></body></html>');
  write(d, 'dist/assets/app.abc12345.js', 'console.log(1);'.repeat(100));
  write(d, 'dist/assets/app.abc12345.css', 'body{margin:0}'.repeat(50));
  const r = weigh(d);
  assert.strictEqual(r.dist, 'dist');
  assert.ok(r.totals.js > 0 && r.totals.jsGzip > 0 && r.totals.jsGzip < r.totals.js);
  assert.ok(r.totals.css > 0);
  assert.strictEqual(r.unhashed, 0);
});

t('a chunk over 150 KB gzip is listed; a small one is not', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html></html>');
  fs.mkdirSync(path.join(d, 'dist', 'js'), { recursive: true });
  fs.writeFileSync(path.join(d, 'dist', 'js', 'vendor.js'), random(400 * 1024));
  fs.writeFileSync(path.join(d, 'dist', 'js', 'tiny.js'), 'x');
  const r = weigh(d);
  assert.deepStrictEqual(r.heavyChunks.map((c) => c.file), ['dist/js/vendor.js']);
  assert.strictEqual(r.unhashed, 2);
});

t('images over 200 KB and PNG without a modern sibling are reported; a PNG with a webp sibling is not', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html></html>');
  fs.mkdirSync(path.join(d, 'dist', 'img'), { recursive: true });
  fs.writeFileSync(path.join(d, 'dist', 'img', 'hero.png'), big(300 * 1024));
  fs.writeFileSync(path.join(d, 'dist', 'img', 'logo.png'), big(50 * 1024));
  fs.writeFileSync(path.join(d, 'dist', 'img', 'logo.webp'), big(10 * 1024));
  fs.writeFileSync(path.join(d, 'dist', 'img', 'icon.png'), big(5 * 1024));
  const r = weigh(d);
  assert.deepStrictEqual(r.heavyImages.map((i) => i.file), ['dist/img/hero.png']);
  assert.deepStrictEqual(r.legacyRasters.map((i) => i.file), ['dist/img/hero.png']);
});

t('fonts: count and font-display state', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html></html>');
  for (const n of ['a', 'b', 'c', 'd', 'e']) write(d, 'dist/fonts/' + n + '.woff2', 'f');
  write(d, 'dist/site.css', '@font-face{font-family:A;src:url(a.woff2);font-display:swap}@font-face{font-family:B;src:url(b.woff2)}');
  const r = weigh(d);
  assert.strictEqual(r.fonts.files.length, 5);
  assert.strictEqual(r.fonts.display, 'missing');
  assert.match(run(d).stdout, /Fonts \(5 files, limit 4\)/);
});

t('html: blocking head script, third-party sync, eager images, no LCP priority, no dimensions', () => {
  const html = '<html><head><script src="/a.js"></script><script src="https://cdn.x.com/t.js"></script><script src="/b.js" defer></script><script type="module" src="/m.js"></script></head>'
    + '<body><img src="1.jpg"><img src="2.jpg" loading="lazy"><img src="3.jpg"><img src="4.jpg" width="1" height="1" loading="lazy"></body></html>';
  const kinds = checkHtml('x', html, 'index.html').map((f) => f.kind);
  assert.strictEqual(kinds.filter((k) => k === 'blocking-script').length, 2);
  assert.ok(kinds.includes('third-party-sync'));
  assert.ok(kinds.includes('eager-images'));
  assert.ok(kinds.includes('no-lcp-priority'));
  assert.ok(kinds.includes('img-no-dimensions'));
  const ok = checkHtml('x', '<html><head><link rel="preload" as="image" href="h.jpg"></head><body><img src="h.jpg" width="1" height="1" fetchpriority="high"></body></html>', 'i.html');
  assert.deepStrictEqual(ok, []);
});

t('no build folder: weighs the source and says so', () => {
  const d = proj();
  write(d, 'src/main.js', 'x');
  const r = weigh(d);
  assert.strictEqual(r.dist, null);
  assert.match(r.notes[0], /no production build folder/);
  assert.strictEqual(findDist(d), null);
});

t('--dist names the folder; a missing one is an error (exit 1)', () => {
  const d = proj();
  write(d, 'out2/index.html', '<html></html>');
  assert.match(run(d, '--dist', 'out2').stdout, /Build folder: out2/);
  const r = run(d, '--dist', 'nope');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /no such folder/);
});

t('--json prints one document; clean project says so', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html><head></head><body></body></html>');
  const j = JSON.parse(run(d, '--json').stdout);
  assert.strictEqual(j.dist, 'dist');
  assert.match(run(d).stdout, /No static findings/);
});

t('bad usage exits 2 with one usage line', () => {
  for (const bad of [['--wat'], ['--top', 'x'], ['--dist']]) {
    const r = run(proj(), ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});

t('--summary ranks findings by bytes, at most 7 rows, each with a fix and an effort', () => {
  const d = proj();
  write(d, 'dist/index.html', '<html><head><script src="a.js"></script></head><body><img src="x.png"></body></html>');
  fs.mkdirSync(path.join(d, 'dist', 'js'), { recursive: true });
  fs.writeFileSync(path.join(d, 'dist', 'js', 'vendor.js'), random(400 * 1024));
  fs.writeFileSync(path.join(d, 'dist', 'hero.png'), random(300 * 1024));
  const out = run(d, '--summary').stdout;
  const rows = out.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| finding'));
  assert.ok(rows.length >= 3 && rows.length <= 7, out);
  assert.match(out, /^Build folder: dist\nHeaviest: chunk dist\/js\/vendor\.js/);
  assert.ok(rows[0].includes('vendor.js') && rows[1].includes('hero.png'), out);
  assert.ok(rows.every((r) => /\| [SML] \|$/.test(r)), out);
  assert.ok(!/^Totals/m.test(out), 'no full report in summary mode');
});
t('--summary with no build folder says to ask about building; a clean build says so', () => {
  const d = proj();
  write(d, 'src/a.txt', 'x');
  assert.match(run(d, '--summary').stdout, /no build folder found: ask whether to build first/);
  const c = proj();
  write(c, 'dist/index.html', '<html><head></head><body></body></html>');
  assert.match(run(c, '--summary').stdout, /No static findings/);
});
