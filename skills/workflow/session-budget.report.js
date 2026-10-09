#!/usr/bin/env node
// Reads the token ledger written by the budget-ledger mod (JSONL, one row per turn) and prints
// a compact report. Works without the mod on any ledger in the same format.
// Usage: node report.js [--dir D] [--file F] [--sid S] [--last N] [--json]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WHOLE_FILE_CHARS = 40000; // ~10K tokens in one Read
const LOW_CACHE = 0.2;
const MIN_PROMPT = 20000;
const tok = (chars) => Math.round(chars / 4); // estimate: ~4 chars per token

function parseArgs(argv) {
  const a = { dir: path.join(os.homedir(), '.ai-dev-kit', 'ledger'), last: 1 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--dir') a.dir = argv[++i];
    else if (k === '--file') a.file = argv[++i];
    else if (k === '--sid') a.sid = argv[++i];
    else if (k === '--last') a.last = Number(argv[++i]);
  }
  return a;
}

function readRows(args) {
  const files = args.file ? [args.file]
    : fs.existsSync(args.dir) ? fs.readdirSync(args.dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(args.dir, f)) : [];
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* skip a torn line */ }
    }
  }
  return rows;
}

function pickSessions(rows, args) {
  const bySid = new Map();
  for (const r of rows) {
    if (!bySid.has(r.sid)) bySid.set(r.sid, []);
    bySid.get(r.sid).push(r);
  }
  let sids = [...bySid.keys()];
  if (args.sid) sids = sids.filter((s) => s === args.sid);
  else sids = sids.sort((a, b) => bySid.get(a)[0].ts.localeCompare(bySid.get(b)[0].ts)).slice(-args.last);
  return sids.map((s) => ({ sid: s, rows: bySid.get(s).sort((a, b) => a.ts.localeCompare(b.ts)) }));
}

function analyse({ sid, rows }) {
  const t = { in: 0, out: 0, cr: 0, cw: 0 };
  for (const r of rows) { t.in += r.in; t.out += r.out; t.cr += r.cr; t.cw += r.cw; }
  const prompt = t.in + t.cr + t.cw;
  const last = rows[rows.length - 1];
  const main = rows.filter((r) => !r.agentId);

  const lowCache = [];
  main.forEach((r, i) => {
    const p = r.in + r.cr + r.cw;
    if (i > 0 && p >= MIN_PROMPT && r.cr / p < LOW_CACHE) lowCache.push(i + 1);
  });

  const calls = [];
  for (const r of rows) for (const c of r.tools || []) calls.push(c);

  const byTool = new Map();
  const byKey = new Map();
  const skills = new Map();
  const reads = new Map();
  const greps = new Map();
  const repeatReads = new Set();
  const largeReads = [];
  const dirty = new Set(); // paths edited since their last Read
  for (const c of calls) {
    byTool.set(c.t, (byTool.get(c.t) || 0) + c.c);
    const kk = `${c.t} ${c.k}`;
    byKey.set(kk, (byKey.get(kk) || 0) + c.c);
    if (c.t === 'Skill') skills.set(c.k, (skills.get(c.k) || 0) + 1);
    if (c.t === 'Edit' || c.t === 'Write') dirty.add(c.k);
    if (c.t === 'Read') {
      if (reads.has(c.k) && !dirty.has(c.k)) repeatReads.add(c.k);
      reads.set(c.k, (reads.get(c.k) || 0) + 1);
      dirty.delete(c.k);
      if (c.c >= WHOLE_FILE_CHARS) largeReads.push({ k: c.k, tokens: tok(c.c) });
    }
    if (c.t === 'Grep') greps.set(c.k, (greps.get(c.k) || 0) + 1);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, tokens: tok(v) }));

  return {
    sid,
    turns: main.length,
    subagentTurns: rows.length - main.length,
    models: [...new Set(rows.map((r) => r.model))],
    tokens: { ...t, prompt },
    cacheHit: prompt ? t.cr / prompt : 0,
    costUsd: last.usd == null ? null : last.usd,
    ctxPeakPct: Math.max(0, ...rows.map((r) => r.ctxPct || 0)),
    topTools: top(byTool, 5),
    topItems: top(byKey, 5),
    repeatReads: [...repeatReads],
    largeReads,
    repeatGreps: [...greps.entries()].filter(([, n]) => n >= 2).map(([k, n]) => ({ k, n })),
    lowCacheTurns: lowCache,
    skills: [...skills.entries()].map(([k, n]) => ({ k, n })),
  };
}

function format(a) {
  const n = (x) => x.toLocaleString('en-US');
  const L = [];
  L.push(`session ${a.sid} | ${a.turns} turns (+${a.subagentTurns} subagent) | ${a.models.join(', ')}`);
  L.push(`tokens: in ${n(a.tokens.in)} | out ${n(a.tokens.out)} | cache read ${n(a.tokens.cr)} | cache write ${n(a.tokens.cw)} | cache hit ${(a.cacheHit * 100).toFixed(0)}%`);
  L.push(`cost: ${a.costUsd == null ? 'n/a' : '$' + a.costUsd.toFixed(4)} | context peak ${a.ctxPeakPct}%`);
  if (a.topTools.length) L.push('top tool results (est. tokens): ' + a.topTools.map((x) => `${x.k} ${n(x.tokens)}`).join(', '));
  if (a.topItems.length) L.push('top single sinks: ' + a.topItems.map((x) => `${x.k.slice(0, 60)} ${n(x.tokens)}`).join(' | '));
  if (a.repeatReads.length) L.push(`WASTE re-read, file unchanged: ${a.repeatReads.join(', ')}`);
  if (a.largeReads.length) L.push(`WASTE whole-file read (${n(WHOLE_FILE_CHARS / 4)}+ tokens): ${a.largeReads.map((x) => `${x.k} ${n(x.tokens)}`).join(', ')}`);
  if (a.repeatGreps.length) L.push(`WASTE repeated identical Grep: ${a.repeatGreps.map((x) => `${x.k} x${x.n}`).join(', ')}`);
  if (a.lowCacheTurns.length) L.push(`CACHE low hit (<${LOW_CACHE * 100}%) on turn(s): ${a.lowCacheTurns.join(', ')}`);
  if (a.skills.length) L.push('skills loaded: ' + a.skills.map((x) => `${x.k} x${x.n}`).join(', '));
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessions = pickSessions(readRows(args), args);
  if (!sessions.length) { console.log('no ledger rows found'); process.exitCode = 1; return; }
  const out = sessions.map(analyse);
  console.log(args.json ? JSON.stringify(out, null, 2) : out.map(format).join('\n\n'));
}

if (require.main === module) main();
module.exports = { analyse, format, pickSessions, parseArgs };
