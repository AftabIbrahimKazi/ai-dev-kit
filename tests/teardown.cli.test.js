const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/teardown.cli.js');
const T = require(SCRIPT);

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a], { cwd, encoding: 'utf8' });
const proj = (files = {}) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'td test-'));
	for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); }
	return d;
};
// a project with tiny stand-ins for three and the Triforge packages, so build tests need no network
const fakeLibs = () => proj({
	'package.json': '{"name":"p","type":"module"}',
	'node_modules/three/package.json': JSON.stringify({ name: 'three', version: '0.0.1', type: 'module', exports: { '.': { import: './build/three.module.js' } } }),
	'node_modules/three/build/three.module.js': "import './three.core.js';\nexport const REVISION = 1;\n",
	'node_modules/three/build/three.core.js': 'export const CORE = 1;\n',
	'node_modules/three/examples/jsm/controls/Orbit.js': "import { REVISION } from 'three';\nexport const o = REVISION;\n",
	'node_modules/@triforge/modifier-core/package.json': JSON.stringify({ name: '@triforge/modifier-core', version: '0.1.2', type: 'module', main: './dist/index.js' }),
	'node_modules/@triforge/modifier-core/dist/index.js': "export { A } from './a.js';\n",
	'node_modules/@triforge/modifier-core/dist/a.js': "import { REVISION } from 'three';\nexport const A = REVISION;\n",
	'node_modules/@triforge/keyframe/package.json': JSON.stringify({ name: '@triforge/keyframe', version: '0.1.2', type: 'module', main: './dist/index.js' }),
	'node_modules/@triforge/keyframe/dist/index.js': `export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export class KeyframeTrack { constructor(target, property, kfs) { this.target = target; this.property = property; this.kfs = kfs; }
  evaluate(t) { const k = this.kfs; let v = k[k.length - 1].value; if (t <= k[0].time) v = k[0].value; else for (let i = 0; i + 1 < k.length; i++) if (t >= k[i].time && t <= k[i + 1].time) { const f = (t - k[i].time) / (k[i + 1].time - k[i].time); const e = k[i].easing ? k[i].easing(f) : f; v = k[i].value + (k[i + 1].value - k[i].value) * e; break; } this.target[this.property] = v; } }
export class AnimationClip { constructor(name, tracks) { this.tracks = tracks; } evaluate(t) { this.tracks.forEach((x) => x.evaluate(t)); } }
`,
	'node_modules/three/examples/jsm/loaders/GLTFLoader.js': 'export class GLTFLoader {}\n',
	'node_modules/three/examples/jsm/postprocessing/EffectComposer.js': 'export class EffectComposer {}',
	'node_modules/three/examples/jsm/postprocessing/GTAOPass.js': 'export class GTAOPass {}',
	'node_modules/three/examples/jsm/postprocessing/OutputPass.js': 'export class OutputPass {}',
	'node_modules/three/examples/jsm/postprocessing/Pass.js': 'export class Pass {}',
	'node_modules/three/examples/jsm/postprocessing/RenderPass.js': 'export class RenderPass {}',
	'node_modules/@triforge/render-budget-core/package.json': JSON.stringify({ name: '@triforge/render-budget-core', version: '0.1.1', type: 'module', main: './dist/index.js' }),
	'node_modules/@triforge/render-budget-core/dist/index.js': 'export const initRenderBudget = async () => ({});\n',
});
const scaffolded = (about = 'a 3-gear reducer with 12, 36 and 18 teeth, 1500 rpm, 8 N·m') => {
	const d = fakeLibs();
	assert.strictEqual(cli(d, 'detect', '--about', about, '--name', 'red').status, 0);
	const r = cli(d, 'init', 'red');
	assert.strictEqual(r.status, 0, r.stderr);
	return d;
};

t('classify gives every machine a starter: gears, crank or custom, with the packages that fit its family', () => {
	assert.strictEqual(T.classify('a gearbox').kind, 'gears');
	assert.deepStrictEqual([T.classify('a V8 engine with pistons').kind, T.classify('a V8 engine with pistons').family], ['crank', 'engine']);
	assert.deepStrictEqual([T.classify('Theo Jansen walker linkage').kind, T.classify('Theo Jansen walker linkage').family], ['custom', 'linkage']);
	assert.ok(T.classify('Theo Jansen walker linkage').packages.includes('animation-core'));
	assert.ok(T.classify('a hydraulic pump').packages.includes('geometry-nodes'));
	const c = T.classify('a vending machine');
	assert.deepStrictEqual([c.kind, c.family], ['custom', 'other']);
});

