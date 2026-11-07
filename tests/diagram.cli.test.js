const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/diagram.cli.js');
const D = require(SCRIPT);

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a], { cwd, encoding: 'utf8' });
const proj = (files = {}) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dg test-'));
	for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); }
	return d;
};
const spec = (extra = {}) => ({
	title: 'T', description: 'D',
	nodes: [{ id: 'u', label: 'User', role: 'user' }, { id: 'a', label: 'App', role: 'app' }, { id: 'd', label: 'DB', role: 'db' }, { id: 'c', label: 'CI', role: 'ci' }],
	groups: [], edges: [{ from: 'u', to: 'a', label: 'HTTPS' }, { from: 'a', to: 'd', label: 'SQL' }, { from: 'c', to: 'a', label: 'deploy', kind: 'deploy' }],
	...extra,
});

t('validateSpec accepts a good spec and names each problem in a bad one', () => {
	assert.deepStrictEqual(D.validateSpec(spec()), []);
	const bad = D.validateSpec(spec({ title: '', description: '', edges: [{ from: 'u', to: 'x' }, { from: 'a', to: 'a' }], groups: [{ id: 'g', label: 'G', parent: 'nope' }] }));
	assert.ok(bad.some((e) => /title/.test(e)) && bad.some((e) => /description/.test(e)) && bad.some((e) => /unknown node/.test(e)) && bad.some((e) => /itself/.test(e)) && bad.some((e) => /parent/.test(e)));
});

t('layout puts edge targets right of sources and no route crosses a tile or label zone', () => {
	const l = D.layout(spec());
	const x = Object.fromEntries(l.nodes.map((n) => [n.id, n.x]));
	assert.ok(x.u < x.a && x.a < x.d);
	assert.deepStrictEqual(l.warnings, []);
	for (const r of l.routes) for (let i = 0; i + 1 < r.pts.length; i++) {
		const [p, q] = [r.pts[i], r.pts[i + 1]];
		const s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) };
		for (const n of l.nodes) for (const o of [n.tile, n.text]) assert.ok(!(s.x < o.x + o.w - 1 && s.x + s.w > o.x + 1 && s.y < o.y + o.h - 1 && s.y + s.h > o.y + 1), `${r.e.from}>${r.e.to} crosses ${n.id}`);
	}
});

t('a cycle and a skip-layer edge still route without a no-route warning', () => {
	const l = D.layout(spec({ edges: [{ from: 'u', to: 'a' }, { from: 'a', to: 'd' }, { from: 'd', to: 'a' }, { from: 'u', to: 'd', label: 'direct' }] }));
	assert.deepStrictEqual(l.warnings.filter((w) => /no clear route/.test(w)), []);
});

t('detect reads a Next.js, Postgres, Stripe, Vercel, Actions project and marks inferred edges as guesses', () => {
	const d = proj({
		'package.json': JSON.stringify({ dependencies: { next: '1', react: '1', pg: '1', stripe: '1' }, devDependencies: { vitest: '1' } }),
		'vercel.json': '{}', '.github/workflows/ci.yml': 'on: push', '.env.example': 'STRIPE_KEY=\nCLERK_SECRET=\n',
	});
	const { spec: s, open } = D.detectStack(d);
	const labels = s.nodes.map((n) => n.label);
	for (const l of ['User', 'Next.js', 'PostgreSQL', 'Stripe', 'Clerk', 'GitHub Actions', 'Vitest']) assert.ok(labels.includes(l), l);
	assert.ok(!labels.includes('React'), 'a full-stack framework replaces React');
	assert.ok(s.edges.every((e) => e.guess === true));
	assert.ok(s.groups.some((g) => g.label === 'Vercel'));
	assert.deepStrictEqual(D.validateSpec(s), []);
	assert.ok(open.length >= 2);
});

t('detect never prints an env value', () => {
	const d = proj({ 'package.json': '{"dependencies":{"next":"1"}}', '.env': 'STRIPE_SECRET=sk_live_ABC', '.env.example': 'STRIPE_KEY=sk_test_XYZ' });
	const r = cli(d, 'detect', '--json');
	assert.ok(!/sk_live_ABC|sk_test_XYZ/.test(r.stdout));
});

