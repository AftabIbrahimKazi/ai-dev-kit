#!/usr/bin/env node
// Per-task A/B gate: accept a candidate only if it beats the baseline AND no single task got worse.
// Averages alone hide a regression that another task's gain pays for; the no-regression rule catches that.
// Pure arithmetic over score files, no model call. Idea from SkillOpt's validation gate (gate_no_regression).
// Usage: node ab-gate.js --base base.json --cand cand.json [--min-gain 0] [--tolerance 0] [--allow-regress] [--json]
//   Each file is { "task-id": score, ... } (score 0..1, or any number where higher is better).
//   --min-gain   mean(cand) - mean(base) must exceed this (default 0, so a tie rejects).
//   --tolerance  a task may drop by up to this much and still count as not worse (default 0).
//   --allow-regress  skip the per-task rule (plain mean gate).
import fs = require('node:fs');

export type Scores = Record<string, number>;
export interface GateOpts { minGain?: number; tolerance?: number; noRegression?: boolean }
export interface GateResult {
  action: 'accept' | 'reject';
  reason: string;
  baseMean: number;
  candMean: number;
  gain: number;
  tasks: number;
  regressed: { task: string; base: number; cand: number }[];
  improved: string[];
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

export function evaluate(base: Scores, cand: Scores, opts: GateOpts = {}): GateResult {
  const minGain = opts.minGain ?? 0;
  const tol = opts.tolerance ?? 0;
  const noReg = opts.noRegression !== false;
  const ids = Object.keys(base);
  const missing = ids.filter((t) => typeof cand[t] !== 'number' || !Number.isFinite(cand[t]));
  const badBase = ids.filter((t) => typeof base[t] !== 'number' || !Number.isFinite(base[t]));
  const empty = { baseMean: 0, candMean: 0, gain: 0, tasks: ids.length, regressed: [], improved: [] };
  if (!ids.length) return { action: 'reject', reason: 'no tasks in the baseline', ...empty };
  if (missing.length || badBase.length)
    return { action: 'reject', reason: `missing or non-numeric score for: ${[...missing, ...badBase].join(', ')}`, ...empty };
  const b = ids.map((t) => base[t]);
  const c = ids.map((t) => cand[t]);
  const baseMean = mean(b), candMean = mean(c), gain = candMean - baseMean;
  const regressed = ids.filter((t) => cand[t] < base[t] - tol).map((t) => ({ task: t, base: base[t], cand: cand[t] }));
  const improved = ids.filter((t) => cand[t] > base[t] + tol);
  const r = { baseMean, candMean, gain, tasks: ids.length, regressed, improved };
  if (!(gain > minGain)) return { action: 'reject', reason: `mean gain ${gain.toFixed(4)} does not exceed ${minGain}`, ...r };
  if (noReg && regressed.length)
    return { action: 'reject', reason: `mean up ${gain.toFixed(4)} but ${regressed.length} task(s) got worse: ${regressed.map((x) => x.task).join(', ')}`, ...r };
  return { action: 'accept', reason: `mean up ${gain.toFixed(4)}${noReg ? ', no task worse' : ''}`, ...r };
}

function load(file: string): Scores {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Scores;
}

function main(argv: string[]) {
  let base = '', cand = '', json = false;
  const o: GateOpts = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base') base = argv[++i];
    else if (k === '--cand') cand = argv[++i];
    else if (k === '--min-gain') o.minGain = Number(argv[++i]);
    else if (k === '--tolerance') o.tolerance = Number(argv[++i]);
    else if (k === '--allow-regress') o.noRegression = false;
    else if (k === '--json') json = true;
  }
  if (!base || !cand) { console.error('usage: ab-gate.js --base base.json --cand cand.json [--min-gain n] [--tolerance n] [--allow-regress] [--json]'); process.exit(2); }
  const res = evaluate(load(base), load(cand), o);
  console.log(json ? JSON.stringify(res, null, 2) : `${res.action.toUpperCase()}: ${res.reason} (base ${res.baseMean.toFixed(3)} -> cand ${res.candMean.toFixed(3)}, ${res.tasks} tasks, ${res.improved.length} better)`);
  process.exit(res.action === 'accept' ? 0 : 1);
}

if (require.main === module) main(process.argv.slice(2));
