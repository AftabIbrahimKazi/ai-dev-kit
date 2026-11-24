#!/usr/bin/env node
// Scopes an independent review without a model: which areas a change reaches, the files and audit findings per area, what an earlier review settled, and
// whether a reviewer is worth spawning at all. Also records what a review settled and moves each area's "last reviewed" commit.
//   node pre-merge-gate.scope.js [--base <ref>] [--cwd <dir>] [--json]
//   node pre-merge-gate.scope.js --settle <area> "<one line, with the reason>"
//   node pre-merge-gate.scope.js --mark [area,area]      (marks HEAD as reviewed for those areas, default all)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface AreaPlan { area: string; files: string[]; changedLines: number; findings: { file: string; line: number; rule: string; msg: string }[]; lastReviewed: string | null; settled: string[]; needsReviewer: boolean }
interface State { areas: Record<string, { lastReviewed?: string; settled?: string[] }> }

export const AREAS: Record<string, RegExp> = {
  css: /\.(css|scss|sass|less|pcss)$/i,
  markup: /\.(html?|php|vue|svelte|astro|jsx|tsx|twig|liquid)$/i,
  script: /\.(js|mjs|cjs|ts|mts|cts)$/i,
};
const SECURITY_PATH = /(^|[/._-])(auth|login|signin|session|password|token|upload|payment|checkout|crypto|sql|cookie|csrf|cors|secret)/i;
const SKIP = /(^|\/)(node_modules|dist|build|vendor|coverage|\.git)\//;
const TRIVIAL_LINES = 5;
const STATE_FILE = path.join('.claude', 'review-state.json');

const git = (cwd: string, ...args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
};
export const readState = (cwd: string): State => {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, STATE_FILE), 'utf8')); } catch { return { areas: {} }; }
};
const writeState = (cwd: string, s: State): void => {
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(cwd, STATE_FILE), JSON.stringify(s, null, 2) + '\n');
};

export function areasOf(file: string): string[] {
  const out = Object.keys(AREAS).filter((a) => AREAS[a].test(file));
  if (out.length && SECURITY_PATH.test(file)) out.push('security');
  return out;
}

function changedFiles(cwd: string, base: string): { file: string; lines: number }[] {
  const names = git(cwd, 'diff', '--numstat', base, '--').out.split('\n').filter(Boolean).map((l) => l.split('\t'));
  return names.map(([add, del, file]) => ({ file: file.replace(/\\/g, '/'), lines: (Number(add) || 0) + (Number(del) || 0) })).filter((f) => !SKIP.test(f.file) && fs.existsSync(path.join(cwd, f.file)));
}

function hunks(cwd: string, base: string, file: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of git(cwd, 'diff', '-U0', base, '--', file).out.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]), len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) out.push([start, start + len - 1]);
  }
  return out;
}

export function plan(cwd: string, baseArg?: string): AreaPlan[] {
  const head = git(cwd, 'rev-parse', 'HEAD').out;
  const state = readState(cwd);
  let audit: any = null;
  try { audit = require('../standards/code-audit.audit.js'); } catch { /* findings unavailable */ }
  const cfg = audit ? audit.projectConfig(cwd) : {};
  const byArea = new Map<string, { files: Set<string>; lines: number }>();
  const baseFor = (area: string): string => baseArg || state.areas[area]?.lastReviewed || (git(cwd, 'rev-parse', '--verify', '-q', 'origin/main').ok ? 'origin/main' : 'HEAD~1');
  const cache = new Map<string, { file: string; lines: number }[]>();
  const diffFor = (base: string) => { if (!cache.has(base)) cache.set(base, changedFiles(cwd, base)); return cache.get(base)!; };
  for (const area of [...Object.keys(AREAS), 'security']) {
    for (const f of diffFor(baseFor(area))) {
      if (!areasOf(f.file).includes(area)) continue;
      const e = byArea.get(area) || { files: new Set<string>(), lines: 0 };
      e.files.add(f.file); e.lines += f.lines; byArea.set(area, e);
    }
  }
  return [...byArea.entries()].map(([area, e]) => {
    const files = [...e.files];
    const findings: AreaPlan['findings'] = [];
    if (audit) for (const f of files) {
      const ranges = hunks(cwd, baseFor(area), f);
      try { findings.push(...audit.checkText(f, fs.readFileSync(path.join(cwd, f), 'utf8'), cfg).filter((x: any) => audit.RULES[x.rule]?.kind !== 'info' && ranges.some(([a, b]) => x.line >= a && x.line <= b)).map((x: any) => ({ file: x.file, line: x.line, rule: x.rule, msg: x.msg }))); } catch { /* unreadable */ }
    }
    return { area, files, changedLines: e.lines, findings, lastReviewed: state.areas[area]?.lastReviewed || null, settled: state.areas[area]?.settled || [], needsReviewer: area === 'security' ? true : e.lines >= TRIVIAL_LINES } as AreaPlan;
  }).map((p) => ({ ...p, head }) as AreaPlan);
}

export function settle(cwd: string, area: string, text: string): void {
  const s = readState(cwd);
  const a = (s.areas[area] = s.areas[area] || {});
  a.settled = [...new Set([...(a.settled || []), text.trim()])];
  writeState(cwd, s);
}
export function mark(cwd: string, areas?: string[]): string[] {
  const head = git(cwd, 'rev-parse', 'HEAD').out;
  const s = readState(cwd);
  const all = areas && areas.length ? areas : [...Object.keys(AREAS), 'security'];
  for (const a of all) { s.areas[a] = { ...(s.areas[a] || {}), lastReviewed: head }; }
  writeState(cwd, s);
  return all;
}

function main(): void {
  const argv = process.argv.slice(2);
  const flag = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const cwd = path.resolve(flag('--cwd') || process.cwd());
  if (argv.includes('--settle')) {
    const i = argv.indexOf('--settle');
    settle(cwd, argv[i + 1], argv[i + 2] || '');
    console.log(`settled under ${argv[i + 1]}`);
    return;
  }
  if (argv.includes('--mark')) {
    const v = flag('--mark');
    console.log('marked ' + mark(cwd, v && !v.startsWith('--') ? v.split(',') : undefined).join(', '));
    return;
  }
  const p = plan(cwd, flag('--base'));
  if (argv.includes('--json')) { console.log(JSON.stringify(p, null, 2)); return; }
  if (!p.length) { console.log('No reviewable change. No reviewer needed.'); return; }
  for (const a of p) {
    console.log(`${a.area}: ${a.files.length} file(s), ${a.changedLines} changed line(s), ${a.findings.length} audit finding(s), ${a.settled.length} settled, reviewer ${a.needsReviewer ? 'YES' : 'no (trivial)'}`);
  }
}
if (require.main === module) main();
