const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const F = require('../skills/addons/figma-code.cli.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'addons', 'figma-code.cli.js');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fcode space-'));
const HAVE_BROWSER = !!F.findChrome();
const live = (name, fn) => (HAVE_BROWSER ? t(name, fn) : console.log('skip ' + name + ' (no Chrome or Edge on this machine)'));

// A small frame in the shape Figma exports: a clipped canvas, a header, a row of three cards with equal gaps, real text,
// a gradient button and a vector path.
const SVG = `<svg width="480" height="320" viewBox="0 0 480 320" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<g clip-path="url(#clip0)">
<rect width="480" height="320" fill="white"/>
<rect x="24" y="24" width="432" height="56" rx="12" fill="#F3F4F6"/>
<text fill="#111827" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="20" font-weight="bold"><tspan x="44" y="59">Dashboard</tspan></text>
<circle cx="428" cy="52" r="14" fill="#2563EB"/>
<rect x="24" y="104" width="136" height="120" rx="12" fill="#FFFFFF"/>
<rect x="184" y="104" width="136" height="120" rx="12" fill="#EEF2FF"/>
<rect x="344" y="104" width="112" height="120" rx="12" fill="#DBEAFE"/>
<text fill="#1F2937" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="14"><tspan x="40" y="134">Visits</tspan></text>
<text fill="#1F2937" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="28" font-weight="bold"><tspan x="40" y="178">1,284</tspan></text>
<rect x="24" y="248" width="432" height="48" rx="24" fill="url(#paint0_linear)"/>
<text fill="white" xml:space="preserve" style="white-space: pre" font-family="Arial" font-size="16" text-anchor="middle"><tspan x="240" y="278">Upgrade plan</tspan></text>
<path d="M440 40L448 52L440 64" stroke="#6B7280" stroke-width="2" stroke-linecap="round"/>
</g>
<defs>
<linearGradient id="paint0_linear" x1="24" y1="272" x2="456" y2="272" gradientUnits="userSpaceOnUse"><stop stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/></linearGradient>
<clipPath id="clip0"><rect width="480" height="320" fill="white"/></clipPath>
</defs>
</svg>`;

// ---- pure parts: no browser needed
t('parseXml reads nested elements, attributes, entities and CDATA', () => {
  const doc = F.parseXml('<?xml version="1.0"?><!-- c --><svg a="1" b=\'x &amp; y\'><g><text>A &lt; B</text></g><style><![CDATA[.a{fill:red}]]></style><rect/></svg>');
  const svg = doc.kids[0];
  assert.strictEqual(svg.tag, 'svg');
  assert.strictEqual(svg.attrs.b, 'x & y');
  assert.strictEqual(svg.kids[0].kids[0].kids[0], 'A < B');
  assert.strictEqual(svg.kids[1].kids[0], '.a{fill:red}');
  assert.strictEqual(svg.kids[2].tag, 'rect');
});

t('PNG encode then decode round-trips, and diffImages counts and boxes the differing pixels', () => {
  const mk = (w, h, f) => { const px = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) { const [r, g, b] = f(i % w, Math.floor(i / w)); px.set([r, g, b, 255], i * 4); } return { w, h, px }; };
  const a = mk(64, 48, () => [255, 255, 255]);
  const back = F.decodePng(F.encodePng(a));
  assert.deepStrictEqual([back.w, back.h, Buffer.from(back.px).equals(Buffer.from(a.px))], [64, 48, true]);
  const b = mk(64, 48, (x, y) => (x >= 32 && x < 40 && y >= 16 && y < 24 ? [0, 0, 0] : [255, 255, 255]));
  const d = F.diffImages(a, b, 16);
  assert.strictEqual(d.differing, 64);
  assert.strictEqual(d.percent, Math.round((64 / (64 * 48)) * 10000) / 100);
  assert.strictEqual(d.boxes.length, 1);
  assert.deepStrictEqual([d.boxes[0].x, d.boxes[0].y], [32, 16]);
  assert.strictEqual(F.diffImages(a, mk(64, 48, () => [250, 250, 250]), 16).differing, 0, 'a small anti-aliasing difference is under the tolerance');
  assert.ok(F.diffImages(a, mk(32, 48, () => [255, 255, 255])).sizeMismatch);
});

