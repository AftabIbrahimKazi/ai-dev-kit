const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkText, RULES } = require('../skills/standards/code-audit.audit.js');
const SCRIPT = path.join(__dirname, '../skills/standards/code-audit.audit.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const hits = (rel, text, cfg, profile) => checkText(rel, text, cfg, profile).map((x) => `${x.rule}@${x.line}`);
const lines = (...l) => l.join('\n') + '\n';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ca-'));
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const cli = (d, ...args) => spawnSync('node', [SCRIPT, ...args, '--cwd', d, '--no-git'], { encoding: 'utf8' });

t('every finding rule id exists in the rule table', () => {
  const sample = checkText('a.css', 'a{color:#fff!important;line-height:2;transition:all 1s}#x{outline:none}@media (min-width:1px){}');
  for (const f of sample) assert.ok(RULES[f.rule], f.rule);
});

t('css-05 line-height: only var(--leading-*) outside token files', () => {
  assert.deepStrictEqual(hits('a.css', lines('.a { line-height: 1.2; }', '.b { line-height: var(--leading-body); }', '.c { line-height: inherit; }', '.d { --x-line-height: 3; }', '/* line-height: 9 */')), ['css-05@1']);
  assert.deepStrictEqual(hits('tokens.css', '.a { line-height: 1.2; }\n'), []);
});
t('css-06 transition: no all, no single variable; named properties pass', () => {
  assert.deepStrictEqual(hits('a.css', lines('.a { transition: all 0.3s; }', '.b { transition: var(--transition-color); }', '.c { transition: color var(--duration-fast) ease; }', '.d { transition: none; }', '.e { transition-property: all; }')), ['css-06@1', 'css-06@2', 'css-06@5']);
});
t('css-17 media: min-width alone is flagged, ranges, max-only, the 1400px zone and non-width queries are not', () => {
  const css = lines(
    '@media (min-width: 768px) { .a { color: var(--c); } }',
    '@media (min-width: 768px) and (max-width: 991.98px) { .a { color: var(--c); } }',
    '@media (max-width: 575.98px) { .a { color: var(--c); } }',
    '@media (min-width: 1400px) { .a { color: var(--c); } }',
    '@media (prefers-reduced-motion: reduce) { .a { color: var(--c); } }',
    '@media screen and (min-width: 600px), print { .a { color: var(--c); } }',
    '@media (width >= 900px) { .a { color: var(--c); } }',
  );
  assert.deepStrictEqual(hits('a.css', css), ['css-17@1', 'css-17@6', 'css-17@7']);
});
t('h-03 id selectors: flagged in selectors, not in hex colours, strings, urls, at-rules or comments', () => {
  const css = lines('#hero { margin: 0; }', '.a #b > .c { margin: 0; }', '.d { background: url(#frag); color: var(--c); }', '/* #old { } */', '.e::after { content: "#x"; }', '@import url("a.css#x");', '.f:is(#g, .h) { margin: 0; }', '.g { margin: 0; }');
  assert.deepStrictEqual(hits('a.css', css), ['h-03@1', 'h-03@2', 'h-03@7']);
});
t('a11y-06 outline: review unless it is the :focus:not(:focus-visible) idiom', () => {
  assert.deepStrictEqual(hits('a.css', lines('*:focus { outline: none; }', 'a:focus:not(:focus-visible) { outline: 0; }', 'a:focus-visible { outline: 2px solid var(--c); }')), ['a11y-06@1']);
});

t('markup: perf-02 needs both width and height; a11y-05 needs role or tabindex; spread props are skipped', () => {
  const html = lines('<img src="a.jpg" alt="" width="1" height="1">', '<img src="b.jpg" alt="">', '<img src="c.jpg" alt="" width="1">', '<img {...p} />', '<div onclick="go()">x</div>', '<div onclick="go()" role="button" tabindex="0">x</div>', '<!-- <img src="x.jpg"> -->');
  assert.deepStrictEqual(hits('a.astro', html), ['perf-02@2', 'perf-02@3', 'a11y-05@5']);
  assert.deepStrictEqual(hits('email-welcome.html', '<img src="a.jpg" alt="">\n'), []);
});
t('page rules apply only to complete documents', () => {
  const partial = lines('<section><h3>x</h3><h1>a</h1><h1>b</h1></section>');
  assert.deepStrictEqual(hits('card.astro', partial), []);
  const page = lines('<!doctype html>', '<html lang="en">', '<head>', '<script src="a.js"></script>', '<script src="b.js" defer></script>', '<script type="module" src="c.js"></script>', '</head>', '<body>', '<h1>a</h1>', '<h3>b</h3>', '<h1>c</h1>', '</body>', '</html>');
  assert.deepStrictEqual(hits('index.html', page).sort(), ['a11y-03@1', 'h-08@10', 'perf-06@4', 'seo-01@1', 'seo-02@1', 'seo-03@11', 'seo-06@1', 'seo-07@1'].sort());
});
t('a complete page with everything present has no page findings', () => {
  const page = lines('<!doctype html>', '<html lang="en"><head>', '<title>T</title>', '<meta name="description" content="d">', '<link rel="canonical" href="/">', '<meta property="og:title" content="T">', '<script>var h1 = "<h1>";</script>', '</head><body><main><h1>a</h1><h2>b</h2></main></body></html>');
  assert.deepStrictEqual(hits('index.html', page), []);
});
t('css-style-block is counted, not for jsx, comments or emails', () => {
  assert.deepStrictEqual(hits('a.astro', lines('<style>.a{}</style>', '<!-- <style> -->', '<style is:global>.b{}</style>')), ['css-style-block@1', 'css-style-block@3']);
  assert.deepStrictEqual(hits('A.jsx', '<style>{`a{}`}</style>\n'), []);
});

t('js rules: console, var, ==, with comments, strings and look-alikes ignored', () => {
  const js = lines('console.log(1);', 'console.error("x");', 'console.info(1);', '// console.log(2)', 'const s = "console.log(3) == 4 var x";', 'var a = 1;', 'if (a == 2 || a != 3) {}', 'if (a === 2 && a !== 3) {}', 'const f = (x) => x >= 1 && x <= 2;', 'obj.var = 1;', 'x.console.log(1);');
  assert.deepStrictEqual(hits('a.js', js), ['js-03@1', 'js-03@2', 'js-09@6', 'js-10@7', 'js-10@7', 'js-03@11'].sort((a, b) => Number(a.split('@')[1]) - Number(b.split('@')[1])));
});
t('ts ids replace js ids for ts files', () => {
  const r = hits('a.ts', lines('console.log(1);', 'var a = 1;', 'if (a == 2) {}'));
  assert.deepStrictEqual(r, ['ts-04@1', 'ts-10@2', 'ts-11@3']);
});
t('ts-01 any: explicit any flagged, words and strings are not', () => {
  assert.deepStrictEqual(hits('a.ts', lines('let a: any;', 'const b = c as any;', 'const d: Array<any> = [];', 'const company = "any";', 'const many = 1; // any', 'function f(x: unknown) {}')), ['ts-01@1', 'ts-01@2', 'ts-15@2', 'ts-01@3']);
});
t('ts-12 interface over type: object shapes only, unions, intersections and mapped types are fine', () => {
  const ts = lines('type A = { a: string };', 'export type B = { a: 1 } | { b: 2 };', 'type C = { a: 1 } & D;', 'type E = { [K in keyof T]: T[K] };', "type F = 'a' | 'b';", 'interface G { a: string }', 'export type H<T> = {', '  a: T;', '};');
  assert.deepStrictEqual(hits('a.ts', ts), ['ts-12@1', 'ts-12@7']);
});
t('ts-13 enum names', () => {
  assert.deepStrictEqual(hits('a.ts', lines('enum direction { A }', 'enum Direction { A = "A" }', 'const enum size { S }')), ['ts-13@1', 'ts-13@3']);
});
t('ts-15 assertions: review unless commented; import/export aliases and as const are fine', () => {
  const ts = lines('const a = b as HTMLElement;', 'const c = d as HTMLElement; // present in layout', "import { x as y } from './z';", 'export { y as z };', 'const e = [1] as const;', 'const s = "x as Foo";');
  assert.deepStrictEqual(hits('a.ts', ts), ['ts-15@1']);
});
t('state attributes: removeAttribute(data-*) and empty setAttribute are rules, classList is a review', () => {
  const js = lines("el.removeAttribute('data-open');", "el.setAttribute('data-open', '');", "el.setAttribute('data-open', 'true');", "el.removeAttribute('href');", "el.classList.add('is-open');");
  assert.deepStrictEqual(hits('a.js', js), ['js-11@1', 'js-11@2', 'js-11-class@5']);
});
t('listeners: one review when the file never cleans up', () => {
  assert.deepStrictEqual(hits('a.js', lines('a.addEventListener("x", f);', 'b.addEventListener("y", g);')), ['js-04@1']);
  assert.deepStrictEqual(hits('a.js', lines('a.addEventListener("x", f);', 'a.removeEventListener("x", f);')), []);
  assert.deepStrictEqual(hits('a.js', lines('a.addEventListener("x", f, { signal });')), []);
});
t('commented-out code: code-shaped comments only', () => {
  const js = lines('// const a = 1;', '// foo(bar);', '// this function returns a value (sometimes).', '// TODO: fix', '// eslint-disable-next-line no-console', '// if (a) {', '// x = y;', '// see section (2)');
  assert.deepStrictEqual(hits('a.js', js), ['js-08@1', 'js-08@2', 'js-08@6', 'js-08@7']);
});

t('edit profile keeps exactly the original per-edit rules; style blocks only when forbidden', () => {
  const css = lines('.a { color: red !important; font-weight: bold; line-height: 1.2; transition: all 1s; }');
  assert.deepStrictEqual(new Set(hits('a.css', css, {}, 'edit')), new Set(['css-14@1', 'css-04@1']));
  assert.deepStrictEqual(hits('a.astro', '<style>.a{}</style>\n', {}, 'edit'), []);
  assert.deepStrictEqual(hits('a.astro', '<style>.a{}</style>\n', { styleBlocks: 'forbid' }, 'edit'), ['css-style-block@1']);
  assert.deepStrictEqual(hits('a.js', 'console.log(1);\n', {}, 'edit'), []);
});
t('skipRules removes a rule everywhere', () => {
  assert.deepStrictEqual(hits('a.js', 'console.log(1); var a = 1;\n', { skipRules: ['js-03'] }), ['js-09@1']);
});

// ---- CLI and repo-level packs ----
t('cli: generated and minified files are skipped and counted', () => {
  const d = tmp();
  put(d, 'a.js', 'console.log(1);\n'); put(d, 'dist-lib/x.min.js', 'console.log(1);\n'); put(d, 'gen.js', '// @generated by tool\nconsole.log(1);\n'); put(d, 'strata.output.css', 'a{color:red!important}\n');
  const r = cli(d);
  assert.match(r.stdout, /^audit: 1 files scanned \(3 generated\/minified skipped\), 1 findings in 1 files/);
});
t('cli: vendor hint when one directory holds most findings', () => {
  const d = tmp();
  for (let i = 0; i < 30; i++) put(d, `third/lib/f${i}.js`, 'console.log(1);\nconsole.log(2);\n');
  put(d, 'src/a.js', 'console.log(1);\n');
  const r = cli(d);
  assert.match(r.stdout, /hint: 9\d% of findings are under third\/lib\/\. If that is third-party or generated, rerun with --ignore 'third\/lib\/\*\*'/);
  assert.doesNotMatch(cli(d, '--ignore', 'third/**').stdout, /hint:/);
  assert.match(cli(d, '--ignore', 'third/**').stdout, /^audit: 1 files scanned/);
});
t('cli: --rule lists file:line, --context adds the source, --standard filters, --list shows coverage', () => {
  const d = tmp(); put(d, 'a.js', 'var x = 1;\nconsole.log(x);\n');
  const r = cli(d, '--rule', 'js-09', '--context').stdout.trim().split('\n');
  assert.strictEqual(r[1], 'js-09 [rule]: 1 occurrences in 1 files (var is not permitted)');
  assert.strictEqual(r[2], 'a.js:1  var x = 1;');
  assert.doesNotMatch(cli(d, '--standard', 'css').stdout, /js-0/);
  assert.match(cli(d, '--list').stdout, /Not machine-checked/);
  assert.strictEqual(cli(d, '--rule', 'nope').status, 2);
});
t('cli: baseline keeps working across rule kinds', () => {
  const d = tmp(); put(d, 'a.js', 'var x = 1;\n');
  assert.match(cli(d, '--baseline').stdout, /baseline saved to \.claude\/code-audit\.baseline\.json/);
  assert.strictEqual(cli(d).status, 0);
  put(d, 'a.js', 'var x = 1;\nvar y = 2;\n');
  const up = cli(d);
  assert.strictEqual(up.status, 1);
  assert.match(up.stdout, /regressed since baseline \(1\):\n  js-09 a\.js 1 -> 2/);
});

const git = (d, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: d, encoding: 'utf8' });
t('git pack: commit messages and branch names', () => {
  const d = tmp(); git(d, 'init', '-q', '-b', 'main'); put(d, 'a.txt', '1');
  git(d, 'add', '.');
  const commit = (m) => { put(d, 'a.txt', String(Math.random())); git(d, 'add', '.'); git(d, 'commit', '-q', '-m', m); };
  commit('feat: add dark mode toggle');
  commit('Added the thing.');
  commit('fix: ' + 'x'.repeat(60));
  commit('fix: updated the modal');
  commit('chore: tidy config.');
  commit('refactor: ' + 'y'.repeat(45)); // summary 45 but header 55: over the limit
  commit('fix: ' + 'z'.repeat(45)); // header exactly 50: fine
  git(d, 'branch', 'feature/ok'); git(d, 'branch', 'wip-stuff');
  for (const b of ['beta', 'test', 'dev']) git(d, 'branch', b); // the standard's own permanent branches
  const out = spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' });
  const f = JSON.parse(out.stdout).findings.filter((x) => x.line === 0);
  const by = (r) => f.filter((x) => x.rule === r);
  assert.strictEqual(by('g-06').length, 1);
  assert.deepStrictEqual(by('g-08').map((x) => x.msg).sort(), ['header is 55 characters (limit 50)', 'header is 65 characters (limit 50)', 'summary ends with a period', 'summary not imperative present tense']);
  assert.deepStrictEqual(by('g-05').map((x) => x.file), ['branch:wip-stuff']);
  assert.ok(by('g-06')[0].detail === 'Added the thing.');
});
t('version pack: pre-release notation, changelog entry, tag mismatch', () => {
  const d = tmp(); git(d, 'init', '-q', '-b', 'main');
  put(d, 'package.json', JSON.stringify({ version: '1.3.0-wip' })); put(d, 'CHANGELOG.md', '## [1.2.0] — 2026-01-01\n');
  git(d, 'add', '.'); git(d, 'commit', '-q', '-m', 'chore: init'); git(d, 'tag', 'v1.2.0');
  const f = JSON.parse(spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' }).stdout).findings;
  assert.deepStrictEqual(f.filter((x) => x.file === 'package.json').map((x) => x.rule).sort(), ['v-05', 'v-08', 'v-09']);
  put(d, 'package.json', JSON.stringify({ version: '1.2.0' }));
  assert.deepStrictEqual(JSON.parse(spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' }).stdout).findings.filter((x) => x.file === 'package.json'), []);
  put(d, 'package.json', JSON.stringify({ version: '1.3.0-rc.1' }));
  assert.deepStrictEqual(JSON.parse(spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' }).stdout).findings.filter((x) => x.file === 'package.json').map((x) => x.rule).sort(), ['v-05', 'v-08']);
  put(d, 'package.json', JSON.stringify({ private: true, version: '0.1.0-wip' })); // an app that is never published
  assert.deepStrictEqual(JSON.parse(spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' }).stdout).findings.filter((x) => x.file === 'package.json'), []);
});
t('JSX prose is not code for any script rule; code in {expressions} and outside elements still is', () => {
  const tsx = lines(
    'export function B() {',
    "  const [a] = useState<string>('');",
    "  if (a == 'x') console.log(a);",
    "  return <div title={a}>{a == 'y' ? 'k' : 'n'} Note: any change == fine, var x.<b>as Foo</b></div>;",
    '}',
    'const z = q as HTMLElement;',
  );
  assert.deepStrictEqual(hits('B.tsx', tsx), ['ts-04@3', 'ts-11@3', 'ts-11@4', 'ts-15@6']);
  const jsx = lines('const L = () => <ul>{items.map((i) => <li key={i}>{i == 1 ? 1 : 2} var y</li>)}</ul>;', 'var after = 1;');
  assert.deepStrictEqual(hits('C.jsx', jsx), ['js-10@1', 'js-09@2']);
});
t('SCSS, Sass and Less line comments are not code; url(http://...) is untouched', () => {
  const scss = lines('.a { margin: 0; } // old: color: #fff !important;', '// .b { font-weight: bold; }', '.c { background: url(http://x.dev/a.png); }', '.d { color: red !important; }');
  assert.deepStrictEqual(hits('a.scss', scss), ['css-14@4']); // named colours (red) are not detected by css-10
  assert.deepStrictEqual(hits('a.css', '.a { margin: 0; } // in plain CSS this is not a comment: color: #fff;\n'), ['css-10@1']);
});
t('Liquid templates are audited; Liquid comments are skipped; {% style %} blocks are counted', () => {
  const liquid = lines('{% comment %}<div style="x"></div>{% endcomment %}', '<div style="{{ a }}"></div>', '{% style %}.a{}{% endstyle %}', '{%- # <br> in an inline comment -%}', '<img src="{{ i }}">');
  assert.deepStrictEqual(hits('s.liquid', liquid), ['h-02@2', 'css-style-block@3', 'h-04@5', 'perf-02@5']);
});

// ---- false-positive classes found by running on real projects ----
t('ts-15: prose between JSX tags is not an assertion; real assertions in the same tsx file still are', () => {
  const tsx = lines('export const A = () => (', '  <p>', '    Built with Next.js, as Client Components render on the page.', '  </p>', ');', 'const e = x as HTMLElement;');
  assert.deepStrictEqual(hits('A.tsx', tsx), ['ts-15@6']);
  assert.deepStrictEqual(hits('a.ts', 'const a = b as unknown as Foo;\n'), ['ts-15@1']);
  assert.deepStrictEqual(hits('a.ts', 'const a = x as typeof y;\n'), []); // lower-case operand: not a type name we can be sure of
});
t('h-02: style props in react-pdf and react-native files are the styling API, not inline styles', () => {
  assert.deepStrictEqual(hits('pdf.tsx', "import { View } from '@react-pdf/renderer';\nexport const A = () => <View style={{ a: 1 }} />;\n"), []);
  assert.deepStrictEqual(hits('web.tsx', 'export const A = () => <div style={{ a: 1 }} />;\n'), ['h-02@1']);
});
t('cli: dot-directories and single-line bundles are skipped', () => {
  const d = tmp();
  put(d, '.claude/skills/x/validate.mjs', 'var a = 1;\n'); put(d, 'src/a.js', 'var a = 1;\n');
  put(d, 'src/bundle-x.js', 'var a=1;'.repeat(400) + '\n');
  const r = cli(d);
  assert.match(r.stdout, /^audit: 1 files scanned \(1 generated\/minified skipped\), 1 findings in 1 files/);
});
t('vendor hint names only vendor-looking directories, never the project source', () => {
  const d = tmp();
  for (let i = 0; i < 60; i++) put(d, `src/f${i}.js`, 'console.log(1);\n');
  assert.doesNotMatch(cli(d).stdout, /hint:/);
});

// ---- edit-check parity: the engine's "edit" profile and edit-check's frozen fallback must agree ----
t('edit-check fallback pack and the engine edit profile report the same findings', () => {
  const { standards } = require('../skills/workflow/pre-merge-gate.edit-check.js');
  const fixtures = {
    'a.css': lines('/* old: color: #fff !important; */', '.a { font-weight: bold; }', '.b { background: #a78bfa; }', '.c { color: rgba(0,0,0,.5); }', '.d { background: url(#frag); color: var(--c); font-weight: 600; }', '.e { --local: #123456; }', '.f { color: red !important; }'),
    'tokens.css': ':root { --c: #fff; --d: rgb(1,2,3); }\n',
    'p.html': lines('<img src="a.jpg">', '<img src="b.jpg" alt="">', '<img', '  src="c.jpg">', '<div style="color:red" align="center">', '<br><strong>x</strong><small>y</small>'),
    'Img.jsx': 'export const A = (p) => <img {...p} />;\n',
    'email-welcome.html': '<br><strong>hi</strong>\n',
    'c.astro': lines('<p style="x:1">a</p>', '<style>.a{}</style>'),
    'b.scss': lines('.a { margin: 0; } // old: color: #fff !important;', '.b { background: url(http://x.dev/a.png); font-weight: bold; }'),
  };
  for (const [rel, text] of Object.entries(fixtures)) {
    const a = standards(rel, text).map((x) => `${x.rule}@${x.line}`).sort();
    const b = hits(rel, text, {}, 'edit').sort();
    assert.deepStrictEqual(b, a, rel);
  }
});

t('css-05 accepts a project-prefixed leading token (--lp-leading-body) but not a hardcoded value', () => {
  assert.deepStrictEqual(hits('a.css', lines('.a { line-height: var(--lp-leading-body); }', '.b { line-height: var(--leading-tight); }', '.c { line-height: var(--lp-size-md); }', '.d { line-height: 1.4; }')), ['css-05@3', 'css-05@4']);
});
t('a layout with a <slot> keeps its head checks but is not judged on main, h1 or heading order', () => {
  const layout = lines('<!doctype html>', '<html lang="en"><head><title>T</title></head>', '<body><main><slot /></main></body></html>');
  assert.deepStrictEqual(hits('Layout.astro', layout).sort(), ['seo-02@1', 'seo-06@1', 'seo-07@1']);
});
