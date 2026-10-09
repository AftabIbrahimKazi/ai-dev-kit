const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkFile } = require('../skills/workflow/pre-merge-gate.edit-check.js');
const SCRIPT = path.join(__dirname, '../skills/workflow/pre-merge-gate.edit-check.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const proj = (withStandards) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-')); if (withStandards) fs.mkdirSync(path.join(d, 'coding-standards')); return d; };
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const rules = (d, f, cfg = {}) => checkFile(f, d, cfg).map((x) => `${x.rule}@${x.line}`);

t('valid js and json are clean; broken ones report syntax with a line', () => {
  const d = proj(false);
  put(d, 'ok.js', 'const a = 1;\n'); put(d, 'bad.js', 'const a = 1;\nfunction (\n'); put(d, 'ok.json', '{"a":1}'); put(d, 'bad.json', '{"a":');
  assert.deepStrictEqual(rules(d, 'ok.js'), []);
  assert.deepStrictEqual(rules(d, 'ok.json'), []);
  assert.ok(rules(d, 'bad.js')[0].startsWith('syntax@'), rules(d, 'bad.js').join());
  assert.ok(rules(d, 'bad.json')[0].startsWith('syntax@'));
});
t('standards pack is off without coding-standards/ and on with it', () => {
  const css = 'a { color: red !important; }\n';
  const off = proj(false); put(off, 'a.css', css);
  assert.deepStrictEqual(rules(off, 'a.css'), []);
  const on = proj(true); put(on, 'a.css', css);
  assert.deepStrictEqual(rules(on, 'a.css'), ['css-14@1']);
});
t('config standards on/off and ignore globs', () => {
  const d = proj(false); put(d, 'a.css', 'a { color: red !important; }\n'); put(d, 'vendor-x/b.css', 'a { color: red !important; }\n');
  assert.deepStrictEqual(rules(d, 'a.css', { standards: 'on' }), ['css-14@1']);
  const s = proj(true); put(s, 'a.css', 'a { color: red !important; }\n');
  assert.deepStrictEqual(rules(s, 'a.css', { standards: 'off' }), []);
  assert.deepStrictEqual(rules(s, 'a.css', { ignore: ['**/a.css'] }), []);
});
t('css rules: !important, numeric weights, hardcoded colours (not in token files, comments, url() or definitions)', () => {
  const d = proj(true);
  put(d, 'card.css', [
    '/* old: color: #fff !important; */',
    '.a { font-weight: bold; }',
    '.b { background: #a78bfa; }',
    '.c { color: rgba(0,0,0,.5); }',
    '.d { background: url(#frag); color: var(--c); font-weight: 600; }',
    '.e { --local: #123456; }',
    '.f { color: transparent; border-color: currentColor; }',
  ].join('\n') + '\n');
  put(d, 'tokens.css', ':root { --c: #fff; --d: rgb(1,2,3); }\n');
  assert.deepStrictEqual(rules(d, 'card.css'), ['css-04@2', 'css-10@3', 'css-10@4']);
  assert.deepStrictEqual(rules(d, 'tokens.css'), []);
});
t('html rules: img alt, inline style, presentational attrs, banned tags', () => {
  const d = proj(true);
  put(d, 'page.html', [
    '<img src="a.jpg">',            // 1: no alt
    '<img src="b.jpg" alt="">',     // 2: fine
    '<img',                          // 3: multi-line, no alt
    '  src="c.jpg">',
    '<div style="color:red" align="center">',  // 5
    '<br><strong>x</strong><small>y</small>',  // 6 (x3)
  ].join('\n') + '\n');
  const r = rules(d, 'page.html');
  assert.ok(r.includes('h-04@1') && r.includes('h-04@3') && !r.includes('h-04@2'), r.join());
  assert.ok(r.includes('h-02@5') && r.includes('h-05@5'), r.join());
  assert.strictEqual(r.filter((x) => x === 'h-10@6').length, 3);
});
t('jsx: spread props are not flagged as missing alt; email templates may use banned tags', () => {
  const d = proj(true);
  put(d, 'Img.jsx', 'export const A = (p) => <img {...p} />;\n');
  assert.deepStrictEqual(rules(d, 'Img.jsx'), []);
  put(d, 'email-welcome.html', '<br><strong>hi</strong>\n');
  assert.deepStrictEqual(rules(d, 'email-welcome.html'), []);
});
t('skips node_modules, missing files and paths outside the project', () => {
  const d = proj(true); put(d, 'node_modules/x/a.css', 'a { color: red !important; }\n');
  assert.deepStrictEqual(rules(d, 'node_modules/x/a.css'), []);
  assert.deepStrictEqual(rules(d, 'nope.css'), []);
  assert.deepStrictEqual(rules(d, path.join('..', 'elsewhere.css')), []);
});
t('eslint plumbing: findings come from the project eslint, only when configured and installed', () => {
  const d = proj(false); put(d, 'a.js', 'const a = 1;\n');
  assert.deepStrictEqual(rules(d, 'a.js'), []);
  put(d, 'eslint.config.js', 'module.exports = [];\n');
  assert.deepStrictEqual(rules(d, 'a.js'), []); // config but no binary
  put(d, 'node_modules/eslint/bin/eslint.js', 'console.log(JSON.stringify([{messages:[{line:3,ruleId:"no-undef",message:"x is not defined"}]}]))\n');
  assert.deepStrictEqual(rules(d, 'a.js'), ['eslint:no-undef@3']);
});
t('stylelint plumbing', () => {
  const d = proj(false); put(d, 'a.css', 'a{}\n'); put(d, '.stylelintrc.json', '{}');
  put(d, 'node_modules/stylelint/bin/stylelint.mjs', 'console.log(JSON.stringify([{warnings:[{line:2,rule:"color-no-invalid-hex",text:"Unexpected invalid hex (color-no-invalid-hex)"}]}]))\n');
  assert.deepStrictEqual(checkFile('a.css', d, {}).map((x) => `${x.rule}@${x.line} ${x.msg}`), ['stylelint:color-no-invalid-hex@2 Unexpected invalid hex']);
});
t('tsc is opt-in and keeps only errors of the edited file', () => {
  const d = proj(false); put(d, 'src/a.ts', 'x\n'); put(d, 'src/b.ts', 'y\n'); put(d, 'tsconfig.json', '{}');
  put(d, 'node_modules/typescript/bin/tsc', 'console.log("src/a.ts(4,2): error TS2304: Cannot find name x.");console.log("src/b.ts(1,1): error TS2304: Cannot find name y.");\n');
  assert.deepStrictEqual(rules(d, 'src/a.ts'), []); // off by default
  assert.deepStrictEqual(rules(d, 'src/a.ts', { tsc: true }), ['TS2304@4']);
});
t('a syntax error short-circuits the linters', () => {
  const d = proj(false); put(d, 'a.js', 'function (\n'); put(d, 'eslint.config.js', '');
  put(d, 'node_modules/eslint/bin/eslint.js', 'console.log(JSON.stringify([{messages:[{line:1,ruleId:"r",message:"m"}]}]))\n');
  assert.ok(rules(d, 'a.js').every((x) => x.startsWith('syntax')));
});
t('php -l catches a parse error when php is installed', () => {
  if (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['php']).status !== 0) return console.log('     (php not installed: skipped)');
  const d = proj(false); put(d, 'a.php', '<?php\n$a = ;\n'); put(d, 'ok.php', '<?php\n$a = 1;\n');
  assert.ok(rules(d, 'a.php')[0].startsWith('syntax@'), rules(d, 'a.php').join());
  assert.deepStrictEqual(rules(d, 'ok.php'), []);
});
t('cli: silent and exit 0 when clean; lines, cap and exit 1 on findings; --json', () => {
  const d = proj(true); put(d, 'ok.css', '.a { color: var(--c); }\n');
  const clean = spawnSync('node', [SCRIPT, 'ok.css', '--cwd', d], { encoding: 'utf8' });
  assert.strictEqual(clean.status, 0); assert.strictEqual(clean.stdout, '');
  put(d, 'bad.css', Array.from({ length: 20 }, () => '.a { color: red !important; }').join('\n') + '\n');
  const bad = spawnSync('node', [SCRIPT, 'bad.css', '--cwd', d], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  const lines = bad.stdout.trim().split('\n');
  assert.strictEqual(lines.length, 16);
  assert.strictEqual(lines[0], 'bad.css:1  css-14  !important is banned');
  assert.strictEqual(lines[15], '(+5 more)');
  const j = JSON.parse(spawnSync('node', [SCRIPT, 'bad.css', '--cwd', d, '--json'], { encoding: 'utf8' }).stdout);
  assert.strictEqual(j.length, 20);
});
t('styleBlocks: forbid makes the per-edit check flag them', () => {
  const d = proj(true); put(d, 'c.astro', '<style>.a{}</style>\n');
  assert.deepStrictEqual(rules(d, 'c.astro'), []);
  assert.deepStrictEqual(rules(d, 'c.astro', { styleBlocks: 'forbid' }), ['css-style-block@1']);
});