t('parseSvg: boxes, real text with a baseline offset, a flat canvas clip ignored, gradient and path kept as inline SVG', () => {
  const p = F.parseSvg(SVG);
  assert.deepStrictEqual([p.width, p.height], [480, 320]);
  assert.strictEqual(p.texts, 4);
  assert.strictEqual(p.raws, 2);
  const text = p.leaves.find((l) => l.text === 'Dashboard');
  assert.strictEqual(text.css['font-size'], '20px');
  assert.strictEqual(text.y, 59 - Math.round(0.905 * 20)); // top = baseline - rounded ascent
  assert.strictEqual(text.css['line-height'], Math.round(0.905 * 20) + Math.round(0.212 * 20) + 'px');
  assert.strictEqual(p.leaves.find((l) => l.text === 'Upgrade plan').css.transform, 'translateX(-50%)');
  assert.ok(p.leaves.find((l) => l.kind === 'box' && l.css['border-radius'] === '12px'));
  assert.ok(p.leaves.find((l) => l.kind === 'box' && l.css['border-radius'] === '50%'));
  assert.ok(p.notes.some((n) => /gradient/.test(n.detail)) && p.notes.some((n) => /vector path/.test(n.detail)));
  assert.deepStrictEqual(p.families, ['Arial']);
});

t('parseSvg: strokes, filters, rotations and an outlined-text file are not guessed at', () => {
  const s = (inner) => F.parseSvg(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
  assert.strictEqual(s('<rect width="10" height="10" fill="red" stroke="blue"/>').raws, 1);
  assert.strictEqual(s('<rect width="10" height="10" fill="red" filter="url(#f)"/>').raws, 1);
  assert.strictEqual(s('<g transform="rotate(10)"><rect width="10" height="10" fill="red"/></g>').raws, 1);
  assert.strictEqual(s('<g transform="translate(5 6)"><rect width="10" height="10" fill="red"/></g>').leaves[0].x, 5);
  assert.ok(s('<path d="M0 0L10 10"/>').notes.some((n) => n.kind === 'no-text'));
  assert.throws(() => F.parseSvg('<html></html>'), /not an SVG/);
  assert.throws(() => F.parseSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), /no width and height/);
});

t('buildTree nests by containment and turns neighbouring equal-gap cards into one flex row', () => {
  const p = F.parseSvg(SVG);
  const tree = F.buildTree(p.leaves, p.width, p.height);
  const withFlex = (n) => (n.flex ? [n] : []).concat(...n.kids.map(withFlex));
  const flex = withFlex(tree);
  assert.strictEqual(flex.length, 1);
  assert.deepStrictEqual([flex[0].flex.dir, flex[0].flex.gap, flex[0].flex.members.length], ['row', 24, 3]); // the three cards share a top and one gap
});

t('buildTree does not nest a box into an earlier one when a later-painted neighbour would change the stacking', () => {
  const leaves = [
    { kind: 'box', x: 0, y: 0, w: 100, h: 100, css: {}, role: 'box' },
    { kind: 'box', x: 20, y: 20, w: 40, h: 40, css: {}, role: 'box' }, // paints above A, overlaps C
    { kind: 'box', x: 10, y: 10, w: 20, h: 20, css: {}, role: 'box' }, // inside A, and above B
  ];
  const tree = F.buildTree(leaves, 200, 200);
  assert.strictEqual(tree.kids.length, 1);
  assert.strictEqual(tree.kids[0].kids.length, 2); // both nest under A, in document order
  assert.deepStrictEqual(tree.kids[0].kids.map((k) => k.leaf.x), [20, 10]);
});

