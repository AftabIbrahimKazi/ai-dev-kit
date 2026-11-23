#!/usr/bin/env node
// Reads the result files that invariants/sweep.js writes and prints what is still open.
//
//   node invariants/report.js <results.jsonl>... [--script usage-mine.js] [--top 15]
//
// With no --script it prints a table, worst script first, then kit-wide totals (killed, open, ignored) and any script whose
// probe timed out or crashed (result null). With --script it lists that script's survivors as file:line, the edit and the
// source line, so a test can be written for each. When a script appears in several files the LAST one wins, so list older
// results first. Run it from the kit root (it reads the script files to show source lines). Plain Node, no dependencies.
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!files.length) { console.error('usage: node invariants/report.js <results.jsonl>... [--script name] [--top N]'); process.exit(2); }

const rows = new Map();
for (const f of files) {
	for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		try { const x = JSON.parse(line); if (x.script) rows.set(x.script, x); } catch { /* a torn line */ }
	}
}
const all = [...rows.values()];
const want = flag('script');
if (want) {
	const hit = all.find((r) => r.script.endsWith('/' + want) || r.script === want);
	if (!hit) { console.error('no result for ' + want); process.exit(1); }
	if (!hit.result) { console.error(hit.script + ': no result (' + (hit.err || 'timed out') + ')'); process.exit(1); }
	const src = fs.existsSync(hit.script) ? fs.readFileSync(hit.script, 'utf8').split('\n') : [];
	console.log(hit.script + ': ' + hit.result.total + ' mutants, ' + hit.result.killed + ' killed, ' + hit.result.survivors.length + ' open, ' + hit.result.ignored + ' ignored');
	for (const s of hit.result.survivors) console.log('  ' + s.line + '  [' + s.op + ']  ' + (src[s.line - 1] || '').trim().slice(0, 130));
	process.exit(hit.result.survivors.length ? 1 : 0);
}

const ok = all.filter((r) => r.result && r.result.baselineOk);
const bad = all.filter((r) => !r.result || !r.result.baselineOk);
ok.sort((a, b) => b.result.survivors.length - a.result.survivors.length);
const top = Number(flag('top', '0')) || ok.length;
console.log('open  killed/total  ignored  secs  script');
for (const r of ok.slice(0, top)) console.log(String(r.result.survivors.length).padStart(4) + '  ' + (r.result.killed + '/' + r.result.total).padStart(12) + '  ' + String(r.result.ignored).padStart(7) + '  ' + String(r.secs).padStart(4) + '  ' + r.script);
const sum = (k) => ok.reduce((a, r) => a + (k === 'open' ? r.result.survivors.length : r.result[k]), 0);
const T = sum('total'), K = sum('killed'), O = sum('open'), I = sum('ignored');
console.log('\n' + ok.length + ' scripts probed: killed ' + K + '/' + T + ' (' + (100 * K / T).toFixed(1) + '%), open ' + O + ', ignored ' + I + ', killed or ignored ' + (100 * (K + I) / T).toFixed(1) + '%');
console.log('clean (0 open): ' + ok.filter((r) => !r.result.survivors.length).length + ' of ' + ok.length);
if (bad.length) console.log('no usable result (timeout, crash or failing baseline): ' + bad.map((r) => r.script.split('/').pop()).join(', '));
