// dupe.js: block extraction (marker and line range), literal slots, placement, re-run safety, dry run, CLI exit codes.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extractBlock, applySlots, place, run, parseArgs } = require('../skills/workflow/plan-first.dupe.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dupe-'));
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const get = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');

const HERO = '  <!-- dupe:hero -->\n  <section class="hero">\n    <h1>Welcome</h1>\n    <img src="img/a.jpg" alt="A">\n  </section>\n  <!-- /dupe:hero -->';
const SRC = '<html><body><main>\n' + HERO + '\n</main></body></html>\n';
const PAGE = '<html><body><main>\n<p>page</p>\n</main></body></html>\n';

t('extractBlock: marker block, line range, missing marker and bad range', () => {
  assert.ok(extractBlock(SRC, 'hero').block.includes('<h1>Welcome</h1>'));
  assert.strictEqual(extractBlock('a\nb\nc\nd\n', undefined, '2-3').block, 'b\nc');
  assert.throws(() => extractBlock(SRC, 'nope'), /no block named "nope"/);
  assert.throws(() => extractBlock('a\nb\n', undefined, '1-9'), /outside the file/);
  assert.throws(() => extractBlock('a', undefined, undefined), /--block/);
});

t('applySlots: literal, every occurrence, regex characters are not patterns', () => {
  const r = applySlots('a.b a.b a-b', { 'a.b': 'X' });
  assert.deepStrictEqual(r, { text: 'X X a-b', count: 2 });
});

t('place: before </main> by default, keeps the surrounding text', () => {
  const r = place(PAGE, HERO, 'hero', {});
  assert.strictEqual(r.action, 'inserted');
  assert.ok(r.text.indexOf('<p>page</p>') < r.text.indexOf('hero') && r.text.indexOf('hero') < r.text.indexOf('</main>'));
});

t('place: a dupe-here marker wins; --after and --before anchors work', () => {
  assert.ok(place('<div>\n<!-- dupe-here:hero -->\n</div>', HERO, 'hero', {}).text.includes('<h1>Welcome</h1>'));
  const after = place('<nav></nav><main></main>', 'BLOCK', undefined, { after: '</nav>' }).text;
  assert.ok(after.startsWith('<nav></nav>') && after.indexOf('BLOCK') > after.indexOf('</nav>'));
  assert.throws(() => place('no anchors', 'B', 'x', {}), /no place to insert/);
});

t('run: copies the block to 3 pages with per-page slots; the source is untouched', () => {
  const d = tmp();
  put(d, 'src.html', SRC);
  for (const p of ['a.html', 'b.html', 'c.html']) put(d, p, PAGE);
  put(d, 'slots.json', JSON.stringify({ 'a.html': { Welcome: 'Hola', 'img/a.jpg': 'img/es.jpg' }, '*': { Welcome: 'Hi' }, 'b.html': { Welcome: 'Bonjour' } }));
  const res = run({ from: 'src.html', block: 'hero', to: ['a.html', 'b.html', 'c.html'], slots: 'slots.json', dryRun: false, json: false }, d);
  assert.deepStrictEqual(res.map((r) => r.action), ['inserted', 'inserted', 'inserted']);
  assert.ok(get(d, 'a.html').includes('<h1>Hola</h1>') && get(d, 'a.html').includes('img/es.jpg'));
  assert.ok(get(d, 'b.html').includes('<h1>Bonjour</h1>'));
  assert.ok(get(d, 'c.html').includes('<h1>Hi</h1>'));
  assert.strictEqual(get(d, 'src.html'), SRC);
});

t('run: running again replaces the earlier copy instead of stacking a second one', () => {
  const d = tmp();
  put(d, 'src.html', SRC); put(d, 'a.html', PAGE);
  put(d, 's.json', JSON.stringify({ 'a.html': { Welcome: 'Hola' } }));
  const a = { from: 'src.html', block: 'hero', to: ['a.html'], slots: 's.json', dryRun: false, json: false };
  run(a, d);
  const once = get(d, 'a.html');
  assert.strictEqual(run(a, d)[0].action, 'unchanged');
  put(d, 's.json', JSON.stringify({ 'a.html': { Welcome: 'Ciao' } }));
  assert.strictEqual(run(a, d)[0].action, 'replaced');
  assert.strictEqual((get(d, 'a.html').match(/<!-- dupe:hero -->/g) || []).length, 1);
  assert.ok(get(d, 'a.html').includes('Ciao') && once.includes('Hola'));
});

t('run: --dry-run writes nothing; an unused slot key is reported; a missing target throws', () => {
  const d = tmp();
  put(d, 'src.html', SRC); put(d, 'a.html', PAGE); put(d, 's.json', JSON.stringify({ 'a.html': { Nothing: 'x' } }));
  const r = run({ from: 'src.html', block: 'hero', to: ['a.html'], slots: 's.json', dryRun: true, json: false }, d);
  assert.strictEqual(get(d, 'a.html'), PAGE);
  assert.ok(/slot key not found/.test(r[0].note));
  assert.throws(() => run({ from: 'src.html', block: 'hero', to: ['zz.html'], dryRun: false, json: false }, d), /does not exist/);
});

