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

// ---- round 4: golden scan and check (found by the kit-wide probe) ----
// Regenerate on purpose with UPDATE_GOLDEN=1 node tests/astro-page.conventions.test.js, then read the diff.
const { renderScan } = require('../skills/stack/astro-page.conventions.js');
const CR7 = String.fromCharCode(13), BS7 = String.fromCharCode(92);
const gold7 = (name, text) => {
	const file = path.join(__dirname, 'fixtures', 'astro', name);
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return; }
	assert.ok(fs.existsSync(file), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs.readFileSync(file, 'utf8').split(CR7).join(''));
};
const deepDirs = (n) => Array.from({ length: n }, (_, i) => 'd' + i).join('/');

function richProject() {
	const d = proj();
	write(d, 'astro.config.ts', 'export default {}');
	write(d, 'src/styles/tokens.css', ':root{--ex-color-bg:#fff;--ex-color-ink:#000;--zz-space-1:4px;--zz-space-2:8px}');
	write(d, 'src/styles/home.css', '.ex-hero{color:var(--ex-color-ink)}.ex-card{padding:1px}.zz-b{margin:0}.plain{margin:0}');
	write(d, 'src/styles/old.min.css', '.minified{color:red}');
	write(d, 'src/pages/index.astro', '---\n---\n<Hero client:visible /><Widget client:idle /><Side client:media="(min-width:1px)" /><Map client:only="react" />\n<style>.ex-x{color:var(--ex-color-ink)}</style>');
	write(d, 'src/pages/about.md', '# about');
	write(d, 'docs/pages/a.astro', '<p>a</p>'); write(d, 'docs/pages/b.astro', '<p>b</p>');
	write(d, 'a/pages/c.mdx', '# c'); write(d, 'a/pages/d.astro', '<p>d</p>');
	write(d, 'src/components/ui/Button.astro', '<button class="ex-btn" />'); write(d, 'src/components/Card.tsx', 'export {}'); write(d, 'src/components/Box.svelte', '<div/>');
	write(d, 'src/layouts/Base.astro', '<slot /><script>document.addEventListener("astro:after-swap", () => {})</script><ClientRouter />');
	write(d, 'src/scripts/home-entry.ts', 'document.addEventListener("astro:page-load", () => {})'); write(d, 'src/scripts/vite.config.ts', 'export {}'); write(d, 'src/types.d.ts', 'export {}');
	write(d, 'public/js/main.js', 'export {}'); write(d, 'tools/build.js', 'export {}');
	write(d, 'public/img/a.png', 'x'); write(d, 'src/assets/b.svg', '<svg/>');
	write(d, deepDirs(8) + '/ok.astro', '<Hero client:visible />');
	write(d, deepDirs(9) + '/deep.astro', '<Hero client:idle /><style>p{margin:0}</style>');
	write(d, 'node_modules/x/n.astro', '<Hero client:only="react" />');
	write(d, '.hidden/h.astro', '<Hero client:only="react" />');
	return d;
}

t('golden: scan over a rich project, a bare one, and ones with a single entry or no majority prefix', () => {
	const out = {};
	const rich = richProject();
	out.rich = scan(rich); out.richText = renderScan(out.rich);
	out.bare = scan(proj()); out.bareText = renderScan(out.bare);
	const single = proj(); write(single, 'astro.config.js', ''); write(single, 'src/scripts/main.ts', 'export {}'); write(single, 'src/styles/a.css', '.aa-x{--aa-one:1}.bb-y{}.cc-z{}'); write(single, 'src/pages/p.astro', '<link rel="stylesheet" href="x.css">');
	out.single = scan(single);
	const noMain = proj(); write(noMain, 'astro.config.mjs', ''); write(noMain, 'src/styles/a.css', '.ex-a{}.ex-b{}.zz-c{}.zz-d{}'); write(noMain, 'src/styles/t.css', ':root{--ex-a:1;--ex-b:2;--zz-a:3;--zz-b:4}');
	out.exactHalf = scan(noMain);
	const third = proj(); write(third, 'src/styles/t.css', ':root{--ex-a:1;--zz-b:2;--yy-c:3}'); write(third, 'src/pages/i.astro', 'x');
	out.noMajority = scan(third);
	const cssOnly = proj(); write(cssOnly, 'src/styles/a.scss', '.ex-a{}'); write(cssOnly, 'src/styles/b.pcss', '.ex-b{}'); write(cssOnly, 'src/pages/i.astro', 'x'); write(cssOnly, 'src/components/A.vue', 'x'); write(cssOnly, 'src/components/b/B.jsx', 'x'); write(cssOnly, 'src/layouts/L.astro', 'x');
	out.cssOnly = scan(cssOnly);
	gold7('scan.json', JSON.stringify(out, null, 1) + String.fromCharCode(10));
});