t('emit gives every node a class, keeps real text in a span, and uses a flex row with exact gap and padding', () => {
  const p = F.parseSvg(SVG);
  const built = F.emit(F.buildTree(p.leaves, p.width, p.height), p, 'card');
  assert.match(built.html, /<span class="fc-\d+">Dashboard<\/span>/);
  assert.match(built.css, /display: flex;/);
  assert.match(built.css, /gap: 24px;/);
  assert.ok(Object.values(built.classes).includes('root'));
  assert.match(built.html, /<link rel="stylesheet" href="styles.css">/);
});

t('rules: class names, short hex, px to rem and rounding change only what they say', () => {
  const f = { html: '<div class="fc-1"><span class="fc-2">x</span></div>', css: '.fc-1 {\n  color: #FFFFFF;\n  width: 100px;\n  gap: 24px;\n  font-size: 14px;\n  left: 10.4px;\n}\n.fc-2 {\n  color: #112233;\n}\n', classes: { 'fc-1': 'root', 'fc-2': 'text' } };
  const ren = F.applyRule({ id: 'a', kind: 'safe', type: 'rename-classes', scheme: 'bem' }, f, '', 'My Card');
  assert.match(ren.html, /class="my-card"/);
  assert.match(ren.html, /class="my-card__text-1"/);
  assert.deepStrictEqual(Object.values(ren.classes).sort(), ['root', 'text']);
  assert.match(F.applyRule({ id: 'a', kind: 'safe', type: 'rename-classes', scheme: 'kebab', prefix: 'x-' }, f, 'card', 'n').css, /\.x-card-text-1/);
  assert.match(F.applyRule({ id: 'h', kind: 'safe', type: 'hex-short' }, f, '', 'n').css, /color: #fff;/);
  const rem = F.applyRule({ id: 'r', kind: 'risky', type: 'px-to-rem', base: 16 }, f, '', 'n').css;
  assert.match(rem, /gap: 1\.5rem;/);
  assert.match(rem, /font-size: 0\.875rem;/);
  assert.match(rem, /width: 100px;/, 'width is not in the property list');
  assert.match(F.applyRule({ id: 'r', kind: 'risky', type: 'round-px', maxDelta: 0.5 }, f, '', 'n').css, /left: 10px;/);
  assert.throws(() => F.applyRule({ id: 'x', kind: 'safe', type: 'nope' }, f, '', 'n'), /unknown rule type/);
});

t('the shipped rules file loads, every rule is tagged safe or risky, and a bad tag is refused', () => {
  const r = F.loadRules(path.join(__dirname, '..', 'skills', 'addons', 'figma-code.standards.json'));
  assert.ok(r.rules.length >= 3 && r.rules.every((x) => x.kind === 'safe' || x.kind === 'risky'));
  const d = tmp(); fs.writeFileSync(path.join(d, 'r.json'), JSON.stringify({ version: 1, rules: [{ id: 'q', type: 'hex-short' }] }));
  assert.throws(() => F.loadRules(path.join(d, 'r.json')), /needs "kind"/);
});

t('detectFramework reads package.json and composer.json', () => {
  const d = tmp();
  assert.strictEqual(F.detectFramework(d).framework, 'plain');
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ devDependencies: { astro: '4' } }));
  assert.strictEqual(F.detectFramework(d).framework, 'astro');
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: { next: '14' } }));
  assert.strictEqual(F.detectFramework(d).framework, 'next');
  const e = tmp(); fs.writeFileSync(path.join(e, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11' } }));
  assert.strictEqual(F.detectFramework(e).framework, 'laravel');
});