t('extractFacts reads teeth lists, rpm, torque and module; draftSpec asks only for what is missing', () => {
	const f = T.extractFacts('a reducer with 12, 36 and 18 teeth, 1500 rpm, 8 N·m, module 2.5');
	assert.deepStrictEqual([f.teeth, f.rpm, f.torque, f.module], [[12, 36, 18], 1500, 8, 2.5]);
	assert.deepStrictEqual(T.extractFacts('gears of 20T and 40T').teeth, [20, 40]);
	const full = T.draftSpec('a reducer with 12, 36 and 18 teeth, 1500 rpm, 8 N·m, module 2.5', 'r');
	assert.ok(full.open.length === 1 && /reference/.test(full.open[0]), full.open.join(' | '));
	const bare = T.draftSpec('a gearbox', 'g');
	assert.ok(bare.open.some((q) => /teeth/.test(q)) && bare.open.some((q) => /rpm/.test(q)) && bare.open.some((q) => /torque/.test(q)));
	const eng = T.draftSpec('a single cylinder engine, 90 mm stroke, 86 mm bore, rod 150 mm, 3000 rpm', 'e');
	assert.deepStrictEqual([eng.spec.kind, eng.spec.crank_radius_mm, eng.spec.bore_mm, eng.spec.rod_length_mm, eng.spec.input.rpm], ['crank', 45, 86, 150, 3000]);
	const gen = T.draftSpec('a vending machine. parts: coin slot, motor and spiral', 'v');
	assert.deepStrictEqual([gen.spec.kind, gen.spec.parts.map((p) => p.label)], ['custom', ['Coin slot', 'Motor', 'Spiral']]);
	assert.ok(T.draftSpec('my robot arm', 'r', 'arm.glb').spec.model === 'arm.glb');
});

t('validateSpec names each problem', () => {
	const ok = T.draftSpec('gears 12, 36 and 18 teeth', 'r').spec;
	assert.deepStrictEqual(T.validateSpec(ok).filter((x) => x.level === 'error'), []);
	const bad = T.validateSpec({ kind: 'gears', module_mm: 0, input: { rpm: 0 }, parts: [{ id: 'a', label: 'A', teeth: 5.5 }, { id: 'a', label: 'B', teeth: 20 }] }).map((x) => x.msg).join('|');
	for (const w of ['title', 'description', 'rpm', 'torque', 'module', 'duplicate', 'teeth']) assert.ok(bad.includes(w), w + ' missing from: ' + bad);
});

t('lintSource flags impure render code, CDN links, reversed smoothstep and unclamped pow, but not performance.now in main.js', () => {
	const bad = T.lintSource('kin.js', 'const r = Math.random();\nconst t = performance.now();\n');
	assert.strictEqual(bad.filter((x) => x.level === 'error').length, 2);
	assert.strictEqual(T.lintSource('main.js', 'const t = performance.now();').length, 0);
	assert.ok(T.lintSource('x.js', "import a from 'https://cdn.jsdelivr.net/x.js'").some((x) => x.level === 'error' && /CDN/.test(x.msg)));
	assert.ok(T.lintSource('s.js', 'float a = smoothstep(0.8, 0.2, x);').some((x) => /ANGLE/.test(x.msg)));
	assert.strictEqual(T.lintSource('s.js', 'float a = smoothstep(0.2, 0.8, x);').length, 0);
	assert.ok(T.lintSource('s.js', 'float a = pow(base, 2.2);').some((x) => /pow/.test(x.msg)));
	assert.strictEqual(T.lintSource('s.js', 'float a = pow(max(base, 0.0), 2.2);').length, 0);
	assert.ok(T.lintSource('s.js', 'new THREE.ShadowMaterial({})').some((x) => /polygonOffset/.test(x.msg)));
	assert.ok(T.lintSource('m.js', 'new THREE.TubeGeometry(c)').some((x) => x.level === 'note' && /curve-core/.test(x.msg)));
});

