#!/usr/bin/env node
// Time-boxed parallel mutation sweep. Splits every script's mutants into small slices, runs the slices on a pool of
// workers (each on its own private copy of the kit), and stops taking new slices when the time budget is spent.
//
//   node invariants/pool.js [--workers 14] [--budget 10] [--chunk 8] [--only a.js,b.js] [--out FILE]
//
//   --workers  parallel workers (default: CPU count minus 2); each needs about 40 MB of temp space
//   --budget   minutes after which no new slice starts (default 10); slices already running finish, so allow a few minutes extra
//   --chunk    mutants per slice (default 8)
// Slices are queued round-robin (slice 0 of every script, then slice 1, ...), and slice k takes every Nth mutant, so a run
// cut off by the budget still covers every script evenly. The output is one line per script in the sweep.js format, with
// `partial: true` and the covered/total counts when the budget cut it short; read it with `node invariants/report.js FILE`.
// figma-code.cli is capped at 2 slices (its test takes about 75 s per mutant). Plain Node, no dependencies.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const KIT = path.resolve(__dirname, '..');
const workers = Number(arg('workers', Math.max(1, os.cpus().length - 2)));
const budgetMs = Number(arg('budget', '10')) * 60000;
const chunk = Number(arg('chunk', '8'));
const only = (arg('only', '') || '').split(',').filter(Boolean);
const out = path.resolve(arg('out', path.join(__dirname, 'pool.' + Date.now() + '.jsonl')));
const SKIP = new Set(['node_modules', 'site', '.git', '_sandbox', '.next', '__pycache__']);
const stamp = Date.now();
const t0 = Date.now();

const copies = [];
for (let w = 0; w < workers; w++) {
	const c = path.join(os.tmpdir(), 'kit-pool-' + stamp + '-' + w);
	fs.cpSync(KIT, c, { recursive: true, filter: (s) => !SKIP.has(path.basename(s)) });
	copies.push(c);
}
const home = copies[0];
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p); } return acc; };
const scripts = walk(path.join(home, 'skills')).map((p) => path.relative(home, p).split(path.sep).join('/'));
const byBase = new Map();
for (const s of scripts) { const b = path.basename(s, '.js'); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(s); }
let pairs = [];
for (const t of fs.readdirSync(path.join(home, 'tests')).filter((f) => f.endsWith('.test.js')).sort()) for (const s of byBase.get(t.replace(/\.test\.js$/, '')) || []) pairs.push([s, 'tests/' + t]);
if (only.length) pairs = pairs.filter(([s]) => only.some((w) => s.endsWith('/' + w)));

const rules = (s, t) => { const f = path.join(os.tmpdir(), 'kit-pool-rules-' + stamp + '-' + Buffer.from(s).toString('hex').slice(-16) + '.json'); fs.writeFileSync(f, JSON.stringify([{ id: 'T', rule: 'its test passes', covers: [s], check: 'node ' + t }])); return f; };
const cli = (cwd, args) => spawnSync(process.execPath, ['skills/addons/invariants.cli.js', 'probe', ...args, '--json'], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });

// Count each script's mutants (no tests run), then build the slice queue.
const plan = new Map();
for (const [s, t] of pairs) {
	let total = 0;
	try { total = JSON.parse(cli(home, ['--file', rules(s, t), '--max', '100000', '--count']).stdout)[0].total; } catch { /* leaves 0 */ }
	if (!total) continue;
	let n = Math.max(1, Math.ceil(total / chunk));
	if (/figma-code\.cli/.test(s)) n = Math.min(n, 2);
	plan.set(s, { s, t, total, n, got: { total: 0, killed: 0, invalid: 0, ignored: 0, survivors: [], failed: 0 }, done: 0, secs: 0, baselineBad: false });
}
const queue = [];
const maxN = Math.max(0, ...[...plan.values()].map((p) => p.n));
for (let k = 0; k < maxN; k++) for (const p of plan.values()) if (k < p.n) queue.push({ p, k });
console.error('pool: ' + plan.size + ' scripts, ' + queue.length + ' slices, ' + workers + ' workers, budget ' + (budgetMs / 60000) + ' min');

let next = 0, running = 0;
const finish = () => {
	const lines = [...plan.values()].map((p) => {
		const covered = p.got.total;
		const result = p.baselineBad ? { file: p.s, baselineOk: false, total: 0, killed: 0, survivors: [] } : p.done ? { file: p.s, baselineOk: true, total: covered, killed: p.got.killed, invalid: p.got.invalid, ignored: p.got.ignored, survivors: p.got.survivors } : null;
		return JSON.stringify({ script: p.s, test: p.t, secs: p.secs, result, partial: p.done < p.n ? true : undefined, slices: p.done + '/' + p.n, mutantsInScript: p.total, err: result ? undefined : 'no slice finished in the budget' });
	});
	fs.writeFileSync(out, lines.join('\n') + '\n');
	for (const c of copies) fs.rmSync(c, { recursive: true, force: true });
	for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith('kit-pool-rules-' + stamp)) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
	const cov = [...plan.values()].reduce((a, p) => a + p.got.total, 0), all = [...plan.values()].reduce((a, p) => a + p.total, 0);
	console.error('pool: done in ' + Math.round((Date.now() - t0) / 1000) + ' s, covered ' + cov + ' of ' + all + ' mutants; results in ' + out);
};
const pump = (w) => {
	if (next >= queue.length || Date.now() - t0 > budgetMs) { if (!running) finish(); return; }
	const { p, k } = queue[next++];
	running++;
	const started = Date.now();
	const ch = spawn(process.execPath, ['skills/addons/invariants.cli.js', 'probe', '--file', rules(p.s, p.t), '--max', '100000', '--slice', k + '/' + p.n, '--json'], { cwd: copies[w] });
	let so = '';
	ch.stdout.on('data', (d) => { so += d; });
	const timer = setTimeout(() => ch.kill(), 8 * 60000);
	ch.on('close', () => {
		clearTimeout(timer);
		running--;
		p.secs += Math.round((Date.now() - started) / 1000);
		try {
			const r = JSON.parse(so)[0];
			if (!r.baselineOk) p.baselineBad = true;
			else { p.done++; p.got.total += r.total; p.got.killed += r.killed; p.got.invalid += r.invalid; p.got.ignored += r.ignored; p.got.survivors.push(...r.survivors); }
		} catch { p.got.failed++; }
		pump(w);
	});
};
for (let w = 0; w < workers; w++) pump(w);