t('golden: check over css and astro files, with and without conventions to apply', () => {
	const d = richProject(); const conv = scan(d);
	const files = {
		'src/styles/new.css': '.ex-ok{color:#fff;border:1px solid #abcdef}\n.bare{color:var(--ex-color-ink)}\n:root{--ex-new:#123456}\n  .zz-x{background:rgb(1,2,3)}\n.plain2 { color: HSL(1,2%,3%) }\n.ex-fine{margin:0}\n   --ex-spaced:#000;\n.oklch-user{color:oklch(0.5 0.1 100)}',
		'src/pages/new.astro': '---\n---\n<Hero client:load />\n<div style="color:#fff">x</div>\n<style>.a{color:#ff0000}.b{color:var(--ex-color-ink)}.c{color:var(--other-token)}</style>\n<script>console.log(1)</script>',
		'src/pages/plain.astro': '<p style="color:#fff">no style tag</p><div class="x">y</div>\n<Foo client:load /> <Bar client:visible />',
		'src/pages/inline.astro': '<script is:inline>1</script>', 'src/pages/srcscript.astro': '<script src="../scripts/x.ts"></script>\n<script type="module">1</script>',
		'src/pages/two.astro': '<p>a</p>\n<p>b</p>\n<script>1</script>\n<script>2</script>', 'src/pages/foreign.astro': '<style>\n.a{color:var(--zz-space-1)}\n.b{color:var(--ex-color-bg)}\n.c{margin:var(--nope)}\n.d{--local:1}\n</style>',
		'src/components/Plain.tsx': '.a{color:#fff} client:load', 'src/pages/crlf.astro': '<style>' + CR7 + String.fromCharCode(10) + '.a{color:#fff}' + CR7 + String.fromCharCode(10) + '</style>',
	};
	for (const [rel, text] of Object.entries(files)) write(d, rel, text);
	const out = { withConv: {}, withPrefix: {}, noTokens: {}, noPrefix: {} };
	const bare = scan(proj());
	for (const rel of Object.keys(files)) { out.withConv[rel] = check(d, [rel], conv); out.withPrefix[rel] = check(d, [rel], { ...conv, selectorPrefix: 'ex-' }); out.noTokens[rel] = check(d, [rel], { ...conv, tokenCount: 0 }); out.noPrefix[rel] = check(d, [rel], { ...conv, selectorPrefix: null, tokenPrefix: null, entryPattern: null }); }
	out.missing = check(d, ['src/nope.css', 'src/pages/new.astro'], conv);
	out.bareConv = check(d, ['src/pages/new.astro', 'src/styles/new.css'], bare);
	out.manyAtOnce = check(d, Object.keys(files), conv).length;
	gold7('check.json', JSON.stringify(out, null, 1) + String.fromCharCode(10));
});

t('golden: the CLI scan and check, JSON and text, exit codes and usage errors', () => {
	const d = richProject();
	write(d, 'src/pages/bad.astro', '<Hero client:load />\n<script>1</script>'); write(d, 'src/pages/good.astro', '<p>fine</p>');
	const clean = (s) => s.split(CR7).join('').split(d).join('<d>').split(d.split(BS7).join('/')).join('<d>');
	const out = {};
	const rec = (k, r) => { out[k] = { status: r.status, stdout: clean(r.stdout), stderr: clean(r.stderr) }; };
	rec('scan json', run(d, 'scan', '--json')); rec('scan text', run(d, 'scan'));
	rec('check clean json', run(d, 'check', 'src/pages/good.astro', '--json')); rec('check clean text', run(d, 'check', 'src/pages/good.astro'));
	rec('check findings json', run(d, 'check', 'src/pages/bad.astro', '--json')); rec('check findings text', run(d, 'check', 'src/pages/bad.astro'));
	rec('check several', run(d, 'check', 'src/pages/bad.astro', 'src/pages/good.astro', 'src/nope.astro'));
	rec('check no files', run(d, 'check')); rec('no command', run(d)); rec('unknown command', run(d, 'build'));
	rec('cwd elsewhere', spawnSync(process.execPath, [CLI, 'scan', '--json', '--cwd', proj()], { encoding: 'utf8' }));
	gold7('cli.json', JSON.stringify(out, null, 1) + String.fromCharCode(10));
});

// ---- round 4c: prefix and tie edges ----
t('a class or token starting with the separator has no prefix; a smaller folder never beats a bigger one; scripts outside src and public, config and typing files are not entries', () => {
	const a = proj(); write(a, 'src/styles/a.css', '.-a{}.-b{}.-c{}'); write(a, 'src/pages/x.astro', 'x');
	assert.strictEqual(scan(a).selectorPrefix, null);
	const b = proj(); for (const n of ['p1', 'p2', 'p3']) write(b, 'src/pages/' + n + '.astro', 'x'); write(b, 'a/pages/only.astro', 'x');
	assert.strictEqual(scan(b).pagesDir, 'src/pages');
	const c = proj(); write(c, 'tools/index.js', 'x'); write(c, 'src/main.d.ts', 'x'); write(c, 'src/scripts/index.config.ts', 'x');
	assert.strictEqual(scan(c).entryPattern, null);
	const e = proj(); write(e, 'src/scripts/index.ts', 'x');
	assert.strictEqual(scan(e).entryPattern, 'single index.ts');
});
