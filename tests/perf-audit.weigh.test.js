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

// ---- gaps found by `invariants probe` on perf-audit.weigh.js ----
// Regenerate the golden on purpose with UPDATE_GOLDEN=1 node tests/perf-audit.weigh.test.js, then read the diff.
const CRW = String.fromCharCode(13);
const noise = (n, seed = 1) => { const b = Buffer.alloc(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 16; } return b; };
const KBW = 1024;
const goldW = (name, text) => {
	const file = path.join(__dirname, 'fixtures', 'weigh', name);
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return; }
	assert.ok(fs.existsSync(file), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs.readFileSync(file, 'utf8').split(CRW).join(''));
};
const bigSite = () => {
	const d = proj();
	write(d, 'dist/index.html', '<html><head><script src="/assets/vendor.js"></script><script src="https://cdn.example.com/a.js"></script><script src="/assets/app.abc123def.js" defer></script></head><body><img src="a.png"><img src="b.png"><img src="c.png" loading="lazy"><!-- <img src="x.png"> --></body></html>');
	write(d, 'dist/about.html', '<html><head></head><body><img src="a.png" fetchpriority="high"><img src="b.png" loading="lazy"></body></html>');
	write(d, 'dist/assets/app.abc123def.js', noise(170 * KBW, 1)); write(d, 'dist/assets/vendor.js', noise(30 * KBW, 2)); write(d, 'dist/assets/small.0a1b2c3d.mjs', 'export const a = 1;\n'.repeat(40)); write(d, 'dist/assets/app.abc123def.js.map', noise(5 * KBW, 3));
	write(d, 'dist/assets/app.abc123def.css', noise(160 * KBW, 4)); write(d, 'dist/assets/site.css', 'body{margin:0}'.repeat(50));
	write(d, 'dist/img/hero.png', noise(300 * KBW, 5)); write(d, 'dist/img/banner.jpg', noise(250 * KBW, 6)); write(d, 'dist/img/wide.jpeg', noise(220 * KBW, 7));
	write(d, 'dist/img/exact.png', noise(200 * KBW, 8)); write(d, 'dist/img/over.png', noise(200 * KBW + 1, 9));
	write(d, 'dist/img/logo.png', noise(40 * KBW, 10)); write(d, 'dist/img/logo.webp', noise(8 * KBW, 11)); write(d, 'dist/img/photo.jpg', noise(30 * KBW, 12)); write(d, 'dist/img/small.png', noise(20 * KBW, 13)); write(d, 'dist/img/edge.png', noise(20 * KBW + 1, 14)); write(d, 'dist/img/icon.svg', '<svg/>');
	for (let i = 0; i < 5; i++) write(d, 'dist/fonts/f' + i + '.woff2', noise(20 * KBW, 20 + i));
	write(d, 'dist/media/clip.mp4', noise(500 * KBW, 30)); write(d, 'dist/media/loop.webm', noise(700 * KBW, 31));
	write(d, 'dist/assets/fonts.css', '@font-face{font-family:A;src:url(a.woff2);font-display:swap}@font-face{font-family:B;src:url(b.woff2)}');
	write(d, 'node_modules/x/ignored.js', noise(400 * KBW, 40));
	return d;
};
const fontsProject = (css) => { const d = proj(); write(d, 'dist/index.html', '<html></html>'); if (css !== null) write(d, 'dist/a.css', css); for (let i = 0; i < 4; i++) write(d, 'dist/f' + i + '.woff2', noise(KBW, i)); return d; };

t('golden: a big build weighed as JSON, table, summary, with --top and from the source fallback', () => {
	const d = bigSite();
	const W = require('../skills/workflow/perf-audit.weigh.js');
	const r = W.weigh(d);
	const out = { report: r, table: W.render(r), summary: W.summary || null, summarize: W.summarize(r), summarize3: W.summarize(r, 3), top2: W.weigh(d, { top: 2 }), fmt: [W.fmt(1023), W.fmt(1024), W.fmt(KBW * KBW - 1), W.fmt(KBW * KBW), W.fmt(KBW * KBW * 2.5)] };
	const src = proj(); write(src, 'src/app.js', 'x'.repeat(100)); write(src, 'src/pic.png', noise(30 * KBW, 50)); write(src, 'src/index.html', '<html><head></head></html>');
	out.srcFallback = W.weigh(src); out.srcExplicit = W.weigh(src, { src: 'src' });
	out.cliJson = JSON.parse(run(d, '--json').stdout); out.cliSummary = run(d, '--summary').stdout; out.cliTable = run(d).stdout;
	const clean = (txt) => txt.split(CRW).join('');
	goldW('weigh.json', clean(JSON.stringify(out, null, 1)) + '\n');
});

