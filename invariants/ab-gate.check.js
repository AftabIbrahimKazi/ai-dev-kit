// Rule checks for skills/meta/ab-gate.js, written from its header comment. Usage: node ab-gate.check.js R1..R7
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const G = path.join(__dirname, '../skills/meta/ab-gate.js');
const { evaluate } = require(G);
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (n) => Math.floor(rnd() * n);
const mk = (n) => { const o = {}; for (let i = 0; i < n; i++) o['t' + i] = Math.round(rnd() * 20) / 20; return o; };
const mean = (o) => Object.values(o).reduce((a, b) => a + b, 0) / Object.keys(o).length;
const fail = (m) => { console.error(m); process.exit(1); };
const cases = (f) => { for (let i = 0; i < 400; i++) { const n = 1 + pick(6), b = mk(n), c = mk(n); f(b, c, i % 3 === 0 ? 0 : Math.round(rnd() * 10) / 50, i % 4 === 0 ? 0 : Math.round(rnd() * 10) / 50, n); } };
const cli = (b, c, ...a) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'abg-')); fs.writeFileSync(d + '/b.json', JSON.stringify(b)); fs.writeFileSync(d + '/c.json', JSON.stringify(c)); return spawnSync('node', [G, '--base', d + '/b.json', '--cand', d + '/c.json', ...a]).status; };
const R = {
  R1() { cases((b, c, tol, mg) => { const r = evaluate(b, c, { tolerance: 1, minGain: mg, noRegression: false }); const want = mean(c) - mean(b) > mg + 1e-12; if (r.action === 'accept' && !(mean(c) - mean(b) > mg - 1e-12)) fail('R1 accepted without gain over min-gain'); });
    for (const v of [0, 0.3, 1]) if (evaluate({ a: v, b: v }, { a: v, b: v }).action !== 'reject') fail('R1 a tie accepted'); },
  R2() { cases((b, c, tol, mg) => { const r = evaluate(b, c, { tolerance: tol, minGain: mg }); if (r.action === 'accept') for (const t in b) if (c[t] < b[t] - tol - 1e-12) fail('R2 accepted with a worse task ' + t); }); },
  R3() { for (const bad of [undefined, NaN, Infinity, 'x', null]) { if (evaluate({ a: 0.1, b: 0.1 }, { a: 0.9, b: bad }).action !== 'reject') fail('R3 bad candidate score accepted: ' + String(bad)); if (evaluate({ a: 0.1, b: bad }, { a: 0.9, b: 0.9 }).action !== 'reject') fail('R3 bad baseline score accepted: ' + String(bad)); }
    if (evaluate({ a: 1 }, {}).action !== 'reject' || evaluate({}, {}).action !== 'reject') fail('R3 missing task or empty baseline accepted'); },
  R4() { cases((b, c, tol, mg, n) => { const r = evaluate(b, c, { tolerance: tol, minGain: mg }); if (r.action !== 'accept') return; const t = 't' + pick(n); const c2 = { ...c, [t]: c[t] + 0.1 }; if (evaluate(b, c2, { tolerance: tol, minGain: mg }).action !== 'accept') fail('R4 raising a candidate score broke an accept'); }); },
  R5() { cases((b, c) => { const r = evaluate(b, c); if (Math.abs(r.baseMean - mean(b)) > 1e-9 || Math.abs(r.candMean - mean(c)) > 1e-9 || Math.abs(r.gain - (mean(c) - mean(b))) > 1e-9) fail('R5 means wrong'); }); },
  R6() { if (cli({ a: 0.1 }, { a: 0.9 }) !== 0) fail('R6 accept exit code not 0'); if (cli({ a: 0.9 }, { a: 0.1 }) !== 1) fail('R6 reject exit code not 1'); if (spawnSync('node', [G]).status !== 2) fail('R6 bad usage exit code not 2'); },
  R7() { const b = { a: 0.2, b: 0.9 }, c = { a: 0.9, b: 0.8 }; if (cli(b, c, '--allow-regress') !== 0) fail('R7 --allow-regress did not skip the per-task rule'); if (cli({ a: 0.5 }, { a: 0.5 }, '--allow-regress') !== 1) fail('R7 --allow-regress accepted without gain'); },
  R8() { // completeness: the verdict equals the plain definition, including every default
    cases((b, c, tol, mg, n) => { const o = {}; const k = pick(4); if (k & 1) o.tolerance = tol; if (k & 2) o.minGain = mg; if (pick(5) === 0) o.noRegression = false;
      const t = o.tolerance ?? 0, g = o.minGain ?? 0, reg = o.noRegression !== false; const ids = Object.keys(b);
      const gain = ids.map((x) => c[x]).reduce((a, v) => a + v, 0) / n - ids.map((x) => b[x]).reduce((a, v) => a + v, 0) / n;
      const want = gain > g && (!reg || !ids.some((x) => c[x] < b[x] - t)) ? 'accept' : 'reject';
      if (evaluate(b, c, o).action !== want) fail('R8 verdict differs from the definition: want ' + want); }); },
  R9() { const b = { a: 0.5, b: 0.9 }, c = { a: 0.9, b: 0.8 };
    if (cli(b, c) !== 1 || cli(b, c, '--tolerance', '0.2') !== 0) fail('R9 --tolerance not applied');
    if (cli({ a: 0.5 }, { a: 0.55 }) !== 0 || cli({ a: 0.5 }, { a: 0.55 }, '--min-gain', '0.5') !== 1) fail('R9 --min-gain not applied'); },
};
const f = R[process.argv[2]]; if (!f) { console.error('unknown rule'); process.exit(2); } f(); process.exit(0);
