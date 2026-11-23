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

t('CLI: an unknown flag exits 2 with the usage line', () => {
	const r = cli(proj(), 'detect', '--bogus');
	assert.strictEqual(r.status, 2); assert.match(r.stderr, /unknown flag --bogus/); assert.match(r.stderr, /usage:/);
});

t('CLI: build will not replace a file it did not write unless --force; warnings go to stderr', () => {
	const d = proj();
	fs.writeFileSync(path.join(d, 's.spec.json'), JSON.stringify(spec({ edges: spec().edges.map((e) => ({ ...e, guess: true })) })));
	fs.writeFileSync(path.join(d, 's.html'), '<p>mine</p>');
	const r = cli(d, 'build', 's.spec.json');
	assert.strictEqual(r.status, 1); assert.match(r.stderr, /not written by this tool/);
	assert.strictEqual(fs.readFileSync(path.join(d, 's.html'), 'utf8'), '<p>mine</p>');
	const f = cli(d, 'build', 's.spec.json', '--force');
	assert.strictEqual(f.status, 0);
	assert.match(f.stderr, /warning: .*guess/); assert.ok(!/warning/.test(f.stdout));
	assert.strictEqual(cli(d, 'build', 's.spec.json').status, 0, 'a second build over its own output is allowed');
});

