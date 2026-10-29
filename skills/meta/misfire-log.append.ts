#!/usr/bin/env node
// Appends one misfire row (JSONL) to a project-local, gitignored log, for later aggregation
// by misfire-log.report.js. No dependencies, no network call.
// Usage: node misfire-log.append.js --kind skill|mod|addon --name NAME --side kit|assistant
//                                    --expected TEXT --actual TEXT [--evidence TEXT] [--file PATH]
import fs = require('node:fs');
import path = require('node:path');

export const KINDS = ['skill', 'mod', 'addon'] as const;
export const SIDES = ['kit', 'assistant'] as const;
type Kind = typeof KINDS[number];
type Side = typeof SIDES[number];

export interface AppendArgs {
  file: string;
  kind?: string;
  name?: string;
  side?: string;
  expected?: string;
  actual?: string;
  evidence?: string;
  cwd?: string;
}

function parseArgs(argv: string[]): AppendArgs {
  const a: AppendArgs = { file: path.join('.claude', 'misfires.jsonl') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--kind') a.kind = argv[++i];
    else if (k === '--name') a.name = argv[++i];
    else if (k === '--side') a.side = argv[++i];
    else if (k === '--expected') a.expected = argv[++i];
    else if (k === '--actual') a.actual = argv[++i];
    else if (k === '--evidence') a.evidence = argv[++i];
    else if (k === '--file') a.file = argv[++i];
    else if (k === '--cwd') a.cwd = argv[++i];
  }
  return a;
}

export function validate(a: AppendArgs): string[] {
  const errs: string[] = [];
  if (!KINDS.includes(a.kind as Kind)) errs.push(`--kind must be one of ${KINDS.join('|')}`);
  if (!a.name) errs.push('--name is required');
  if (!SIDES.includes(a.side as Side)) errs.push(`--side must be one of ${SIDES.join('|')}`);
  if (!a.expected) errs.push('--expected is required');
  if (!a.actual) errs.push('--actual is required');
  return errs;
}

export interface MisfireRow {
  ts: string;
  kind: string;
  name: string;
  side: string;
  expected: string;
  actual: string;
  evidence?: string;
}

export type AppendResult = { ok: true; file: string; row: MisfireRow } | { ok: false; errors: string[] };

export function append(a: AppendArgs): AppendResult {
  const errs = validate(a);
  if (errs.length) return { ok: false, errors: errs };
  const file = path.isAbsolute(a.file) ? a.file : path.join(a.cwd || process.cwd(), a.file);
  const row: MisfireRow = {
    ts: new Date().toISOString(),
    kind: a.kind!,
    name: a.name!,
    side: a.side!,
    expected: a.expected!,
    actual: a.actual!,
  };
  if (a.evidence) row.evidence = a.evidence;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return { ok: true, file, row };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const res = append(a);
  if (!res.ok) {
    console.error('misfire-log: ' + res.errors.join('; '));
    process.exit(2);
  }
  console.log('logged: ' + res.row.kind + ':' + res.row.name + ' (' + res.row.side + ') -> ' + res.file);
}
