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

// ---- measure.js pure checks (no browser): content scans, contrast, verdict ----
const M = require(MEASURE);
const row = (o = {}) => ({ width: 320, ok: true, overflowX: false, offenders: [], taps: [], clipped: [], secrets: [], badValues: [], lowContrast: [], ...o });
const report = (o = {}) => ({ url: 'http://x', load: { failed: null, status: 200, pageErrors: [], consoleErrors: [], failedRequests: [] }, rows: [row()], ...o });
t('scanText finds each secret shape and never prints a whole key', () => {
  const key = 'sk_live_' + 'A1b2C3d4E5f6G7h8';
  for (const text of [`debug: ${key}`, 'id AK' + 'IA' + 'A'.repeat(16), 'tok gh' + 'p_' + 'a'.repeat(30), 'x xo' + 'xb-' + '1'.repeat(10) + '-abcdef', '-----BEGIN RSA PRI' + 'VATE KEY-----', 'DB postgres://app:hunter2@db.internal/x', 'config password=hunter22']) { // built from parts so the pre-commit secret scan does not flag this file
    assert.strictEqual(M.scanText(text).secrets.length, 1, text);
  }
  assert.ok(!M.scanText(`debug: ${key}`).secrets[0].includes(key));
});
t('scanText flags NaN, undefined, null as values but not words that contain them', () => {
  const bad = M.scanText('Total: NaN items: undefined user: null price $NaN [object Object] Infinity');
  assert.strictEqual(bad.badValues.length, 5);
  const clean = M.scanText('Nancy has a nullable field, a null-safe call, version 2.null.3? no. Password: required. Enter your password. Password ********');
  assert.deepStrictEqual(clean, { secrets: [], badValues: [] });
});
t('contrast: known pairs, alpha layers and the unreadable white-on-white banner', () => {
  assert.strictEqual(M.contrast('rgb(255, 255, 255)', ['rgb(255, 255, 255)']), 1);
  assert.strictEqual(M.contrast('rgb(0, 0, 0)', ['rgb(255, 255, 255)']), 21);
  assert.strictEqual(M.contrast('rgb(0, 0, 0)', ['rgba(0, 0, 0, 0)']), 21);
  assert.ok(M.contrast('rgb(119, 119, 119)', ['rgba(255, 255, 255, 0.5)', 'rgb(255, 255, 255)']) < 4.5);
  assert.strictEqual(M.contrast('hsl(0 0% 0%)', ['rgb(255, 255, 255)']), null);
  assert.strictEqual(M.parseColor('rgb(10 20 30 / 50%)')[3], 0.5);
});
t('lowContrast: 4.5 for body text, 3 for large, images and gradients are never flagged', () => {
  const el = (o) => ({ name: 'p', color: 'rgb(119, 119, 119)', layers: ['rgb(255, 255, 255)'], size: 16, weight: 400, ...o });
  assert.strictEqual(M.lowContrast([el({})]).length, 1);
  assert.strictEqual(M.lowContrast([el({ size: 24 })]).length, 0);
  assert.strictEqual(M.lowContrast([el({ layers: null, color: 'rgb(255, 255, 255)' })]).length, 0);
  assert.match(M.lowContrast([el({ color: 'rgb(255, 255, 255)', name: 'p.banner' })])[0], /^p\.banner 1:1$/);
});
t('classify: clean is pass, findings and load errors escalate, a failed load is a retry', () => {
  assert.strictEqual(M.classify(report()).verdict, 'pass');
  assert.strictEqual(M.classify(report({ rows: [row({ ok: false, badValues: ['NaN: "total NaN"'] })] })).verdict, 'escalate');
  assert.strictEqual(M.classify(report({ rows: [row({ ok: false, lowContrast: ['p.banner 1:1'] })] })).verdict, 'escalate');
  const withErr = report(); withErr.load.consoleErrors.push('boom');
  assert.strictEqual(M.classify(withErr).verdict, 'escalate');
  const notFound = report(); notFound.load.status = 404;
  assert.match(M.classify(notFound).reasons[0], /404/);
  const timeout = report({ rows: [] }); timeout.load.failed = 'navigation failed: Timeout 30000ms exceeded';
  assert.deepStrictEqual(M.classify(timeout), { verdict: 'retry', reasons: ['navigation failed: Timeout 30000ms exceeded'] });
});
t('--out sets the evidence dir and defaults the screenshots under it', () => {
  const o = M.parseArgs(['--url', 'http://x', '--widths', '320', '--out', path.join(os.tmpdir(), 'ev')]);
  assert.strictEqual(o.shots, path.join(path.resolve(os.tmpdir(), 'ev'), 'shots'));
});