t('detect --structure counts folders and relative imports between them', () => {
	const d = proj({ 'src/api/a.ts': "import { x } from '../lib/x';\n", 'src/lib/x.ts': 'export const x = 1;\n', 'src/ui/u.ts': "import '../lib/x';\n" });
	const { spec: s } = D.detectStructure(d);
	assert.deepStrictEqual(s.nodes.map((n) => n.id).sort(), ['api', 'lib', 'ui']);
	assert.ok(s.edges.some((e) => e.from === 'api' && e.to === 'lib') && s.edges.some((e) => e.from === 'ui' && e.to === 'lib'));
});

t('CLI: no command exits 2 with a usage line; a missing spec exits 1 with advice', () => {
	const d = proj();
	const r = cli(d);
	assert.strictEqual(r.status, 2); assert.match(r.stderr, /^usage:/);
	const m = cli(d, 'check', 'missing.json');
	assert.strictEqual(m.status, 1); assert.match(m.stderr, /cannot read spec/);
});

t('CLI: detect writes once, refuses to overwrite without --force, and --dry-run writes nothing', () => {
	const d = proj({ 'package.json': '{"dependencies":{"hono":"1","pg":"1"}}' });
	assert.strictEqual(cli(d, 'detect', '--dry-run').status, 0);
	assert.ok(!fs.existsSync(path.join(d, 'diagram')));
	assert.strictEqual(cli(d, 'detect').status, 0);
	assert.ok(fs.existsSync(path.join(d, 'diagram', 'stack.spec.json')));
	const again = cli(d, 'detect');
	assert.strictEqual(again.status, 1); assert.match(again.stderr, /--force/);
	assert.strictEqual(cli(d, 'detect', '--force').status, 0);
});

t('CLI: build writes light and dark SVG and HTML with a data-theme value, no external URL and a README snippet', () => {
	const d = proj();
	fs.writeFileSync(path.join(d, 's.spec.json'), JSON.stringify(spec()));
	assert.strictEqual(cli(d, 'build', 's.spec.json', '--dry-run').status, 0);
	assert.ok(!fs.existsSync(path.join(d, 's.light.svg')));
	const r = cli(d, 'build', 's.spec.json');
	assert.strictEqual(r.status, 0, r.stderr);
	for (const f of ['s.light.svg', 's.dark.svg', 's.html']) assert.ok(fs.existsSync(path.join(d, f)), f);
	const html = fs.readFileSync(path.join(d, 's.html'), 'utf8');
	assert.match(html, /<figure class="dg" data-theme="system">/);
	assert.match(html, /<html lang="en">/);
	assert.ok(!/!important/.test(html));
	const svg = fs.readFileSync(path.join(d, 's.light.svg'), 'utf8');
	assert.match(svg, /role="img" aria-labelledby="dg-t dg-d"/);
	assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), 'no external URL inside the SVG');
	assert.match(r.stdout, /<picture>/);
});

t('CLI: a bad spec fails the build, lists the errors and writes nothing', () => {
	const d = proj();
	fs.writeFileSync(path.join(d, 'b.spec.json'), JSON.stringify(spec({ title: '' })));
	const r = cli(d, 'build', 'b.spec.json');
	assert.strictEqual(r.status, 1); assert.match(r.stderr, /title is missing/);
	assert.ok(!fs.existsSync(path.join(d, 'b.html')));
});

t('CLI: a missing logo falls back to a glyph, a cached logo is embedded', () => {
	const d = proj();
	fs.writeFileSync(path.join(d, 's.spec.json'), JSON.stringify(spec({ nodes: spec().nodes.map((n) => (n.id === 'a' ? { ...n, icon: 'nextjs' } : n)) })));
	assert.strictEqual(cli(d, 'build', 's.spec.json').status, 0);
	assert.ok(!/data:image/.test(fs.readFileSync(path.join(d, 's.light.svg'), 'utf8')));
	fs.mkdirSync(path.join(d, '.diagram', 'icons'), { recursive: true });
	fs.writeFileSync(path.join(d, '.diagram', 'icons', 'nextjs.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
	assert.strictEqual(cli(d, 'build', 's.spec.json').status, 0);
	assert.match(fs.readFileSync(path.join(d, 's.light.svg'), 'utf8'), /data:image\/svg\+xml;base64,/);
});