t('detect --about writes a spec once, keeps it without --force, honours --dry-run and --json', () => {
	const d = fakeLibs();
	const dry = cli(d, 'detect', '--about', 'a gearbox', '--name', 'g', '--dry-run');
	assert.strictEqual(dry.status, 0);
	assert.ok(!fs.existsSync(path.join(d, 'teardown', 'g', 'spec.json')));
	assert.strictEqual(cli(d, 'detect', '--about', 'a gearbox', '--name', 'g').status, 0);
	const file = path.join(d, 'teardown', 'g', 'spec.json');
	const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
	spec.title = 'Edited';
	fs.writeFileSync(file, JSON.stringify(spec));
	const again = cli(d, 'detect', '--about', 'a gearbox', '--name', 'g');
	assert.ok(/exists; not replaced/.test(again.stderr));
	assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).title, 'Edited');
	const j = JSON.parse(cli(d, 'detect', '--json').stdout);
	assert.ok(j.ok && j.three === '0.0.1' && j.triforge['@triforge/keyframe'] === '0.1.2' && j.machines.includes('g'));
});

t('detect with no --about reports the project only and writes nothing', () => {
	const d = proj({ 'package.json': '{"dependencies":{"@triforge/keyframe":"^0.1.2"}}', 'reference/cutaway.png': 'x' });
	const r = cli(d, 'detect');
	assert.strictEqual(r.status, 0);
	assert.ok(/three: not installed/.test(r.stdout) && /declared, not installed/.test(r.stdout) && /cutaway\.png/.test(r.stdout));
	assert.ok(!fs.existsSync(path.join(d, 'teardown')));
});

t('init needs a spec, scaffolds any kind, and a second init keeps edited files', () => {
	const d = fakeLibs();
	cli(d, 'detect', '--about', 'a vending machine', '--name', 'v');
	assert.strictEqual(cli(d, 'init', 'v').status, 0);
	assert.ok(fs.existsSync(path.join(d, 'teardown', 'v', 'machine.js')));
	assert.strictEqual(cli(d, 'init', 'nope').status, 1);
	const e = scaffolded();
	const film = path.join(e, 'teardown', 'red', 'film.js');
	fs.appendFileSync(film, '// mine\n');
	const r = cli(e, 'init', 'red');
	assert.ok(/kept \d+ that already exist/.test(r.stdout));
	assert.ok(fs.readFileSync(film, 'utf8').includes('// mine'));
});

t('the scaffold passes check; an impure render fails it; a placeholder machine warns', () => {
	const d = scaffolded();
	const dir = path.join(d, 'teardown', 'red');
	const ok = cli(d, 'check', 'teardown/red');
	assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
	const film = path.join(dir, 'film.js');
	const src = fs.readFileSync(film, 'utf8');
	fs.writeFileSync(film, src + '\nexport const bad = Math.random();\n');
	assert.ok(/pure function/.test(cli(d, 'check', 'teardown/red').stderr));
});

t('build copies only the imported library files and writes an import map; a missing package blocks with exit 3', () => {
	const d = scaffolded();
	const r = cli(d, 'build', 'teardown/red', '--json');
	assert.strictEqual(r.status, 0, r.stderr);
	const j = JSON.parse(r.stdout);
	assert.deepStrictEqual(Object.keys(j.imports).sort(), ['@triforge/keyframe', '@triforge/modifier-core', '@triforge/render-budget-core', 'three', 'three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/GTAOPass.js', 'three/addons/postprocessing/OutputPass.js', 'three/addons/postprocessing/Pass.js', 'three/addons/postprocessing/RenderPass.js']);
	const dist = path.join(d, 'teardown', 'red', 'dist');
	for (const f of ['index.html', 'main.js', 'params.js', 'vendor/three/build/three.core.js', 'vendor/@triforge/modifier-core/dist/a.js']) assert.ok(fs.existsSync(path.join(dist, f)), f);
	assert.ok(!fs.existsSync(path.join(dist, 'vendor/three/examples/jsm/controls')), 'unused three addon copied');
	const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
	assert.ok(html.includes('type="importmap"') && !html.includes('__IMPORTMAP__') && !html.includes('__TITLE__'));
	assert.ok(!fs.existsSync(path.join(dist, 'spec.json')));
	fs.rmSync(path.join(d, 'node_modules', '@triforge', 'keyframe'), { recursive: true });
	const blocked = cli(d, 'build', 'teardown/red');
	assert.strictEqual(blocked.status, 3);
	assert.ok(/npm install @triforge\/keyframe/.test(blocked.stderr));
});