t('run: keeps CRLF files CRLF', () => {
  const d = tmp();
  put(d, 'src.html', SRC); put(d, 'a.html', PAGE.replace(/\n/g, '\r\n'));
  run({ from: 'src.html', block: 'hero', to: ['a.html'], dryRun: false, json: false }, d);
  assert.ok(!/[^\r]\n/.test(get(d, 'a.html')));
});

t('parseArgs and the CLI: bad usage exits 2, an error exits 1, success exits 0', () => {
  assert.strictEqual(parseArgs(['--from', 'a']), null);
  const d = tmp();
  put(d, 'src.html', SRC); put(d, 'a.html', PAGE);
  const bin = path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.dupe.js');
  const cli = (...a) => spawnSync(process.execPath, [bin, ...a], { cwd: d, encoding: 'utf8' });
  assert.strictEqual(cli('--bogus').status, 2);
  assert.strictEqual(cli('--from', 'nope.html', '--block', 'hero', '--to', 'a.html').status, 1);
  const ok = cli('--from', 'src.html', '--block', 'hero', '--to', 'a.html', '--json');
  assert.strictEqual(ok.status, 0);
  assert.strictEqual(JSON.parse(ok.stdout).results[0].action, 'inserted');
});


t('extractBlock: wrapped flag, and line ranges are checked at both ends', () => {
  assert.strictEqual(extractBlock(SRC, 'hero').wrapped, true);
  assert.strictEqual(extractBlock('a\nb', undefined, '1-2').wrapped, false);
  assert.strictEqual(extractBlock('a\nb', undefined, '2-2').block, 'b');
  assert.throws(() => extractBlock('a\nb', undefined, '0-1'), /outside the file/);
  assert.throws(() => extractBlock('a\nb', undefined, '2-1'), /outside the file/);
  assert.throws(() => extractBlock('a\nb', undefined, '1-3'), /outside the file/);
});

t('place: --after goes behind the anchor, --before in front, a start-of-file anchor adds no blank line', () => {
  assert.strictEqual(place('<main></main>', 'B', undefined, { after: '<main>' }).text, '<main>\nB\n</main>');
  assert.strictEqual(place('<main></main>', 'B', undefined, { before: '<main>' }).text, 'B\n<main></main>');
  assert.strictEqual(place('x\n<main></main>', 'B', undefined, { before: '<main>' }).text, 'x\nB\n<main></main>');
});

t('parseArgs: defaults, switches, and the three required options', () => {
  assert.deepStrictEqual(parseArgs(['--from', 'a', '--block', 'b', '--to', 'c']), { to: ['c'], dryRun: false, json: false, from: 'a', block: 'b' });
  const on = parseArgs(['--from', 'a', '--lines', '1-2', '--to', 'c,d', '--dry-run', '--json']);
  assert.strictEqual(on.dryRun, true); assert.strictEqual(on.json, true); assert.deepStrictEqual(on.to, ['c', 'd']);
  assert.strictEqual(parseArgs(['--block', 'b', '--to', 'c']), null);
  assert.strictEqual(parseArgs(['--from', 'a', '--to', 'c']), null);
  assert.strictEqual(parseArgs(['--from', 'a', '--block', 'b']), null);
  assert.strictEqual(parseArgs(['--bogus']), null);
});

t('cli: a missing source file prints "error: ..." and exits 1; bad usage exits 2', () => {
  const d = tmp();
  const SCRIPT = path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.dupe.js');
  const bad = spawnSync(process.execPath, [SCRIPT, '--from', 'nope.html', '--block', 'x', '--to', 'y.html'], { cwd: d, encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.ok(bad.stderr.startsWith('error: source file nope.html does not exist'), bad.stderr);
  assert.strictEqual(spawnSync(process.execPath, [SCRIPT], { cwd: d, encoding: 'utf8' }).status, 2);
});

t('run: slots merge the "*" set with the set for the exact path or, failing that, the file name', () => {
  const d = tmp();
  put(d, 'src.html', '<html><body><main>\n<!-- dupe:b -->A-{{x}}-{{y}}<!-- /dupe:b -->\n</main></body></html>\n');
  put(d, 'sub/page.html', PAGE); put(d, 'other/page2.html', PAGE);
  put(d, 'slots.json', JSON.stringify({ '*': { '{{x}}': 'star' }, 'sub/page.html': { '{{y}}': 'exact' }, 'page2.html': { '{{y}}': 'byname' } }));
  const res = run({ from: 'src.html', block: 'b', to: ['sub/page.html', 'other/page2.html'], slots: 'slots.json' }, d);
  assert.deepStrictEqual(res.map((r) => r.replaced), [2, 2]);
  assert.ok(get(d, 'sub/page.html').includes('A-star-exact'), get(d, 'sub/page.html'));
  assert.ok(get(d, 'other/page2.html').includes('A-star-byname'), get(d, 'other/page2.html'));
});

if (failed) { console.log('plan-first.dupe.test: FAILED'); process.exit(1); }
console.log('plan-first.dupe.test: ok');
