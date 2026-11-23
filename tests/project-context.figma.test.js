const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/project-context.figma.js');
const F = require(SCRIPT);

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a, '--cwd', cwd], { encoding: 'utf8' });
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fg-'));
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const SVG = '<svg width="375" height="812" xmlns="http://www.w3.org/2000/svg"><rect fill="#FFF"/><rect fill="#ffffff"/><rect fill="#1A2B3C"/>'
  + '<text font-family="Inter, sans-serif" font-size="16">Sign in</text><text style="font-family: \'Poppins\'; font-size: 24px">Welcome | back</text>'
  + '<circle fill="rgb(255, 0, 0)"/></svg>';

t('png size is read from the header without decoding', () => {
  assert.deepStrictEqual(F.rasterSize(png(1440, 900), 'png'), [1440, 900]);
  assert.strictEqual(F.rasterSize(Buffer.from('not an image'), 'png'), null);
});

t('svg: size, normalized colors, fonts, type sizes and text are extracted', () => {
  const s = F.svgInfo(SVG);
  assert.deepStrictEqual(s.size, [375, 812]);
  assert.deepStrictEqual(s.colors.sort(), ['#1a2b3c', '#ff0000', '#ffffff', '#ffffff']);
  assert.deepStrictEqual(s.fonts, ['Inter', 'Poppins']);
  assert.deepStrictEqual(s.sizes, [16, 24]);
  assert.deepStrictEqual(s.texts, ['Sign in', 'Welcome | back']);
});

t('svg: viewBox is the size when width and height are missing', () => {
  assert.deepStrictEqual(F.svgInfo('<svg viewBox="0 0 100 50"></svg>').size, [100, 50]);
});

t('scan walks folders, skips other file types, tallies colors by use', () => {
  const d = dir();
  fs.mkdirSync(path.join(d, 'ex'));
  fs.writeFileSync(path.join(d, 'ex', 'home.svg'), SVG);
  fs.writeFileSync(path.join(d, 'ex', 'hero.png'), png(800, 600));
  fs.writeFileSync(path.join(d, 'ex', 'notes.txt'), 'skip me');
  const r = F.scan({ inputs: ['ex'], cwd: d });
  assert.deepStrictEqual(r.files.map((f) => f.file), ['ex/hero.png', 'ex/home.svg']);
  assert.deepStrictEqual(r.colors[0], ['#ffffff', 2]);
  assert.strictEqual(r.flat, 1);
});

t('render: tables, escaped pipes, and the raster-only note', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'a.svg'), SVG);
  fs.writeFileSync(path.join(d, 'b.png'), png(10, 20));
  const md = F.render(F.scan({ inputs: ['a.svg', 'b.png'], cwd: d, link: 'https://figma.com/file/x' }));
  assert.match(md, /Source: https:\/\/figma\.com\/file\/x/);
  assert.match(md, /\| a\.svg \| svg \| 375 x 812 \|/);
  assert.match(md, /\| b\.png \| raster \| 10 x 20 \|/);
  assert.match(md, /Welcome \\\| back/);
  assert.match(md, /1 PNG\/JPG\/WebP file\(s\) are measured only/);
});

t('cli: prints a draft, writes only with --write and only when design/ exists', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'a.svg'), SVG);
  assert.match(cli(d, 'a.svg').stdout, /# Figma intake/);
  const no = cli(d, 'a.svg', '--write');
  assert.strictEqual(no.status, 2);
  assert.match(no.stderr, /run \/ctx init first/);
  fs.mkdirSync(path.join(d, 'project-context', 'design'), { recursive: true });
  assert.match(cli(d, 'a.svg', '--write').stdout, /wrote project-context\/design\/figma\.md/);
  assert.match(fs.readFileSync(path.join(d, 'project-context', 'design', 'figma.md'), 'utf8'), /Inter/);
});

t('cli: usage errors exit 1, a missing file exits 2', () => {
  const d = dir();
  assert.strictEqual(cli(d).status, 1);
  assert.strictEqual(cli(d, 'a.svg', '--nope').status, 1);
  assert.strictEqual(cli(d, 'missing.svg').status, 2);
});