t('build maps three/addons imports to examples/jsm', () => {
	const d = scaffolded();
	fs.appendFileSync(path.join(d, 'teardown', 'red', 'main.js'), "\nimport('three/addons/controls/Orbit.js');\n");
	const j = JSON.parse(cli(d, 'build', 'teardown/red', '--json').stdout);
	assert.strictEqual(j.imports['three/addons/controls/Orbit.js'], './vendor/three/examples/jsm/controls/Orbit.js');
});

t('any object: a .glb in the project is found, copied into the machine and built with the loader mapped', () => {
	const d = fakeLibs();
	fs.mkdirSync(path.join(d, 'assets'), { recursive: true });
	fs.writeFileSync(path.join(d, 'assets', 'pump.glb'), 'glTF');
	const det = JSON.parse(cli(d, 'detect', '--json').stdout);
	assert.deepStrictEqual(det.models, ['assets/pump.glb']);
	assert.strictEqual(cli(d, 'detect', '--about', 'a water pump', '--model', 'assets/pump.glb', '--name', 'pump').status, 0);
	const i = cli(d, 'init', 'pump');
	assert.strictEqual(i.status, 0, i.stderr);
	const dir = path.join(d, 'teardown', 'pump');
	assert.ok(fs.existsSync(path.join(dir, 'pump.glb')));
	assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8')).model, 'pump.glb');
	const c = cli(d, 'check', 'teardown/pump');
	assert.strictEqual(c.status, 0, c.stderr);
	assert.ok(!/placeholder/.test(c.stderr));
	const j = JSON.parse(cli(d, 'build', 'teardown/pump', '--json').stdout);
	assert.ok(j.imports['three/addons/loaders/GLTFLoader.js']);
	assert.ok(fs.existsSync(path.join(dir, 'dist', 'pump.glb')));
	fs.rmSync(path.join(dir, 'pump.glb'));
	assert.ok(/not in the machine folder/.test(cli(d, 'check', 'teardown/pump').stderr));
	const blank = fakeLibs();
	cli(blank, 'detect', '--about', 'a vending machine', '--name', 'v');
	cli(blank, 'init', 'v');
	assert.ok(/placeholder/.test(cli(blank, 'check', 'teardown/v').stderr));
});

t('the tour is built from whatever parts the machine has: beats, focus steps and a pure sample', async () => {
	const d = fakeLibs();
	cli(d, 'detect', '--about', 'a vending machine', '--name', 'v');
	cli(d, 'init', 'v');
	const film = await import(pathToFileURL(path.join(d, 'node_modules', '@triforge', 'keyframe', 'dist', 'index.js')).href).then(() => import(pathToFileURL(path.join(d, 'teardown', 'v', 'film.js')).href + '?x=' + Date.now()));
	assert.deepStrictEqual(film.schedule(['a', 'b']).beats, [[0, 'assembled'], [4, 'cut open'], [8, 'a'], [11, 'b'], [14, 'close']]);
	assert.strictEqual(film.schedule(Array.from({ length: 30 }, (_, i) => 'p' + i)).beats.length, 15);
	const parts = [0, 1, 2].map((i) => ({ label: 'p' + i, center: [i * 10, 0, 0], radius: 5, index: i }));
	const tour = film.createTour({ center: [10, 0, 0], radius: 20 }, parts);
	assert.strictEqual(tour.duration, 8 + 9 + 4);
	assert.strictEqual(tour.sample(0).focus, -1);
	assert.strictEqual(tour.sample(8 + 3 * 1 + 0.2).focus, 1);
	assert.strictEqual(tour.sample(11).lookX, 10);
	assert.strictEqual(tour.sample(14).lookX, 20);
	assert.strictEqual(tour.sample(9.7).cut, 1);
	const a = JSON.stringify(tour.sample(13.37)), b = (tour.sample(2), JSON.stringify(tour.sample(13.37)));
	assert.strictEqual(a, b, 'sample(t) must not depend on earlier calls');
	// a tour over parts listed in another order still isolates the right part
	const t2 = film.createTour({ center: [0, 0, 0], radius: 9 }, [{ label: 'x', center: [1, 0, 0], radius: 1, index: 7 }]);
	assert.strictEqual(t2.sample(8.1).focus, 7);
});

