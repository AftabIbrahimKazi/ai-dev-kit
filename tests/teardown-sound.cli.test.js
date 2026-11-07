const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/teardown-sound.cli.js');
const S = require(SCRIPT);

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a], { cwd, encoding: 'utf8' });
const proj = (spec = { kind: 'gears', input: { rpm: 1500 }, parts: [{ teeth: 12 }, { teeth: 36 }] }, timeline = { duration: 12, beats: [{ t: 0, name: 'assembled' }, { t: 4, name: 'cut open' }, { t: 8, name: 'part' }, { t: 10, name: 'close' }] }) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ts test-'));
	fs.mkdirSync(path.join(d, 'teardown', 'm'), { recursive: true });
	fs.writeFileSync(path.join(d, 'teardown', 'm', 'spec.json'), JSON.stringify(spec));
	if (timeline) { fs.mkdirSync(path.join(d, 'teardown-out', 'm'), { recursive: true }); fs.writeFileSync(path.join(d, 'teardown-out', 'm', 'timeline.json'), JSON.stringify(timeline)); }
	return d;
};

t('loudness follows BS.1770: a 1 kHz sine at -20 dBFS peak reads -23.0 LUFS (full scale is -3.01), and silence reads minus infinity', () => {
	const n = S.RATE * 3, x = new Float32Array(n);
	for (let i = 0; i < n; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / S.RATE);
	const l = S.loudness(x);
	assert.ok(Math.abs(l - -23.01) < 0.1, String(l));
	assert.strictEqual(S.loudness(new Float32Array(n)), -Infinity);
});

t('the working frequency is folded into hearing range, and unknown machines have none', () => {
	assert.strictEqual(S.humHz({ kind: 'gears', rpm: 1500, teeth0: 12 }), 300);
	assert.strictEqual(S.humHz({ kind: 'crank', rpm: 3000, cylinders: 8 }), 200);
	assert.ok(S.humHz({ kind: 'gears', rpm: 60, teeth0: 8 }) >= 90);
	assert.ok(S.humHz({ kind: 'crank', rpm: 90000, cylinders: 1 }) <= 360);
	assert.strictEqual(S.humHz({ kind: 'custom', rpm: 1200 }), null);
});

t('the score is the right length, mastered to -14 LUFS with the peak at or below -2 dBFS, and the same every time', () => {
	const beats = [{ t: 0, name: 'assembled' }, { t: 4, name: 'cut open' }, { t: 8, name: 'part' }];
	const a = S.master(S.synth(12, beats, { kind: 'gears', rpm: 1500, teeth0: 12 }, 7));
	assert.strictEqual(a.y.length, 12 * S.RATE);
	assert.ok(Math.abs(a.lufs - -14) < 0.3, 'loudness ' + a.lufs);
	assert.ok(a.peak <= -1.95, 'peak ' + a.peak);
	const b = S.master(S.synth(12, beats, { kind: 'gears', rpm: 1500, teeth0: 12 }, 7));
	assert.ok(Buffer.from(a.y.buffer).equals(Buffer.from(b.y.buffer)), 'same seed, different samples');
	const c = S.master(S.synth(12, beats, { kind: 'gears', rpm: 1500, teeth0: 12 }, 8));
	assert.ok(!Buffer.from(a.y.buffer).equals(Buffer.from(c.y.buffer)), 'a new seed changed nothing');
});

t('a tick sits on each beat and the quiet before the first beat has no tick', () => {
	const x = S.synth(10, [{ t: 0, name: 'a' }, { t: 5, name: 'b' }], { rpm: 0 }, 1);
	const rms = (from, to) => { let e = 0; for (let i = Math.round(from * S.RATE); i < Math.round(to * S.RATE); i++) e += x[i] * x[i]; return Math.sqrt(e / ((to - from) * S.RATE)); };
	assert.ok(rms(5, 5.05) > 3 * rms(3, 3.05), 'no tick at the beat');
});

t('sound writes a valid 16-bit mono WAV that measure reads back at the target', () => {
	const d = proj();
	const r = cli(d, 'sound', 'teardown/m', '--json');
	assert.strictEqual(r.status, 0, r.stderr);
	const j = JSON.parse(r.stdout);
	assert.ok(j.ok && j.hum_hz === 300 && Math.abs(j.lufs - -14) < 0.3 && j.peak_dbfs <= -1.9);
	const file = path.join(d, 'teardown-out', 'm', 'score.wav');
	const buf = fs.readFileSync(file);
	assert.deepStrictEqual([buf.toString('ascii', 0, 4), buf.toString('ascii', 8, 12), buf.readUInt16LE(22), buf.readUInt16LE(34), buf.readUInt32LE(24)], ['RIFF', 'WAVE', 1, 16, 48000]);
	assert.strictEqual(buf.length, 44 + 12 * 48000 * 2);
	const m = JSON.parse(cli(d, 'measure', 'teardown-out/m/score.wav', '--json').stdout);
	assert.ok(Math.abs(m.lufs - -14) < 0.3 && m.seconds === 12);
});

t('sound honours --dry-run, --out and --seed, and needs the timeline', () => {
	const d = proj();
	assert.strictEqual(cli(d, 'sound', 'teardown/m', '--dry-run').status, 0);
	assert.ok(!fs.existsSync(path.join(d, 'teardown-out', 'm', 'score.wav')));
	assert.strictEqual(cli(d, 'sound', 'teardown/m', '--out', 'x/my.wav', '--seed', '3').status, 0);
	assert.ok(fs.existsSync(path.join(d, 'x', 'my.wav')));
	const bare = proj(undefined, null);
	const r = cli(bare, 'sound', 'teardown/m');
	assert.strictEqual(r.status, 1);
	assert.ok(/Run: teardown sheet/.test(r.stderr));
});

t('a machine with no known working frequency still gets a score, without the hum', () => {
	const d = proj({ kind: 'custom', input: { rpm: 1200 }, parts: [] });
	const j = JSON.parse(cli(d, 'sound', 'teardown/m', '--json').stdout);
	assert.ok(j.ok && j.hum_hz === null && Math.abs(j.lufs - -14) < 0.4);
});

t('bad usage exits 2 with a usage line; a bad WAV is an error, not a crash', () => {
	const d = proj();
	for (const a of [[], ['bogus'], ['sound'], ['measure']]) { const r = cli(d, ...a); assert.strictEqual(r.status, 2, a.join(' ')); assert.ok(/usage:/.test(r.stderr)); }
	fs.writeFileSync(path.join(d, 'bad.wav'), 'nope');
	const r = cli(d, 'measure', 'bad.wav');
	assert.strictEqual(r.status, 1);
	assert.ok(/not a WAV/.test(r.stderr));
});
