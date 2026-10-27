const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/workflow/responsive-check.probes.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const run = (...a) => spawnSync('node', [SCRIPT, ...a, '--json'], { encoding: 'utf8' });
const planOf = (...a) => { const r = run(...a); assert.ok(r.status === 0 || r.status === 3, r.stderr); return JSON.parse(r.stdout); };
const widths = (p) => p.probes.map((x) => x.width);
const proj = (files) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rcp-'));
  for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); }
  return d;
};

t('no flags: the six RULE 17 zones, three probes each, first zone starts at 320', () => {
  const p = planOf();
  assert.deepStrictEqual(widths(p), [320, 448, 575.98, 576, 672, 767.98, 768, 880, 991.98, 992, 1096, 1199.98, 1200, 1300, 1399.98, 1400, 1660, 1920]);
  assert.strictEqual(p.checks.length, 6);
  assert.strictEqual(p.needsConfirm, false);
});
t('a fractional edge is probed at the whole-pixel viewport below it', () => {
  const p = planOf('--range', '576-767.98');
  const edge = p.probes.find((x) => x.width === 767.98);
  assert.strictEqual(edge.viewport, 767);
  assert.strictEqual(edge.zone, 'S');
});
t('--range uses the bounds as typed and accepts a comma list and repeats', () => {
  const a = planOf('--range', '600-900,1000-1100');
  const b = planOf('--range', '600-900', '--range', '1000-1100');
  assert.deepStrictEqual(widths(a), [600, 750, 900, 1000, 1050, 1100]);
  assert.deepStrictEqual(widths(a), widths(b));
});
t('--min probes just below, the value, then each standard lower edge above, then 1920; warns', () => {
  const p = planOf('--min', '768');
  assert.deepStrictEqual(widths(p), [767.98, 768, 992, 1200, 1400, 1920]);
  assert.match(p.warnings[0], /non-standard, RULE 17/);
});
t('--max probes the value, just above, then each standard upper edge below, then 320; warns', () => {
  const p = planOf('--max', '991.98');
  assert.deepStrictEqual(widths(p), [320, 575.98, 767.98, 991.98, 992]);
  assert.match(p.warnings[0], /non-standard/);
});
t('--width is one probe with no query-type logic', () => {
  const p = planOf('--width', '375,820');
  assert.deepStrictEqual(p.probes.map((x) => [x.width, x.zone]), [[375, 'XS'], [820, 'M']]);
  assert.deepStrictEqual(p.warnings, []);
});
t('mixed checks merge into one deduplicated plan and a shared width lists every check', () => {
  const p = planOf('--range', '320-575.98', '--width', '320', '--min', '1200');
  assert.strictEqual(widths(p).filter((w) => w === 320).length, 1);
  assert.deepStrictEqual(p.probes.find((x) => x.width === 320).checks, ['range 320-575.98', 'width 320']);
  assert.strictEqual(p.checks.length, 3);
});
t('overlapping ranges warn but still plan', () => {
  const p = planOf('--range', '600-900,800-1000');
  assert.ok(p.warnings.some((w) => /overlaps/.test(w)));
  assert.ok(p.probes.length > 0);
});
t('over the cap exits 3 and asks to confirm; --max-probes raises it', () => {
  const over = run('--max-probes', '10');
  assert.strictEqual(over.status, 3);
  assert.strictEqual(JSON.parse(over.stdout).needsConfirm, true);
  assert.strictEqual(run('--max-probes', '30').status, 0);
});
t('--ranges replaces the default zones', () => {
  const p = planOf('--ranges', '0-479,480-1023,1024-');
  assert.strictEqual(p.checks.length, 3);
  assert.deepStrictEqual(widths(p), [320, 400, 479, 480, 752, 1023, 1024, 1472, 1920]);
});
t('bad input is a clear error', () => {
  const r = run('--range', '900-600');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /must end above/);
  assert.match(run('--width').stderr, /needs a value/);
});

const THEME = {
  'src/a.css': '@media (min-width: 768px) and (max-width: 991.98px) { a{} }\n@media (min-width: 48em) { a{} }\n@media (width >= 1200px) { a{} }\n@media (max-width: 640px) { a{} }\n@media (orientation: landscape) { a{} }\n',
  'src/b.scss': '@media (min-width: $md) { a{} }\n.x { @include respond-to(md) { a{} } }\n',
  'node_modules/lib/c.css': '@media (min-width: 500px) { a{} }',
  'dist/d.css': '@media (min-width: 555px) { a{} }',
};
t('detect reads queries, units, range syntax and style counts; skips vendor and built output', () => {
  const d = JSON.parse(run('--detect', '--cwd', proj(THEME)).stdout);
  assert.strictEqual(d.queries, 4);
  assert.strictEqual(d.ignored, 1);
  assert.deepStrictEqual(d.style, { range: 1, min: 2, max: 1 });
  assert.deepStrictEqual(d.breakpoints, [640, 768, 991.98, 1200]);
  assert.deepStrictEqual(d.extra, { 640: 1 });
  assert.strictEqual(d.unresolved.length, 2);
  assert.strictEqual(d.suggest, 'min');
});
t('detect --built also reads built output', () => {
  const d = JSON.parse(run('--detect', '--built', '--cwd', proj(THEME)).stdout);
  assert.ok(d.breakpoints.includes(555));
});
t('detect reports zones no query touches and overlapping ranges in one file', () => {
  const d = JSON.parse(run('--detect', '--cwd', proj({ 'a.css': '@media (max-width: 575.98px) { a{} }\n@media (min-width: 600px) and (max-width: 900px) { a{} }\n@media (min-width: 800px) and (max-width: 1000px) { a{} }\n' })).stdout);
  assert.ok(d.uncovered.some((z) => z.startsWith('XXL')));
  assert.deepStrictEqual(d.overlaps, ['a.css: 600-900 vs 800-1000']);
});
t('--min with no value takes the detected min-width queries', () => {
  const p = planOf('--min', '--cwd', proj(THEME));
  assert.deepStrictEqual(widths(p), [767.98, 768, 1199.98, 1200, 1400, 1920]);
  assert.strictEqual(p.checks[0], 'min-width detected');
});
t('--min with no value and nothing detected is an error, not an empty plan', () => {
  const r = run('--min', '--cwd', proj({ 'a.css': 'a{}' }));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /found no min-width queries/);
});

// measure.js needs a real browser, which this suite does not launch: only its argument and setup errors are tested.
const MEASURE = path.join(__dirname, '../skills/workflow/responsive-check.measure.js');
const measure = (...a) => spawnSync('node', [MEASURE, ...a], { encoding: 'utf8' });
t('measure: usage errors name the problem', () => {
  assert.match(measure('--widths', '320').stderr, /--url is required/);
  assert.match(measure('--url', 'http://x', '--widths', '575.98').stderr, /whole pixel widths/);
});
t('measure: a missing Playwright gives an install hint', () => {
  const { loadChromium } = require(MEASURE);
  assert.throws(() => loadChromium(os.tmpdir(), ['no-such-playwright-package']), /e2e-scaffold skill/);
});