t('bad usage exits 2 with a usage line', () => {
	const d = proj();
	for (const a of [[], ['bogus'], ['init'], ['check']]) {
		const r = cli(d, ...a);
		assert.strictEqual(r.status, 2, a.join(' '));
		assert.ok(/usage:/.test(r.stderr));
	}
});

t('sheet without a browser or without installed libraries is blocked with exit 3', () => {
	const d = scaffolded();
	fs.rmSync(path.join(d, 'node_modules', 'three'), { recursive: true });
	const r = spawnSync('node', [SCRIPT, 'sheet', 'teardown/red'], { cwd: d, encoding: 'utf8', env: { ...process.env, CHROME: '' } });
	assert.strictEqual(r.status, 3, r.stderr);
});

t('the starter kinematics mesh: teeth of one gear sit in the gaps of the next at every input angle', async () => {
	const d = scaffolded();
	const kin = await import(pathToFileURL(path.join(d, 'teardown', 'red', 'kin.js')).href + '?x=' + Date.now());
	const frac = (x) => ((x % 1) + 1) % 1;
	for (const theta of [0, 7, 90, 211.5, 1234]) {
		const a = kin.angles(theta);
		for (let i = 0; i + 1 < kin.Z.length; i++) {
			const sum = frac((-a[i] * kin.Z[i]) / (2 * Math.PI) + ((Math.PI - a[i + 1]) * kin.Z[i + 1]) / (2 * Math.PI));
			assert.ok(Math.abs(sum - 0.5) < 1e-9, `theta ${theta} pair ${i}: ${sum}`);
		}
	}
	const rows = Object.fromEntries(kin.readouts(0).map((x) => [x.label, x.value]));
	assert.strictEqual(rows.Ratio, '1.50 : 1');
	assert.strictEqual(rows.Output, '1000 rpm · 12.0 N·m');
	assert.strictEqual(kin.pitchDia(1), 36 * 3);
	assert.strictEqual(kin.centre(0), (12 * 3 + 36 * 3) / 2);
	assert.strictEqual(kin.thetaAt(0.5), 1500 * 360 / 60 * 0.5);
});

t('the crank starter is exact: dead centres, speed from the position derivative, and the rod never stretches', async () => {
	const d = fakeLibs();
	cli(d, 'detect', '--about', 'a single cylinder engine, 90 mm stroke, 86 mm bore, rod 150 mm, 3000 rpm', '--name', 'e');
	assert.strictEqual(cli(d, 'init', 'e').status, 0);
	const kin = await import(pathToFileURL(path.join(d, 'teardown', 'e', 'kin.js')).href + '?x=' + Date.now());
	assert.ok(Math.abs(kin.pistonX(0) - (45 + 150)) < 1e-9 && Math.abs(kin.pistonX(180) - (150 - 45)) < 1e-9);
	assert.ok(Math.abs(kin.pistonSpeed(0)) < 1e-6 && Math.abs(kin.pistonSpeed(180)) < 1e-6);
	for (const th of [20, 60, 100, 250]) {
		const h = 1e-4, omega = (3000 * 2 * Math.PI) / 60;
		const perDeg = (kin.pistonX(th + h) - kin.pistonX(th - h)) / (2 * h);
		const v = perDeg * (180 / Math.PI) * omega;
		assert.ok(Math.abs(v - kin.pistonSpeed(th)) / Math.abs(kin.pistonSpeed(th)) < 1e-3, `speed at ${th}: ${v} vs ${kin.pistonSpeed(th)}`);
		const a = th * kin.D2R, px = 45 * Math.cos(a), py = 45 * Math.sin(a), x = kin.pistonX(th);
		assert.ok(Math.abs(Math.hypot(x - px, py) - 150) < 1e-9, 'rod length at ' + th);
	}
	const rows = Object.fromEntries(kin.readouts(0).map((x) => [x.label, x.value]));
	assert.strictEqual(rows['Stroke · bore'], '90 · 86 mm');
	assert.strictEqual(rows['Mean piston speed'], '9.00 m/s');
});