t('toJsx and fromJsx round-trip the markup (classes, svg attributes, void tags, braces)', () => {
  const markup = '<div class="a"><span class="b">1 {x} &lt; 2</span><svg viewBox="0 0 1 1" xmlns:xlink="http://www.w3.org/1999/xlink"><stop stop-color="#fff"/><use xlink:href="#q"/></svg><img src="a.png"/><div class="c"></div></div>';
  const jsx = F.toJsx(markup, true);
  assert.match(jsx, /className=\{styles\['a'\]\}/);
  assert.match(jsx, /stopColor="#fff"/);
  assert.match(jsx, /xlinkHref="#q"/);
  assert.match(jsx, /<div className=\{styles\['c'\]\} \/>/);
  const back = F.fromJsx(jsx, '').html;
  assert.match(back, /class="a"/);
  assert.match(back, /stop-color="#fff"/);
  assert.match(back, /xlink:href="#q"/);
  assert.match(back, /<div class="c"><\/div>/);
  assert.match(back, /\{x\}/);
});

t('cli: unknown command, missing file and bad flag exit 2 with a usage line; detect says what it found', () => {
  assert.strictEqual(run('wat').status, 2);
  assert.strictEqual(run().status, 2);
  assert.strictEqual(run('build').status, 2);
  assert.strictEqual(run('build', path.join(tmp(), 'none.svg')).status, 2);
  assert.strictEqual(run('build', 'x.svg', '--max-diff', 'abc').status, 2);
  assert.strictEqual(run('adapt', tmp(), '--framework', 'vue').status, 2);
  const d = run('detect', '--root', tmp());
  assert.match(d.stdout, /^browser: /);
  assert.match(d.stdout, /framework: plain/);
  assert.strictEqual(JSON.parse(run('detect', '--root', tmp(), '--json').stdout).framework, 'plain');
});

// ---- with a browser: the pixel gate itself
live('build: the converted page matches the SVG, and the report says what was inlined', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'card.svg'), SVG);
  const r = run('build', path.join(d, 'card.svg'), '--out', path.join(d, 'out'), '--json');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.gate.ok, true);
  assert.ok(j.gate.diff.percent <= 1, 'diff ' + j.gate.diff.percent);
  assert.deepStrictEqual([j.leaves.texts, j.leaves.raws, j.leaves.flexRows], [4, 2, 1]);
  for (const f of ['index.html', 'styles.css', 'meta.json', 'reference.png', 'render.png', 'source.svg']) assert.ok(fs.existsSync(path.join(d, 'out', f)), f);
});

live('diff: identical pages pass, a changed color fails with the region named, --no-fail keeps the exit 0', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.svg'), '<svg width="100" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="60" fill="white"/><rect x="10" y="10" width="40" height="20" fill="#2563eb"/></svg>');
  fs.writeFileSync(path.join(d, 'b.svg'), '<svg width="100" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="60" fill="white"/><rect x="10" y="10" width="40" height="20" fill="#dc2626"/></svg>');
  const same = run('diff', path.join(d, 'a.svg'), path.join(d, 'a.svg'), '--width', '100', '--height', '60');
  assert.strictEqual(same.status, 0, same.stdout + same.stderr);
  assert.match(same.stdout, /0% of pixels differ .* PASS/);
  const bad = run('diff', path.join(d, 'a.svg'), path.join(d, 'b.svg'), '--width', '100', '--height', '60');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /FAIL/);
  assert.match(bad.stdout, /40x20 at \(\d+, \d+\)|worst regions/);
  assert.strictEqual(run('diff', path.join(d, 'a.svg'), path.join(d, 'b.svg'), '--width', '100', '--height', '60', '--no-fail').status, 0);
  assert.strictEqual(run('diff', path.join(d, 'a.svg'), path.join(d, 'b.svg')).status, 2, 'rendering needs --width and --height');
});

