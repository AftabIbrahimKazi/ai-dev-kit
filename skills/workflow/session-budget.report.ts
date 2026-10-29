#!/usr/bin/env node
// Reads the token ledger written by the budget-ledger mod (JSONL, one row per turn) and prints
// a compact report. Works without the mod on any ledger in the same format.
// Usage: node report.js [--dir D] [--file F] [--sid S] [--last N] [--json]
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

const WHOLE_FILE_CHARS = 40000; // ~10K tokens in one Read
const LOW_CACHE = 0.2;
const MIN_PROMPT = 20000;
const tok = (chars: number): number => Math.round(chars / 4); // estimate: ~4 chars per token

export interface ReportArgs { dir: string; last: number; json?: boolean; file?: string; sid?: string }

export function parseArgs(argv: string[]): ReportArgs {
  const a: ReportArgs = { dir: path.join(os.homedir(), '.ai-dev-kit', 'ledger'), last: 1 };
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

export interface ToolCall { t: string; k: string; c: number }
export interface LedgerRow {
  sid: string; ts: string; in: number; out: number; cr: number; cw: number;
  usd?: number | null; ctxPct?: number; agentId?: string; model: string; tools?: ToolCall[]; ms?: number;
}

function readRows(args: ReportArgs): LedgerRow[] {
  const files = args.file ? [args.file]
    : fs.existsSync(args.dir) ? fs.readdirSync(args.dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(args.dir, f)) : [];
  const rows: LedgerRow[] = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* skip a torn line */ }
    }
  }
  return rows;
}

export interface SessionGroup { sid: string; rows: LedgerRow[] }

export function pickSessions(rows: LedgerRow[], args: ReportArgs): SessionGroup[] {
  const bySid = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    if (!bySid.has(r.sid)) bySid.set(r.sid, []);
    bySid.get(r.sid)!.push(r);
  }
  let sids = [...bySid.keys()];
  if (args.sid) sids = sids.filter((s) => s === args.sid);
  else sids = sids.sort((a, b) => bySid.get(a)![0].ts.localeCompare(bySid.get(b)![0].ts)).slice(-args.last);
  return sids.map((s) => ({ sid: s, rows: bySid.get(s)!.sort((a, b) => a.ts.localeCompare(b.ts)) }));
}

interface TopEntry { k: string; tokens: number }
interface GrepRepeat { k: string; n: number }
interface SkillUse { k: string; n: number }
interface LargeRead { k: string; tokens: number }

export interface Analysis {
  sid: string;
  turns: number;
  subagentTurns: number;
  models: string[];
  tokens: { in: number; out: number; cr: number; cw: number; prompt: number };
  cacheHit: number;
  costUsd: number | null;
  ctxPeakPct: number;
  topTools: TopEntry[];
  topItems: TopEntry[];
  repeatReads: string[];
  largeReads: LargeRead[];
  repeatGreps: GrepRepeat[];
  lowCacheTurns: number[];
  skills: SkillUse[];
  durationMs: number;
  longestTurnMs: number;
}

export function analyse({ sid, rows }: SessionGroup): Analysis {
  const t = { in: 0, out: 0, cr: 0, cw: 0 };
  for (const r of rows) { t.in += r.in; t.out += r.out; t.cr += r.cr; t.cw += r.cw; }
  const prompt = t.in + t.cr + t.cw;
  const last = rows[rows.length - 1];
  const main = rows.filter((r) => !r.agentId);

  const lowCache: number[] = [];
  main.forEach((r, i) => {
    const p = r.in + r.cr + r.cw;
    if (i > 0 && p >= MIN_PROMPT && r.cr / p < LOW_CACHE) lowCache.push(i + 1);
  });

  const calls: ToolCall[] = [];
  for (const r of rows) for (const c of r.tools || []) calls.push(c);

  const byTool = new Map<string, number>();
  const byKey = new Map<string, number>();
  const skills = new Map<string, number>();
  const reads = new Map<string, number>();
  const greps = new Map<string, number>();
  const repeatReads = new Set<string>();
  const largeReads: LargeRead[] = [];
  const dirty = new Set<string>(); // paths edited since their last Read
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
  const top = (m: Map<string, number>, n: number): TopEntry[] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, tokens: tok(v) }));

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
    durationMs: main.reduce((s, r) => s + (r.ms || 0), 0),
    longestTurnMs: Math.max(0, ...main.map((r) => r.ms || 0)),
  };
}

// "4m 12s", or "48s" under a minute. For checking a plan-first estimate against what actually happened.
export function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function format(a: Analysis): string {
  const n = (x: number): string => x.toLocaleString('en-US');
  const L: string[] = [];
  L.push(`session ${a.sid} | ${a.turns} turns (+${a.subagentTurns} subagent) | ${a.models.join(', ')}`);
  L.push(`tokens: in ${n(a.tokens.in)} | out ${n(a.tokens.out)} | cache read ${n(a.tokens.cr)} | cache write ${n(a.tokens.cw)} | cache hit ${(a.cacheHit * 100).toFixed(0)}%`);
  L.push(`cost: ${a.costUsd == null ? 'n/a' : '$' + a.costUsd.toFixed(4)} | context peak ${a.ctxPeakPct}%`);
  L.push(`time: ${fmtMs(a.durationMs)} total | longest turn ${fmtMs(a.longestTurnMs)} -- for checking a plan-first estimate against reality`);
  if (a.topTools.length) L.push('top tool results (est. tokens): ' + a.topTools.map((x) => `${x.k} ${n(x.tokens)}`).join(', '));
  if (a.topItems.length) L.push('top single sinks: ' + a.topItems.map((x) => `${x.k.slice(0, 60)} ${n(x.tokens)}`).join(' | '));
  if (a.repeatReads.length) L.push(`WASTE re-read, file unchanged: ${a.repeatReads.join(', ')}`);
  if (a.largeReads.length) L.push(`WASTE whole-file read (${n(WHOLE_FILE_CHARS / 4)}+ tokens): ${a.largeReads.map((x) => `${x.k} ${n(x.tokens)}`).join(', ')}`);
  if (a.repeatGreps.length) L.push(`WASTE repeated identical Grep: ${a.repeatGreps.map((x) => `${x.k} x${x.n}`).join(', ')}`);
  if (a.lowCacheTurns.length) L.push(`CACHE low hit (<${LOW_CACHE * 100}%) on turn(s): ${a.lowCacheTurns.join(', ')}`);
  if (a.skills.length) L.push('skills loaded: ' + a.skills.map((x) => `${x.k} x${x.n}`).join(', '));
  return L.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sessions = pickSessions(readRows(args), args);
  if (!sessions.length) { console.log('no ledger rows found'); process.exitCode = 1; return; }
  const out = sessions.map(analyse);
  console.log(args.json ? JSON.stringify(out, null, 2) : out.map(format).join('\n\n'));
}

if (require.main === module) main();