// ---- golden files: any change to detection, layout or rendering shows up as a diff (found by `invariants probe`) ----
// Regenerate on purpose with UPDATE_GOLDEN=1 node tests/diagram.cli.test.js, then read the diff before committing.
const GOLD = path.join(__dirname, 'fixtures', 'diagram');
const CR = String.fromCharCode(13);
const lf = (s) => s.split(CR).join('');
const golden = (name, actual) => {
	const f = path.join(GOLD, name);
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(GOLD, { recursive: true }); fs.writeFileSync(f, lf(actual)); return; }
	assert.ok(fs.existsSync(f), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(lf(actual), lf(fs.readFileSync(f, 'utf8')), name + ' changed; if that is intended regenerate with UPDATE_GOLDEN=1 and read the diff');
};
const named = (files) => { const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dg gold-')); const root = path.join(parent, 'demo'); fs.mkdirSync(root); for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); } return root; };
const stable = (o) => JSON.stringify(o, null, 1) + '\n';

const RICH = {
	title: 'Rich demo', description: 'Groups, three edge kinds, long labels and a nested group.',
	nodes: [
		{ id: 'u', label: 'Visitor browser session', role: 'user' }, { id: 'cdn', label: 'Edge cache', role: 'cdn' },
		{ id: 'a', label: 'Web app', role: 'app', group: 'g1' }, { id: 'api', label: 'Public API gateway', role: 'api', group: 'g1' },
		{ id: 'db', label: 'Primary database', role: 'db', group: 'g2' }, { id: 'q', label: 'Job queue', role: 'queue', group: 'g2' },
		{ id: 'ci', label: 'CI pipeline', role: 'ci' }, { id: 'mon', label: 'Monitoring', role: 'monitoring' },
	],
	groups: [{ id: 'g1', label: 'Backend services' }, { id: 'g2', label: 'Data tier', parent: 'g1' }],
	edges: [
		{ from: 'u', to: 'cdn', label: 'HTTPS' }, { from: 'cdn', to: 'a', label: 'origin fetch' }, { from: 'a', to: 'api', label: 'REST calls' },
		{ from: 'api', to: 'db', label: 'SQL' }, { from: 'api', to: 'q', label: 'enqueue', kind: 'secondary' }, { from: 'q', to: 'db', label: 'writes', kind: 'secondary' },
		{ from: 'ci', to: 'a', label: 'deploy', kind: 'deploy' }, { from: 'a', to: 'mon', label: 'traces', kind: 'secondary' },
	],
};

t('golden: a rich spec builds the same light SVG, dark SVG and HTML page', () => {
	assert.deepStrictEqual(D.validateSpec(RICH), []);
	const d = proj({ 'diagram/rich.spec.json': stable(RICH) });
	const r = cli(d, 'build', 'diagram/rich.spec.json', '--name', 'rich');
	assert.strictEqual(r.status, 0, r.stderr);
	for (const ext of ['light.svg', 'dark.svg', 'html']) golden('rich.' + ext, fs.readFileSync(path.join(d, 'diagram', 'rich.' + ext), 'utf8'));
});

t('golden: stack detection on a project with a framework, host, Docker, CI, database and env names', () => {
	const root = named({
		'package.json': JSON.stringify({ name: 'demo', dependencies: { next: '15', react: '19', pg: '8', redis: '4', '@sentry/nextjs': '8', stripe: '16', tailwindcss: '4' }, devDependencies: { vitest: '2', eslint: '9', typescript: '5' } }),
		'vercel.json': '{}', Dockerfile: 'FROM node:22\n',
		'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n',
		'.github/workflows/ci.yml': 'name: ci\n', '.env.example': 'DATABASE_URL=\nSTRIPE_SECRET_KEY=\nSENTRY_DSN=\nRESEND_API_KEY=\n',
	});
	golden('detect-stack.json', stable(D.detectStack(root)));
});

t('golden: stack detection on a plain Docker project with GitLab CI', () => {
	const root = named({ 'package.json': JSON.stringify({ dependencies: { express: '4', mongoose: '8' } }), Dockerfile: 'FROM node\n', '.gitlab-ci.yml': 'stages: []\n' });
	golden('detect-stack-docker.json', stable(D.detectStack(root)));
});

t('golden: structure detection follows imports between folders and skips vendored folders', () => {
	const root = named({
		'src/web/index.js': "import { handle } from '../api/handler.js';\nimport '../shared/util.js';\n",
		'src/api/handler.js': "const s = require('../db/store.js');\nrequire('../shared/util.js');\n",
		'src/db/store.js': 'module.exports = {};\n', 'src/shared/util.js': 'module.exports = {};\n',
		'node_modules/x/index.js': "require('../../src/web/index.js');\n", 'dist/out.js': "require('../src/db/store.js');\n",
	});
	golden('detect-structure.json', stable(D.detectStructure(root)));
});

t('validateSpec: a non-object spec and a group without id or label are reported, never thrown', () => {
	for (const bad of [null, undefined, 'x', 5]) assert.deepStrictEqual(D.validateSpec(bad), ['spec is not an object']);
	assert.ok(D.validateSpec(spec({ groups: [{ id: 'g' }] })).some((e) => e.includes('a group needs id and label')));
	assert.ok(D.validateSpec(spec({ groups: [{ label: 'G' }] })).some((e) => e.includes('a group needs id and label')));
});

t('CLI: no command and an unknown command both exit 2', () => {
	const d = proj();
	assert.strictEqual(cli(d).status, 2);
	assert.strictEqual(cli(d, 'bogus').status, 2);
});

t('build --tokens overrides the light and dark palettes separately', () => {
	const files = { 'diagram/s.spec.json': stable(spec()), 'light.json': JSON.stringify({ light: { bg: '#0a0b0c' } }), 'dark.json': JSON.stringify({ dark: { bg: '#0d0e0f' } }) };
	const d = proj(files);
	const out = (n, ext) => fs.readFileSync(path.join(d, 'diagram', n + '.' + ext + '.svg'), 'utf8');
	assert.strictEqual(cli(d, 'build', 'diagram/s.spec.json', '--name', 'a', '--tokens', 'light.json').status, 0);
	assert.ok(out('a', 'light').includes('#0a0b0c') && !out('a', 'dark').includes('#0a0b0c'));
	assert.strictEqual(cli(d, 'build', 'diagram/s.spec.json', '--name', 'b', '--tokens', 'dark.json').status, 0);
	assert.ok(out('b', 'dark').includes('#0d0e0f') && !out('b', 'light').includes('#0d0e0f'));
});

t('build notes a node whose logo is not cached, but not one that has a drawn glyph', () => {
	const sp = spec({ nodes: [{ id: 'z', label: 'Zed', icon: 'nobrand' }, { id: 'd', label: 'DB', role: 'db', icon: 'nobrand' }], edges: [{ from: 'z', to: 'd', label: 'x' }] });
	const d = proj({ 'diagram/s.spec.json': stable(sp) });
	const r = cli(d, 'build', 'diagram/s.spec.json', '--name', 's');
	assert.strictEqual(r.status, 0, r.stderr);
	const note = r.stdout + r.stderr;
	assert.ok(note.includes('no cached logo for Zed'), note);
	assert.ok(!note.includes('no cached logo for Zed, DB') && !note.includes('for DB'), note);
});

const RICH2 = {
	title: 'Cycle and loose parts', description: 'A five step chain with a back edge, a cross edge, a group and three unconnected parts.',
	nodes: [
		{ id: 'a', label: 'Entry', role: 'user' }, { id: 'b', label: 'Router', role: 'app' }, { id: 'c', label: 'Auth', role: 'auth', group: 'g' },
		{ id: 'd', label: 'Orders', role: 'api', group: 'g' }, { id: 'e', label: 'Ledger', role: 'db' },
		{ id: 'l1', label: 'Docs', role: 'tool' }, { id: 'l2', label: 'Metrics', role: 'monitoring' }, { id: 'l3', label: 'Mail', role: 'email' },
	],
	groups: [{ id: 'g', label: 'Services' }],
	edges: [{ from: 'a', to: 'b', label: 'in' }, { from: 'b', to: 'c', label: 'check' }, { from: 'c', to: 'd', label: 'pass' }, { from: 'd', to: 'e', label: 'write' }, { from: 'e', to: 'b', label: 'callback', kind: 'secondary' }, { from: 'a', to: 'd', label: 'direct', kind: 'deploy' }],
};
t('golden: a cycle, a cross edge, a group and loose parts keep the same layout', () => {
	assert.deepStrictEqual(D.validateSpec(RICH2), []);
	const d = proj({ 'diagram/c.spec.json': stable(RICH2) });
	assert.strictEqual(cli(d, 'build', 'diagram/c.spec.json', '--name', 'c').status, 0);
	golden('cycle.light.svg', fs.readFileSync(path.join(d, 'diagram', 'c.light.svg'), 'utf8'));
});

t('golden: structure detection ignores imports within a folder and into unknown folders', () => {
	const root = named({
		'src/web/index.js': "import { h } from './local.js';\nimport '../api/handler.js';\nimport '../nowhere/x.js';\nimport 'react';\n",
		'src/web/local.js': 'export const h = 1;\n', 'src/api/handler.js': "require('./helper.js');\nrequire('../web/index.js');\n", 'src/api/helper.js': 'module.exports = 1;\n',
	});
	golden('detect-structure-2.json', stable(D.detectStructure(root)));
});
