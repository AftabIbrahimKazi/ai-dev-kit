const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scan, check } = require('../skills/stack/astro-page.conventions.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'stack', 'astro-page.conventions.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astro space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });

function fixture() {
  const d = proj();
  write(d, 'astro.config.mjs', 'export default {}');
  write(d, 'src/styles/tokens.css', ':root{--ex-color-bg:#fff;--ex-color-ink:#000;--ex-space-1:4px;--ex-space-2:8px}');
  write(d, 'src/styles/home.css', '.ex-hero{color:var(--ex-color-ink)}.ex-card{padding:var(--ex-space-2)}');
  write(d, 'src/pages/index.astro', '---\n---\n<link rel="stylesheet" href="/css/home.css">\n<Hero client:visible />\n<script src="../scripts/home-entry.ts"></script>');
  write(d, 'src/pages/about.astro', '---\n---\n<p>hi</p><style>p{margin:0}</style>');
  write(d, 'src/components/Hero.astro', '<div class="ex-hero"></div>');
  write(d, 'src/layouts/Base.astro', '<slot /><script>document.addEventListener("astro:page-load", () => {})</script>');
  write(d, 'src/scripts/home-entry.ts', 'export {}');
  write(d, 'src/scripts/about-entry.ts', 'export {}');
  write(d, 'public/img/a.png', 'x');
  return d;
}

t('scan finds prefixes, folders, entry pattern, directives, assets and lifecycle', () => {
  const c = scan(fixture());
  assert.strictEqual(c.astro, true);
  assert.strictEqual(c.tokenPrefix, '--ex-');
  assert.strictEqual(c.tokenFile, 'src/styles/tokens.css');
  assert.strictEqual(c.selectorPrefix, 'ex-');
  assert.strictEqual(c.pagesDir, 'src/pages');
  assert.strictEqual(c.componentsDir, 'src/components');
  assert.strictEqual(c.layoutsDir, 'src/layouts');
  assert.strictEqual(c.scriptsDir, 'src/scripts');
  assert.strictEqual(c.entryPattern, '<page>-entry.ts');
  assert.deepStrictEqual(c.clientDirectives, { visible: 1 });
  assert.strictEqual(c.assetPath, 'public');
  assert.ok(c.transitions.includes('astro:page-load'));
  assert.strictEqual(c.scopedStyles, 1);
});

t('check flags a hardcoded colour, an unprefixed selector, client:load and an inline script', () => {
  const d = fixture();
  write(d, 'src/styles/new.css', '.ex-new{color:#123456}\n.other{margin:0}\n');
  write(d, 'src/pages/new.astro', '<Thing client:load />\n<script>console.log(1)</script>\n');
  const f = check(d, ['src/styles/new.css', 'src/pages/new.astro'], scan(d));
  const kinds = f.map((x) => x.kind + '@' + x.line);
  assert.ok(kinds.includes('hardcoded-colour@1'), kinds.join());
  assert.ok(kinds.includes('unprefixed-selector@2'), kinds.join());
  assert.ok(kinds.includes('client-load@1'), kinds.join());
  assert.ok(kinds.includes('inline-script@2'), kinds.join());
});

t('check is clean on a conforming file and exits 0; findings exit 1', () => {
  const d = fixture();
  write(d, 'src/styles/ok.css', '.ex-ok{color:var(--ex-color-ink)}\n');
  const ok = run(d, 'check', 'src/styles/ok.css');
  assert.strictEqual(ok.status, 0);
  assert.match(ok.stdout, /^clean/);
  write(d, 'src/styles/bad.css', '.nope{color:#fff}\n');
  const bad = run(d, 'check', 'src/styles/bad.css');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /2 findings/);
  assert.match(run(d, 'check', 'missing.css').stdout, /missing/);
});

t('scan on a non-Astro folder still answers; --json is one document', () => {
  const d = proj();
  write(d, 'a.css', '.x{}');
  const r = run(d, 'scan');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /no astro\.config/);
  assert.strictEqual(JSON.parse(run(d, 'scan', '--json').stdout).astro, false);
});

t('bad usage exits 2 with one usage line', () => {
  for (const bad of [['nope'], ['check'], ['scan', '--wat']]) {
    const r = run(proj(), ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});