t('figma-style export: named white and black count, outlined text is flagged, outside paths stay short', () => {
  const d = dir();
  const out = dir();
  fs.writeFileSync(path.join(out, 'Login.svg'), '<svg width="390" height="844" fill="none"><rect fill="white"/><rect fill="#2F6BFF"/><stop stop-color="black"/><text font-family="Inter" font-size="14"><tspan>Hi</tspan></text></svg>');
  fs.writeFileSync(path.join(out, 'Logo.svg'), '<svg width="10" height="10"><path d="M0 0H10V10Z" fill="#0A84FF"/></svg>');
  const r = F.scan({ inputs: [out], cwd: d });
  assert.deepStrictEqual(r.files.map((f) => f.file), ['Login.svg', 'Logo.svg']);
  assert.deepStrictEqual(r.colors.map((x) => x[0]).sort(), ['#000000', '#0a84ff', '#2f6bff', '#ffffff']);
  assert.strictEqual(r.files[1].outlined, true);
  assert.strictEqual(r.files[0].outlined, false);
  assert.match(F.render(r), /Figma outlines text into paths/);
});

t('tokens: colors and type sizes map to the project custom properties, exact first, nearest within a small distance', () => {
  const d = dir();
  fs.mkdirSync(path.join(d, 'src', 'styles'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src', 'styles', 'tokens.css'), ':root{--color-bg:#ffffff;--color-ink:#1a2b3d;--color-accent:rgb(250,0,0);--text-body:1rem;--text-title:24px;--space-4:16px;--font-sans:Inter}');
  fs.mkdirSync(path.join(d, 'out')); fs.writeFileSync(path.join(d, 'out', 'a.svg'), SVG);
  const out = cli(d, 'out').stdout;
  assert.match(out, /Token column from `src\/styles\/tokens\.css`/);
  assert.match(out, /\| #ffffff \| 2 \| `--color-bg` \|/);
  assert.match(out, /\| #1a2b3c \| 1 \| ~`--color-ink` \|/);
  assert.match(out, /\| #ff0000 \| 1 \| ~`--color-accent` \|/);
  assert.match(out, /16 \(`--text-body`\), 24 \(`--text-title`\)/);
  assert.ok(!/--space-4|--font-sans/.test(out), 'only color and type-size tokens are used');
  const none = dir(); fs.mkdirSync(path.join(none, 'out')); fs.writeFileSync(path.join(none, 'out', 'a.svg'), SVG);
  assert.ok(!/Token column/.test(cli(none, 'out').stdout), 'no token file: no token column');
  assert.match(cli(d, 'out', '--tokens', 'src/styles/tokens.css').stdout, /Token column/);
});

// ---- gaps found by `invariants probe` on project-context.figma.js ----
// Regenerate the golden on purpose with UPDATE_GOLDEN=1 node tests/project-context.figma.test.js, then read the diff.
const CRF = String.fromCharCode(13);
const mkBuf = (len, fn) => { const b = Buffer.alloc(len); fn(b); return b; };
const pngB = (len, w, h) => mkBuf(len, (b) => { b.write('PNG', 1, 'latin1'); if (len >= 24) { b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); } });
const riff = (kind, fill) => mkBuf(40, (b) => { b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write(kind, 12, 'latin1'); fill(b); });
const seg = (marker, len, fill) => { const b = Buffer.alloc(2 + len); b[0] = 0xff; b[1] = marker; b.writeUInt16BE(len, 2); if (fill) fill(b); return b; };
const sof = (marker, w, h) => seg(marker, 17, (b) => { b[4] = 8; b.writeUInt16BE(h, 5); b.writeUInt16BE(w, 7); });
const jpg = (...parts) => Buffer.concat([Buffer.from([0xff, 0xd8, 0x00]), ...parts]);
const goldenFile = (name, text, actualRead) => {
	const file = path.join(__dirname, 'fixtures', 'figma', name);
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return; }
	assert.ok(fs.existsSync(file), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs.readFileSync(file, 'utf8').split(CRF).join(''));
};

t('golden: raster sizes for PNG, WebP (three kinds) and JPEG edge shapes', () => {
	const sofEnd = jpg(seg(0xe0, 16), sof(0xc0, 640, 480));
	const cases = {
		'png 33 bytes': F.rasterSize(pngB(33, 1440, 900), 'png'), 'png 25 bytes': F.rasterSize(pngB(25, 7, 9), 'png'), 'png 24 bytes': F.rasterSize(pngB(24, 7, 9), 'png'), 'png wrong signature': F.rasterSize(Buffer.alloc(40), 'png'),
		'webp VP8X': F.rasterSize(riff('VP8X', (b) => { b.writeUIntLE(639, 24, 3); b.writeUIntLE(479, 27, 3); }), 'webp'),
		'webp VP8 with scale bits': F.rasterSize(riff('VP8 ', (b) => { b.writeUInt16LE(800 | 0xc000, 26); b.writeUInt16LE(600 | 0x4000, 28); }), 'webp'),
		'webp VP8L': F.rasterSize(riff('VP8L', (b) => { b.writeUInt32LE((99 | (49 << 14)) >>> 0, 21); }), 'webp'),
		'webp unknown kind': F.rasterSize(riff('XXXX', () => {}), 'webp'), 'webp not riff': F.rasterSize(Buffer.alloc(40), 'webp'),
		'jpg app0 then sof0': F.rasterSize(jpg(seg(0xe0, 16), sof(0xc0, 1024, 768), Buffer.alloc(12)), 'jpg'),
		'jpeg ext, progressive sof2': F.rasterSize(jpg(sof(0xc2, 300, 200), Buffer.alloc(12)), 'jpeg'),
		'jpg skips dht, dac and ext markers': F.rasterSize(jpg(seg(0xc4, 6), seg(0xc8, 4), seg(0xcc, 4), sof(0xc1, 50, 60), Buffer.alloc(12)), 'jpg'),
		'jpg marker c0 lower bound': F.rasterSize(jpg(seg(0xbf, 4), sof(0xc0, 11, 12), Buffer.alloc(12)), 'jpg'),
		'jpg marker cf upper bound': F.rasterSize(jpg(sof(0xcf, 21, 22), Buffer.alloc(12)), 'jpg'),
		'jpg marker d0 is not a frame': F.rasterSize(jpg(seg(0xd0, 4), Buffer.alloc(12)), 'jpg'),
		'jpg sof at the very end': F.rasterSize(sofEnd.subarray(0, sofEnd.length), 'jpg'),
		'jpg sof cut one byte short of the scan limit': F.rasterSize(jpg(sof(0xc0, 5, 6)), 'jpg'),
		'jpg no marker': F.rasterSize(Buffer.alloc(30), 'jpg'), 'unknown extension': F.rasterSize(pngB(33, 5, 5), 'gif'),
	};
	goldenFile('raster.json', JSON.stringify(cases, null, 1) + '\n');
});

t('golden: svgInfo for sizes, colors, fonts, text, images and outlines', () => {
	const svgs = {
		'width and height': '<svg width="10px" height="20"><rect/></svg>', 'width only with viewBox': '<svg width="10" viewBox="0 0 100 200"></svg>',
		'width only no viewBox': '<svg width="10"></svg>', 'viewBox only': '<svg viewBox="0 0 100.5 200"></svg>', 'viewBox commas': '<svg viewBox="0,0,30,40"></svg>',
		'viewBox of three numbers': '<svg viewBox="0 0 100"></svg>', 'viewBox with text': '<svg viewBox="0 0 a b"></svg>', 'percent width': '<svg width="50%" height="50%" viewBox="0 0 8 9"></svg>',
		'no svg element': '<g><rect fill="#abc"/></g>', 'colors': '<svg><rect fill="#FFF"/><rect fill="#ffffff80"/><rect stroke="#1A2B3C"/><circle fill="rgb(1, 2, 3)" stroke="rgba(300,0,0,.5)"/><g fill="white"/><g style="color: black"/><g fill="none"/></svg>',
		'fonts and sizes': '<svg><text font-family="Inter, sans-serif" font-size="16">Hello</text><tspan style="font-family: \'Poppins\'; font-size: 24.5px"> there </tspan><text font-size="12"></text></svg>',
		'image and outlines': '<svg><image href="a.png"/><path d="M0"/></svg>', 'outlined only': '<svg><path d="M0"/></svg>', 'text and path': '<svg><text>Hi</text><path d="M0"/></svg>', 'empty': '<svg></svg>',
	};
	const out = {};
	for (const [k, v] of Object.entries(svgs)) out[k] = F.svgInfo(v);
	goldenFile('svg.json', JSON.stringify(out, null, 1) + '\n');
});

t('golden: token parsing and nearest token, then a folder scan, its markdown and the CLI JSON', () => {
	const css = ':root{ --brand: #1A2B3C; --ink: rgb(10, 20, 30); --alpha: #11223344; --short: #abc; --space: 8px; --fs-body: 16px; --text-lg: 1.5rem; --font-family-base: Inter; --font-weight: 600; --line-height-text: 20px; --font-size-odd: 10pt; --size-px: 12px }';
	const tk = F.parseTokens(css, 'tokens.css');
	const near = {
		colorExact: F.nearestColor('#1a2b3c', tk), colorClose: F.nearestColor('#1a2b3d', tk), colorOneAway: F.nearestColor('#1a2b3e', tk), colorFar: F.nearestColor('#ffffff', tk),
		sizeExact: F.nearestSize(16, tk), sizeClose: F.nearestSize(17, tk), sizeFar: F.nearestSize(40, tk), sizeLg: F.nearestSize(24, tk),
	};
	const root = dir(); const cwd = dir();
	const write2 = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
	write2('a.svg', SVG); write2('sub/b.svg', '<svg viewBox="0 0 10 20"><text font-size="16" font-family="Inter">Hi</text><rect fill="#1a2b3d"/></svg>'); write2('c.png', pngB(33, 10, 20));
	write2('d.jpg', jpg(sof(0xc0, 30, 40), Buffer.alloc(12))); write2('e.webp', riff('VP8X', (b) => { b.writeUIntLE(99, 24, 3); b.writeUIntLE(49, 27, 3); })); write2('skip.txt', 'x'); write2('big.bin', Buffer.alloc(4096));
	fs.writeFileSync(path.join(cwd, 'tokens.css'), css);
	const o = { inputs: [root], cwd, tokens: path.join(cwd, 'tokens.css'), link: 'https://figma.example/file/x' };
	const clean = (txt) => txt.split(CRF).join('').split(root).join('<root>').split(cwd).join('<cwd>').split(root.split(String.fromCharCode(92)).join('/')).join('<root>').split(cwd.split(String.fromCharCode(92)).join('/')).join('<cwd>');
	const res = F.scan(o);
	const single = F.scan({ inputs: [path.join(root, 'a.svg')], cwd: root });
	const cli2 = spawnSync('node', [SCRIPT, root, '--json', '--cwd', cwd, '--tokens', path.join(cwd, 'tokens.css')], { encoding: 'utf8' });
	const cli3 = spawnSync('node', [SCRIPT, path.join(root, 'sub'), '--cwd', cwd, '--link', 'https://figma.example/l'], { encoding: 'utf8' });
	const out = { tokens: tk, near, scan: res, single, markdown: F.render(res), cliJson: cli2.stdout, cliStatus: [cli2.status, cli3.status], cliText: cli3.stdout, cliErr: cli3.stderr };
	goldenFile('scan.json', clean(JSON.stringify(out, null, 1).split(String.fromCharCode(92) + String.fromCharCode(92)).join('/')) + '\n');
});

// ---- second round: the survivors left after the golden ----
t('nearest token: the first of two equally near tokens wins', () => {
	const tk = F.parseTokens(':root{ --one: #101010; --two: #101012; --a-size: 10px; --b-size: 12px }', 't.css');
	assert.strictEqual(F.nearestColor('#101011', tk), '~`--one`');
	assert.strictEqual(F.nearestSize(11, tk), '~`--a-size`');
});

t('jpeg parsing stops at its scan limit, and a webp header on a non-webp file is not read', () => {
	const exact = Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x06, 0x00, 0x05]);
	assert.strictEqual(F.rasterSize(exact, 'jpg'), null, 'segment ends exactly at the limit');
	assert.deepStrictEqual(F.rasterSize(Buffer.concat([exact, Buffer.alloc(1)]), 'jpg'), [5, 6], 'one more byte lets it read');
	const riffX = mkBuf(40, (b) => { b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1'); b.writeUIntLE(639, 24, 3); b.writeUIntLE(479, 27, 3); });
	assert.deepStrictEqual(F.rasterSize(riffX, 'webp'), [640, 480]);
	assert.strictEqual(F.rasterSize(riffX, 'png'), null);
	assert.strictEqual(F.rasterSize(riffX, 'jpg'), null);
});

t('type sizes are listed smallest first, and a missing input is an error', () => {
	const root = dir(); const cwd = dir();
	fs.writeFileSync(path.join(root, 'a.svg'), '<svg width="1" height="1"><text font-size="40">A</text><text font-size="40">B</text><text font-size="8">C</text><text font-size="24">D</text><text font-size="24">E</text><text font-size="16">F</text></svg>');
	assert.throws(() => F.scan({ inputs: [path.join(cwd, 'does-not-exist')], cwd }), /not found/);
	const r = F.scan({ inputs: [root], cwd });
	assert.deepStrictEqual(r.sizes.map((x) => x[0]), [8, 16, 24, 40]);
	assert.deepStrictEqual(r.files.map((x) => x.file), ['a.svg']);
});