live('standards: safe rules apply, a risky rule that moves the diff is reverted, and --dry-run keeps nothing', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'card.svg'), SVG);
  const out = path.join(d, 'out');
  assert.strictEqual(run('build', path.join(d, 'card.svg'), '--out', out).status, 0);
  const before = fs.readFileSync(path.join(out, 'styles.css'), 'utf8');
  const dry = JSON.parse(run('standards', out, '--dry-run', '--json').stdout);
  assert.strictEqual(fs.readFileSync(path.join(out, 'styles.css'), 'utf8'), before, 'dry run leaves the files');
  assert.ok(dry.results.some((x) => x.id === 'class-names' && x.outcome === 'applied'));
  const r = JSON.parse(run('standards', out, '--json').stdout);
  assert.strictEqual(r.gate.ok, true);
  assert.ok(r.final <= r.baseline + 0.05);
  const css = fs.readFileSync(path.join(out, 'styles.css'), 'utf8');
  assert.match(css, /\.card__box-1/);
  assert.ok(!/\.fc-1 /.test(css));
  // a rule file whose risky rule always breaks the page: it must be reverted, never kept
  fs.writeFileSync(path.join(d, 'bad.json'), JSON.stringify({ version: 1, rules: [{ id: 'shift', kind: 'risky', type: 'round-px', maxDelta: 100, enabled: true }, { id: 'noop', kind: 'safe', type: 'hex-short' }] }));
  const out2 = path.join(d, 'out2'); run('build', path.join(d, 'card.svg'), '--out', out2);
  const b = JSON.parse(run('standards', out2, '--rules', path.join(d, 'bad.json'), '--json').stdout);
  assert.ok(['reverted', 'no-change'].includes(b.results.find((x) => x.id === 'shift').outcome), JSON.stringify(b.results));
  assert.strictEqual(b.gate.ok, true);
});

live('adapt: Next, Astro and Laravel components render the same as the baseline; nothing is overwritten without --force', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'card.svg'), SVG);
  const out = path.join(d, 'out');
  assert.strictEqual(run('build', path.join(d, 'card.svg'), '--out', out).status, 0);
  const cases = [
    ['next', { 'package.json': { dependencies: { next: '14' } } }, ['components/Card.jsx', 'components/Card.module.css']],
    ['astro', { 'package.json': { dependencies: { astro: '4' } } }, ['components/Card.astro']],
    ['laravel', { 'composer.json': { require: { 'laravel/framework': '11' } } }, ['resources/views/components/card.blade.php', 'public/css/figma-code/card.css']],
  ];
  for (const [fw, files, expect] of cases) {
    const root = path.join(d, 'proj-' + fw); fs.mkdirSync(root);
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(root, f), JSON.stringify(body));
    const r = run('adapt', out, '--root', root, '--json');
    assert.strictEqual(r.status, 0, fw + ': ' + r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.framework, fw);
    assert.ok(j.gate.ok && j.gate.diff.percent <= 1, fw + ' diff ' + j.gate.diff.percent);
    for (const f of expect) assert.ok(fs.existsSync(path.join(root, f)), fw + ' wrote ' + f);
    assert.strictEqual(run('adapt', out, '--root', root).status, 2, fw + ': a second run refuses to overwrite');
    assert.strictEqual(run('adapt', out, '--root', root, '--force').status, 0, fw + ': --force overwrites');
  }
  const next = fs.readFileSync(path.join(d, 'proj-next', 'components', 'Card.jsx'), 'utf8');
  assert.match(next, /className=\{styles\['fc-2'\]\}/); // the standards pass was not run here, so the class names are still the generated ones
  assert.match(next, /stopColor="#2563EB"/);
  const plain = JSON.parse(run('adapt', out, '--root', path.join(d, 'nowhere'), '--framework', 'plain', '--json').stdout);
  assert.strictEqual(plain.framework, 'plain');
  assert.deepStrictEqual(plain.files, []);
});

live('adapt --dry-run writes nothing into the project', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'card.svg'), SVG);
  const out = path.join(d, 'out'); run('build', path.join(d, 'card.svg'), '--out', out);
  const root = path.join(d, 'p'); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '14' } }));
  const j = JSON.parse(run('adapt', out, '--root', root, '--dry-run', '--json').stdout);
  assert.ok(j.files.includes('components/Card.jsx'));
  assert.deepStrictEqual(fs.readdirSync(root), ['package.json']);
});
