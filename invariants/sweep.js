#!/usr/bin/env node
// Kit-wide mutation sweep on a PRIVATE COPY of the kit, so a probe can never leave a script mutated in the real tree and
// several sweeps can run side by side. It pairs every skills/**/X.js with tests/X.test.js (same name), then runs
// `invariants.cli.js probe` on each pair with that test file as the only check, and appends one JSON line per script.
//
//   node invariants/sweep.js [--only a.js,b.js] [--shard I/N] [--max 40] [--out FILE]
//
//   --only   probe just these script names (matched by the end of the path), e.g. usage-mine.js,skill-writer.lint.js
//   --shard  run every Nth pair starting at I (0-based): `--shard 0/4` ... `--shard 3/4` in four terminals
//   --max    mutants per script (default 40); --out  results file (default invariants/sweep.<shard>.jsonl, git-ignored by name)
// Each line: { script, test, secs, result: { total, killed, survivors[], ignored, baselineOk } | null }.
// The ignore list invariants/probe-ignore.json is applied. Use a distinct --out per run. Safe to stop with Ctrl-C: only the
// temp copy is touched. Plain Node, no dependencies. Needs about 40 MB of temp space per running shard.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : d; };
const KIT = path.resolve(__dirname, '..');
const [shardIdx, shardN] = (arg('shard', '0/1')).split('/').map(Number);
const only = (arg('only', '') || '').split(',').filter(Boolean);
const max = String(arg('max', '40'));
const out = path.resolve(arg('out', path.join(__dirname, 'sweep.' + shardIdx + 'of' + shardN + '.jsonl')));
if (!Number.isInteger(shardIdx) || !Number.isInteger(shardN) || shardN < 1 || shardIdx < 0 || shardIdx >= shardN) { console.error('bad --shard, use I/N like 0/4'); process.exit(2); }

const SKIP = new Set(['node_modules', 'site', '.git', '_sandbox', '.next', '__pycache__']);
// A unique folder name per run: a fixed name can fail to delete on Windows after a crashed run.
const copy = path.join(os.tmpdir(), 'kit-sweep-' + shardIdx + '-' + Date.now());
fs.cpSync(KIT, copy, { recursive: true, filter: (s) => !SKIP.has(path.basename(s)) });

const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p); } return acc; };
const scripts = walk(path.join(copy, 'skills')).map((p) => path.relative(copy, p).split(path.sep).join('/'));
const byBase = new Map();
for (const s of scripts) { const b = path.basename(s, '.js'); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(s); }
let pairs = [];
for (const t of fs.readdirSync(path.join(copy, 'tests')).filter((f) => f.endsWith('.test.js')).sort()) for (const s of byBase.get(t.replace(/\.test\.js$/, '')) || []) pairs.push([s, 'tests/' + t]);
if (only.length) pairs = pairs.filter(([s]) => only.some((w) => s.endsWith('/' + w)));
pairs = pairs.filter((_, i) => i % shardN === shardIdx);

fs.appendFileSync(out, JSON.stringify({ phase: 'start', shard: shardIdx + '/' + shardN, pairs: pairs.length, copy }) + '\n');
const rulesFile = path.join(os.tmpdir(), 'kit-sweep-rules-' + shardIdx + '-' + Date.now() + '.json');
try {
	for (const [s, t] of pairs) {
		fs.writeFileSync(rulesFile, JSON.stringify([{ id: 'T', rule: 'its test passes', covers: [s], check: 'node ' + t }]));
		const t0 = Date.now();
		const r = spawnSync(process.execPath, ['skills/addons/invariants.cli.js', 'probe', '--file', rulesFile, '--max', /figma-code\.cli/.test(s) ? '12' : max, '--json'], { cwd: copy, encoding: 'utf8', timeout: 1500000, maxBuffer: 1 << 26 });
		let result = null; try { result = JSON.parse(r.stdout)[0]; } catch { /* a crash or timeout: result stays null */ }
		fs.appendFileSync(out, JSON.stringify({ script: s, test: t, secs: Math.round((Date.now() - t0) / 1000), result, err: result ? undefined : (r.stderr || 'no output').slice(0, 200) }) + '\n');
	}
	fs.appendFileSync(out, JSON.stringify({ phase: 'done', shard: shardIdx + '/' + shardN }) + '\n');
} finally {
	fs.rmSync(copy, { recursive: true, force: true });
	fs.rmSync(rulesFile, { force: true });
}
