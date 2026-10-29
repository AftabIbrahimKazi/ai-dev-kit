#!/usr/bin/env node
// Aggregates the JSONL misfire log into counts, so the most-repeated (kind, name) pairs surface
// first -- the ones worth fixing in the kit, as opposed to one-off misses.
// Usage: node misfire-log.report.js [--file .claude/misfires.jsonl] [--json]
import fs = require('node:fs');
import path = require('node:path');

interface ReportArgs { file: string; json?: boolean; cwd?: string }

function parseArgs(argv: string[]): ReportArgs {
  const a: ReportArgs = { file: path.join('.claude', 'misfires.jsonl') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--file') a.file = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--cwd') a.cwd = argv[++i];
  }
  return a;
}

interface MisfireRow { kind?: string; name?: string; side?: string; [key: string]: unknown }

export function readRows(file: string, cwd?: string): MisfireRow[] {
  const abs = path.isAbsolute(file) ? file : path.join(cwd || process.cwd(), file);
  if (!fs.existsSync(abs)) return [];
  const rows: MisfireRow[] = [];
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return rows;
}

function bump(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) || 0) + 1); }

export interface PairCount { pair: string; count: number }
export interface Summary {
  total: number;
  byKind: Record<string, number>;
  bySide: Record<string, number>;
  repeated: PairCount[];
  pairs: PairCount[];
}

export function summarize(rows: MisfireRow[]): Summary {
  const byKind = new Map<string, number>();
  const bySide = new Map<string, number>();
  const byPair = new Map<string, number>(); // "kind:name" -> count
  for (const r of rows) {
    if (!r || !r.kind || !r.name) continue;
    bump(byKind, r.kind);
    bump(bySide, r.side || 'unknown');
    bump(byPair, r.kind + ':' + r.name);
  }
  const pairs = [...byPair.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: rows.length,
    byKind: Object.fromEntries(byKind),
    bySide: Object.fromEntries(bySide),
    repeated: pairs.filter(([, n]) => n > 1).map(([k, n]) => ({ pair: k, count: n })),
    pairs: pairs.map(([k, n]) => ({ pair: k, count: n })),
  };
}

function printReport(sum: Summary): void {
  if (sum.total === 0) { console.log('no misfires logged'); return; }
  console.log(`${sum.total} misfire(s) logged`);
  console.log('by kind: ' + Object.entries(sum.byKind).map(([k, n]) => `${k}=${n}`).join(', '));
  console.log('by side: ' + Object.entries(sum.bySide).map(([k, n]) => `${k}=${n}`).join(', '));
  console.log('ranked (kind:name):');
  for (const { pair, count } of sum.pairs) console.log(`  ${count}  ${pair}`);
  if (sum.repeated.length) console.log(`\n${sum.repeated.length} pair(s) repeated -- fix these in the kit first`);
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const rows = readRows(a.file, a.cwd);
  const sum = summarize(rows);
  if (a.json) console.log(JSON.stringify(sum));
  else printReport(sum);
  process.exit(sum.total === 0 ? 1 : 0);
}