t('multi-cylinder specs: V8 and inline words are read, bad values are named', () => {
	const v8 = T.draftSpec('a cross-plane V8, 90 degree V, 86 mm bore, 86 mm stroke, 3000 rpm', 'e').spec;
	assert.deepStrictEqual([v8.kind, v8.cylinders, v8.bank_angle_deg, v8.parts.length], ['crank', 8, 90, 9]);
	const i4 = T.draftSpec('an inline 4 engine, 80 mm stroke', 'e').spec;
	assert.deepStrictEqual([i4.cylinders, i4.bank_angle_deg, i4.parts.length], [4, 0, 5]);
	assert.strictEqual(T.draftSpec('a six cylinder engine', 'e').spec.cylinders, 6);
	assert.strictEqual(T.draftSpec('a single cylinder engine', 'e').spec.parts.length, 4);
	const base = { title: 't', description: 'd', kind: 'crank', crank_radius_mm: 40, rod_length_mm: 130, bore_mm: 80, input: { rpm: 1000 } };
	const msgs = (x) => T.validateSpec({ ...base, ...x }).map((f) => f.msg).join('|');
	assert.ok(/cylinders must be/.test(msgs({ cylinders: 20 })));
	assert.ok(/V needs at least 2/.test(msgs({ cylinders: 1, bank_angle_deg: 60 })));
	assert.ok(/needs 4 numbers/.test(msgs({ cylinders: 8, bank_angle_deg: 90, crank_phases_deg: [0, 90, 180] })));
	assert.ok(/will touch/.test(msgs({ cylinders: 2, cylinder_spacing_mm: 70 })));
	assert.strictEqual(msgs({ cylinders: 8, bank_angle_deg: 90, crank_phases_deg: [0, 90, 270, 180] }).includes('error'), false);
});

t('a V8 is exact: cross-plane throws, every rod keeps its length in the world frame, pistons stay on their bank axis', async () => {
	const d = fakeLibs();
	cli(d, 'detect', '--about', 'a cross-plane V8, 90 degree V, 86 mm bore, 86 mm stroke, rod 150 mm, 3000 rpm', '--name', 'e');
	assert.strictEqual(cli(d, 'init', 'e').status, 0);
	const kin = await import(pathToFileURL(path.join(d, 'teardown', 'e', 'kin.js')).href + '?x=' + Date.now());
	assert.deepStrictEqual(kin.phases, [0, 90, 270, 180]);
	assert.strictEqual(kin.THROWS, 4);
	for (const theta of [0, 33, 145, 301]) {
		for (let c = 0; c < 8; c++) {
			const a = (theta + kin.phases[kin.throwOf(c)]) * kin.D2R; // the pin in the shaft frame
			const pin = [kin.R * Math.cos(a), kin.R * Math.sin(a)];
			const b = kin.bankOf(c) * kin.D2R;
			const x = kin.pistonX(kin.localAngle(theta, c));
			const wrist = [x * Math.cos(b), x * Math.sin(b)]; // the piston pin on the bank axis, in the world frame
			assert.ok(Math.abs(Math.hypot(wrist[0] - pin[0], wrist[1] - pin[1]) - kin.L) < 1e-9, `rod ${c} at ${theta}`);
		}
	}
	assert.strictEqual(kin.bankOf(0), 45);
	assert.strictEqual(kin.bankOf(1), -45);
	const rows = Object.fromEntries(kin.readouts(0).map((r) => [r.label, r.value]));
	assert.strictEqual(rows.Layout, 'V8, 90°');
	assert.strictEqual(rows['Firing interval'], '90°');
	assert.strictEqual(rows.Displacement, '3996.5 cm³');
	assert.ok(kin.charts.length === 3 && Math.abs(kin.charts[0].f(0) - (kin.R + kin.L - kin.pistonX(kin.localAngle(0, 0)))) < 1e-9);
});

(async () => {
	for (const [name, fn] of tests) {
		try { await fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
	}
})();
