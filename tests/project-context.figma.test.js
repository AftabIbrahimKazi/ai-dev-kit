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
