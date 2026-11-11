const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const F = require('../skills/addons/figma-code.cli.js');

// Fonts (files, download, browser measurement) and the project-context folder for the figma-code add-on.
const results = [];
const t = (name, fn) => { results.push(Promise.resolve().then(fn).then(() => console.log('ok   ' + name), (e) => { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; })); };
const CLI = path.join(__dirname, '..', 'skills', 'addons', 'figma-code.cli.js');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fcfont space-'));
const HAVE_BROWSER = !!F.findChrome();
const live = (name, fn) => (HAVE_BROWSER ? t(name, fn) : console.log('skip ' + name + ' (no Chrome or Edge on this machine)'));
const ARIAL = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find((p) => fs.existsSync(p));
const liveArial = (name, fn) => (HAVE_BROWSER && ARIAL ? t(name, fn) : console.log('skip ' + name + ' (needs a browser and an Arial file)'));
const TEXT_SVG = '<svg width="260" height="80" viewBox="0 0 260 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="260" height="80" fill="white"/><text fill="#111827" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="24" font-weight="bold"><tspan x="20" y="50">Room Renting</tspan></text></svg>';

t('fontFaceCss writes one @font-face per file with the weight, style and a relative url', () => {
  const css = F.fontFaceCss([{ family: 'Inter', weight: '400 700', style: 'normal', file: '/x/Inter.ttf', format: 'truetype' }], (f) => 'assets/' + path.basename(f.file));
  assert.match(css, /font-family: "Inter";/);
  assert.match(css, /src: url\(assets\/Inter\.ttf\) format\("truetype"\);/);
  assert.match(css, /font-weight: 400 700;/);
  assert.match(css, /font-display: swap;/);
});

t('cssWeight normalizes names and numbers', () => {
  assert.deepStrictEqual(['bold', 'normal', '600', undefined, 'weird'].map(F.cssWeight), ['700', '400', '600', '400', '400']);
});

t('readFontInfo refuses anything that is not a font, and reads family, weight and style from a real file', () => {
  assert.strictEqual(F.readFontInfo(Buffer.from('not a font at all, just text')), null);
  if (!ARIAL) return;
  const info = F.readFontInfo(fs.readFileSync(ARIAL));
  assert.deepStrictEqual([info.family, info.weight, info.style], ['Arial', '400', 'normal']);
});

t('loadFontDir reads .ttf and .otf, skips .woff2 and says so', () => {
  if (!ARIAL) return;
  const d = tmp(); fs.copyFileSync(ARIAL, path.join(d, 'a.ttf')); fs.writeFileSync(path.join(d, 'b.woff2'), 'x'); fs.writeFileSync(path.join(d, 'c.txt'), 'x');
  const r = F.loadFontDir(d);
  assert.deepStrictEqual(r.files.map((f) => f.family), ['Arial']);
  assert.deepStrictEqual(r.skipped, ['b.woff2']);
});

t('downloadGoogleFonts asks for the weights used, keeps the design name, tries "Pro", reports what is not found, saves flat files', async () => {
  const d = tmp();
  const calls = [];
  const face = (family, weight, url) => `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  src: url(${url}) format('truetype');\n}`;
  const fake = async (url) => {
    calls.push(url);
    const ok = (body) => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => Buffer.from('FONTDATA') });
    if (/family=Inter:wght@400;700/.test(url)) return ok(face('Inter', '400', 'https://fonts.gstatic.com/s/inter/a.ttf') + '\n' + face('Inter', '700', 'https://fonts.gstatic.com/s/inter/b.ttf'));
    if (/family=Be\+Vietnam\+Pro:wght@600/.test(url)) return ok(face('Be Vietnam Pro', '600', 'https://fonts.gstatic.com/s/bv/c.ttf'));
    if (/gstatic/.test(url)) return ok('');
    return { ok: false, status: 400, text: async () => '', arrayBuffer: async () => Buffer.alloc(0) };
  };
  const spec = (family, weight) => ({ key: family + weight, stack: family, family, weight, style: 'normal' });
  const r = await F.downloadGoogleFonts([spec('Inter', '400'), spec('Inter', '700'), spec('Be Vietnam', '600'), spec('No Such Font', '400')], d, fake);
  assert.deepStrictEqual(r.files.map((f) => [f.family, f.weight]), [['Inter', '400'], ['Inter', '700'], ['Be Vietnam', '600']]);
  assert.deepStrictEqual(r.unresolved, ['No Such Font']);
  assert.ok(r.notes.some((n) => /Be Vietnam is "Be Vietnam Pro" on Google Fonts/.test(n)), r.notes.join('|'));
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ['BeVietnam-600-normal.ttf', 'Inter-400-normal.ttf', 'Inter-700-normal.ttf']);
  assert.ok(calls.some((c) => c.startsWith('https://fonts.googleapis.com/css2?')));
  assert.strictEqual(fs.readFileSync(path.join(d, 'Inter-400-normal.ttf'), 'utf8'), 'FONTDATA');
});