t('golden: font-display states and the font-file limit', () => {
	const W = require('../skills/workflow/perf-audit.weigh.js');
	const face = (disp) => '@font-face{font-family:X;src:url(x.woff2)' + (disp ? ';font-display:' + disp : '') + '}';
	const cases = { 'no css': null, 'css without faces': 'body{margin:0}', 'all swap': face('swap') + face('swap'), 'swap and optional': face('swap') + face('optional'), 'one block': face('swap') + face('block'),
		'all block': face('block') + face('fallback'), 'one missing': face('swap') + face(''), 'all missing': face('') + face(''), 'missing and block': face('') + face('block'), 'uppercase swap': face('SWAP') };
	const out = {};
	for (const [k, css] of Object.entries(cases)) { const r = W.weigh(fontsProject(css)); out[k] = { display: r.fonts.display, files: r.fonts.files.length, summary: W.summarize(r) }; }
	const five = fontsProject(face('swap')); write(five, 'dist/f4.woff2', noise(KBW, 9)); const r5 = W.weigh(five); out['five fonts'] = { files: r5.fonts.files.length, summary: W.summarize(r5), table: W.render(r5) };
	goldW('fonts.json', JSON.stringify(out, null, 1).split(CRW).join('') + '\n');
});

t('golden: checkHtml findings and the three-image eager rule', () => {
	const W = require('../skills/workflow/perf-audit.weigh.js');
	const img = (extra) => '<img src="x.png"' + (extra ? ' ' + extra : '') + '>';
	const pages = {
		'3 images 2 eager': '<html><head></head><body>' + img() + img() + img('loading="lazy"') + '</body></html>', '3 images 1 eager': '<html><head></head><body>' + img() + img('loading="lazy"') + img('loading="lazy"') + '</body></html>',
		'2 images 2 eager': '<html><head></head><body>' + img() + img() + '</body></html>', '4 images 3 eager': '<html><head></head><body>' + img() + img() + img() + img('loading="lazy"') + '</body></html>',
		'fetchpriority present': '<html><head></head><body>' + img('fetchpriority="high"') + '</body></html>', 'blocking head script': '<html><head><script src="a.js"></script></head><body></body></html>',
		'async and module scripts': '<html><head><script src="a.js" async></script><script src="b.js" defer></script><script type="module" src="c.js"></script></head><body></body></html>',
		'third party': '<html><head></head><body><script src="https://cdn.x.com/a.js"></script><script src="//other.com/b.js"></script></body></html>',
		'commented out': '<html><head><!-- <script src="a.js"></script> --></head><body></body></html>', 'nested comment trick': '<html><head><!-<!-- x -->- <script src="a.js"></script> --></head></html>',
		'empty': '', 'no head': '<body>' + img() + '</body>',
	};
	const out = {};
	for (const [k, h] of Object.entries(pages)) out[k] = W.checkHtml('p.html', h, 'p.html');
	goldW('html.json', JSON.stringify(out, null, 1).split(CRW).join('') + '\n');
});

t('CLI usage errors: a zero or negative or non-numeric --top and an empty --dist or --src exit 2', () => {
	const d = bigSite();
	for (const bad of [['--top', '0'], ['--top', '-3'], ['--top', 'abc'], ['--dist', ''], ['--src', '']]) assert.strictEqual(run(d, ...bad).status, 2, bad.join(' '));
	assert.strictEqual(run(d, '--top', '1').status, 0);
	assert.strictEqual(run(d, '--dist', 'nowhere').status, 1);
});