liveArial('probeFonts measures the browser font: a present family reports ascent and descent, a missing one is flagged', () => {
  const spec = (family) => ({ key: family, stack: family, family, weight: '400', style: 'normal' });
  const m = F.probeFonts([spec('Arial'), spec('Zzqx Not A Real Font')], []);
  assert.strictEqual(m.get('Arial').avail, true);
  const a = m.get('Arial');
  assert.ok(a.a > 0.7 && a.a < 1.2 && a.d > 0.1 && a.d < 0.5, JSON.stringify(a));
  assert.strictEqual(m.get('Zzqx Not A Real Font').avail, false);
});

liveArial('build with --fonts: the file is copied to assets/, written as @font-face, loaded for the reference, and the diff passes', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 't.svg'), TEXT_SVG);
  const fonts = path.join(d, 'myfonts'); fs.mkdirSync(fonts); fs.copyFileSync(ARIAL, path.join(fonts, 'Arial.ttf'));
  const r = run('build', path.join(d, 't.svg'), '--out', path.join(d, 'out'), '--fonts', fonts, '--root', d, '--json');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.fonts.files, 1);
  assert.deepStrictEqual(j.fonts.missing, []);
  assert.ok(j.gate.ok, 'diff ' + j.gate.diff.percent);
  assert.ok(fs.existsSync(path.join(d, 'out', 'assets', 'Arial.ttf')));
  assert.match(fs.readFileSync(path.join(d, 'out', 'styles.css'), 'utf8'), /@font-face \{\n {2}font-family: "Arial";\n {2}src: url\(assets\/Arial\.ttf\)/);
  assert.strictEqual(run('build', path.join(d, 't.svg'), '--out', path.join(d, 'o2'), '--fonts', path.join(d, 'nope'), '--root', d).status, 2);
});

live('a family that is neither installed nor supplied is reported with the command that fixes it', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 't.svg'), TEXT_SVG.replace('Arial', 'Zzqx Not A Real Font'));
  const r = run('build', path.join(d, 't.svg'), '--out', path.join(d, 'out'), '--root', d);
  assert.match(r.stdout, /FONTS NOT AVAILABLE: Zzqx Not A Real Font\. Run again with --download-fonts/);
  assert.match(r.stdout, /--fonts <folder>/);
});

live('project-context: build finds the only SVG in design/, records one row per frame (replaced on a rebuild), and --no-record writes nothing', () => {
  const d = tmp(); fs.mkdirSync(path.join(d, 'project-context', 'design'), { recursive: true });
  fs.writeFileSync(path.join(d, 'project-context', 'design', 'home.svg'), TEXT_SVG);
  const r = run('build', '--root', d, '--out', path.join(d, 'out'), '--json');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /assumed: project-context\/design\/home\.svg/);
  const rec = path.join(d, 'project-context', 'design', 'figma-code.md');
  assert.ok(fs.existsSync(rec));
  const rows = () => fs.readFileSync(rec, 'utf8').split('\n').filter((l) => /^\| home /.test(l));
  assert.strictEqual(rows().length, 1);
  assert.match(rows()[0], /project-context\/design\/home\.svg \| 260 x 80 \|/);
  assert.strictEqual(JSON.parse(r.stdout).recorded, 'project-context/design/figma-code.md');
  run('build', '--root', d, '--out', path.join(d, 'out'));
  assert.strictEqual(rows().length, 1, 'a rebuild replaces the row');
  fs.writeFileSync(path.join(d, 'project-context', 'design', 'two.svg'), TEXT_SVG);
  const many = run('build', '--root', d);
  assert.strictEqual(many.status, 2);
  assert.match(many.stderr, /several SVGs in project-context\/design\//);
  fs.rmSync(rec);
  run('build', path.join(d, 'project-context', 'design', 'home.svg'), '--root', d, '--out', path.join(d, 'out'), '--no-record');
  assert.ok(!fs.existsSync(rec), '--no-record leaves the folder alone');
  const plain = tmp(); fs.writeFileSync(path.join(plain, 'a.svg'), TEXT_SVG);
  assert.strictEqual(JSON.parse(run('build', path.join(plain, 'a.svg'), '--root', plain, '--out', path.join(plain, 'o'), '--json').stdout).recorded, null);
  assert.strictEqual(run('build', '--root', plain).status, 2);
});

t('detect reports the project-context design folder, its SVGs and a fonts folder', () => {
  const d = tmp(); fs.mkdirSync(path.join(d, 'project-context', 'design', 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(d, 'project-context', 'design', 'a.svg'), TEXT_SVG);
  const j = JSON.parse(run('detect', '--root', d, '--json').stdout);
  assert.deepStrictEqual(j.context, { design: true, svgs: ['project-context/design/a.svg'], fontsDir: 'project-context/design/fonts' });
  assert.match(run('detect', '--root', d).stdout, /project-context: design\/ found, 1 SVG\(s\), fonts folder project-context\/design\/fonts/);
  assert.match(run('detect', '--root', tmp()).stdout, /project-context: no project-context\/design\/ folder/);
});

Promise.all(results);
