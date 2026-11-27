#!/usr/bin/env node
// Browser driver for the Playwright suite: Obscura (small, fast to start, no browser download) and/or the project's own browser (Chrome).
// Both are opt-in; the project chooses one or both in .claude/e2e-drivers.json (written by install-kit --e2e-driver) or with --drivers.
//
//   node drive.js status                                   what is chosen, where Obscura and Playwright were found
//   node drive.js run [--drivers obscura,chrome] [--double-check] [-- <playwright test args>]
//
// One driver chosen: that driver runs, straight through, and its exit code is the answer.
// Both chosen: Obscura runs first. If every test passes, done. If any fail (or Obscura cannot start) Chrome takes over: it re-runs only
// the failed tests (Playwright --last-failed), and each failure is named as DIVERGED (failed on Obscura, passed on Chrome: an Obscura
// limit, not a bug) or FAILED on both (a real failure). --double-check (both chosen only) runs everything on both and compares them.
// Obscura is started on 127.0.0.1 only, for the run, and stopped after. It is told to allow the private network because the suite
// talks to the developer's own dev server; nothing is exposed. The test fixtures read E2E_CDP (see the scaffold's fixtures template).
// Exit codes: 0 all good, 1 test failures, 2 bad usage or no driver chosen, 3 no chosen driver could run.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import net = require('node:net');
import http = require('node:http');
import childProcess = require('node:child_process');

export type Driver = 'obscura' | 'chrome';
export type Verdict = 'passed' | 'failed' | 'skipped';

export function parseDrivers(text: string): Driver[] {
  const out: Driver[] = [];
  for (const raw of text.split(/[,\s+]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (raw === 'both') { out.push('obscura', 'chrome'); continue; }
    if (raw !== 'obscura' && raw !== 'chrome') throw new Error(`unknown driver "${raw}" (use obscura, chrome or both)`);
    out.push(raw);
  }
  const uniq = Array.from(new Set(out));
  return uniq.sort((a, b) => (a === b ? 0 : a === 'obscura' ? -1 : 1)); // Obscura always first
}

// .claude/e2e-drivers.json, looked up from the working folder upwards (stops at a git root or the filesystem root).
export function readDriverConfig(cwd: string): { drivers: Driver[]; file: string } | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, '.claude', 'e2e-drivers.json');
    if (fs.existsSync(file)) {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { drivers?: string[] };
        return { drivers: parseDrivers((j.drivers || []).join(',')), file };
      } catch (e) { throw new Error(`${file} is not valid: ${(e as Error).message}`); }
    }
    if (fs.existsSync(path.join(dir, '.git'))) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function findObscura(): string | null {
  if (process.env.E2E_OBSCURA_BIN) return process.env.E2E_OBSCURA_BIN;
  const exe = process.platform === 'win32' ? 'obscura.exe' : 'obscura';
  const home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
  const own = path.join(home, 'external', 'obscura', exe);
  if (fs.existsSync(own)) return own;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return null;
}

// Playwright's JSON report to { "file:line > title [project]": verdict }.
interface JsonSpec { title: string; file?: string; line?: number; tests?: { projectName?: string; status?: string }[] }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[]; file?: string }
export function summarize(report: { suites?: JsonSuite[] }): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  const walk = (s: JsonSuite): void => {
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        const key = `${spec.file || s.file || '?'}:${spec.line ?? 0} > ${spec.title}${t.projectName ? ' [' + t.projectName + ']' : ''}`;
        const v: Verdict = t.status === 'skipped' ? 'skipped' : t.status === 'unexpected' ? 'failed' : 'passed'; // expected and flaky both ended green
        out.set(key, v);
      }
    }
    for (const c of s.suites || []) walk(c);
  };
  for (const s of report.suites || []) walk(s);
  return out;
}

function readJson(file: string): Map<string, Verdict> {
  try { return summarize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return new Map(); }
}
const count = (m: Map<string, Verdict>, v: Verdict): number => Array.from(m.values()).filter((x) => x === v).length;

function playwrightCli(cwd: string): string | null {
  try { return require.resolve('@playwright/test/cli', { paths: [cwd] }); } catch { return null; }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
  });
}

function cdpUp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, (res) => { res.resume(); resolve((res.statusCode || 0) < 500); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

interface Running { url: string; stop: () => void }
async function startObscura(bin: string): Promise<Running | { error: string }> {
  const port = await freePort();
  const args = ['serve', '--host', '127.0.0.1', '--port', String(port), '--allow-private-network', '--quiet'];
  const child = /\.(c|m)?js$/.test(bin)
    ? childProcess.spawn(process.execPath, [bin, ...args], { stdio: 'ignore' })
    : childProcess.spawn(bin, args, { stdio: 'ignore' });
  let died = false;
  child.on('exit', () => { died = true; });
  child.on('error', () => { died = true; });
  const stop = (): void => { try { child.kill(); } catch { /* already gone */ } };
  for (let i = 0; i < 40; i++) {
    if (died) return { error: 'obscura exited right after starting' };
    if (await cdpUp(port)) return { url: `http://127.0.0.1:${port}`, stop };
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  return { error: 'obscura did not open its CDP port within 8 s' };
}

interface RunResult { code: number; verdicts: Map<string, Verdict>; ms: number }
function runPlaywright(cwd: string, cli: string, passArgs: string[], extraEnv: Record<string, string>, label: string): RunResult {
  const jsonFile = path.join(os.tmpdir(), `e2e-drive-${process.pid}-${label}.json`);
  fs.rmSync(jsonFile, { force: true });
  const t0 = Date.now();
  const r = childProcess.spawnSync(process.execPath, [cli, 'test', ...passArgs, '--reporter=list,json'], {
    cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile },
  });
  const verdicts = readJson(jsonFile);
  fs.rmSync(jsonFile, { force: true });
  return { code: r.status ?? 1, verdicts, ms: Date.now() - t0 };
}

const line = (s: string): void => { process.stdout.write(s + '\n'); };
const sum = (name: string, r: RunResult): string => `${name}: ${count(r.verdicts, 'passed')} passed, ${count(r.verdicts, 'failed')} failed${count(r.verdicts, 'skipped') ? ', ' + count(r.verdicts, 'skipped') + ' skipped' : ''} (${(r.ms / 1000).toFixed(1)}s, exit ${r.code})`;

export async function drive(opts: { cwd: string; drivers: Driver[]; doubleCheck: boolean; passArgs: string[] }): Promise<number> {
  const { cwd, drivers, doubleCheck, passArgs } = opts;
  const cli = playwrightCli(cwd);
  if (!cli) { line('e2e drive: @playwright/test is not installed in this project. Run the install line the scaffold printed.'); return 3; }
  const hasO = drivers.includes('obscura'), hasC = drivers.includes('chrome');
  if (doubleCheck && !(hasO && hasC)) { line('e2e drive: --double-check needs both drivers chosen (obscura and chrome).'); return 2; }

  const runObscura = async (args: string[]): Promise<RunResult | { error: string }> => {
    const bin = findObscura();
    if (!bin) return { error: 'obscura was not found (run: node install-kit.cli.js install --external obscura)' };
    const o = await startObscura(bin);
    if ('error' in o) return o;
    try { return runPlaywright(cwd, cli, args, { E2E_CDP: o.url }, 'obscura'); } finally { o.stop(); }
  };
  const runChrome = (args: string[]): RunResult => runPlaywright(cwd, cli, args, { E2E_CDP: '' }, 'chrome');

  // one driver: straight through
  if (!(hasO && hasC)) {
    if (hasC) { const r = runChrome(passArgs); line(sum('chrome', r)); return r.code === 0 ? 0 : 1; }
    const r = await runObscura(passArgs);
    if ('error' in r) { line(`e2e drive: ${r.error}. Obscura is the only driver chosen, so there is no fallback.`); return 3; }
    line(sum('obscura', r));
    return r.code === 0 ? 0 : 1;
  }

  // both chosen
  const o = await runObscura(passArgs);
  if ('error' in o) {
    line(`e2e drive: ${o.error}; running everything on chrome instead.`);
    const c = runChrome(passArgs); line(sum('chrome', c)); return c.code === 0 ? 0 : 1;
  }
  line(sum('obscura', o));

  if (doubleCheck) {
    const c = runChrome(passArgs);
    line(sum('chrome', c));
    const keys = new Set<string>([...Array.from(o.verdicts.keys()), ...Array.from(c.verdicts.keys())]);
    const diverged: string[] = [], both: string[] = [];
    keys.forEach((k) => {
      const a = o.verdicts.get(k), b = c.verdicts.get(k);
      if (a === 'failed' && b === 'failed') both.push(k);
      else if (a !== b && (a === 'failed' || b === 'failed' || a === undefined || b === undefined)) diverged.push(`${k}  (obscura ${a ?? 'did not run'}, chrome ${b ?? 'did not run'})`);
    });
    line(`double check: ${keys.size} tests, ${diverged.length} diverged, ${both.length} failed on both`);
    diverged.forEach((d) => line(`  DIVERGED ${d}`));
    both.forEach((b) => line(`  FAILED on both ${b}`));
    return diverged.length || both.length || o.code !== 0 || c.code !== 0 ? 1 : 0;
  }

  if (o.code === 0) return 0;
  const failed = Array.from(o.verdicts.entries()).filter(([, v]) => v === 'failed').map(([k]) => k);
  line(`fallback: ${failed.length || 'the'} failed test(s) on obscura re-run on chrome`);
  const c = runChrome([...passArgs, ...(failed.length ? ['--last-failed'] : [])]);
  line(sum('chrome', c));
  const stillFailing = new Set(Array.from(c.verdicts.entries()).filter(([, v]) => v === 'failed').map(([k]) => k));
  failed.forEach((k) => line(stillFailing.has(k) ? `  FAILED on both ${k}` : `  DIVERGED (failed on obscura, passed on chrome) ${k}`));
  return c.code === 0 ? 0 : 1;
}

function parseArgs(argv: string[]): { cmd: string; drivers?: string; doubleCheck: boolean; pass: string[]; cwd: string } {
  const a = { cmd: argv[0] || 'status', drivers: undefined as string | undefined, doubleCheck: false, pass: [] as string[], cwd: process.cwd() };
  const sep = argv.indexOf('--');
  const own = sep >= 0 ? argv.slice(1, sep) : argv.slice(1);
  a.pass = sep >= 0 ? argv.slice(sep + 1) : [];
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--drivers') a.drivers = own[++i];
    else if (own[i] === '--double-check') a.doubleCheck = true;
    else if (own[i] === '--cwd') a.cwd = path.resolve(own[++i]);
    else a.pass.push(own[i]);
  }
  return a;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  let drivers: Driver[] = [];
  let source = '';
  try {
    if (a.drivers) { drivers = parseDrivers(a.drivers); source = '--drivers'; }
    else { const c = readDriverConfig(a.cwd); if (c) { drivers = c.drivers; source = c.file; } }
  } catch (e) { line('e2e drive: ' + (e as Error).message); process.exit(2); }
  if (a.cmd === 'status') {
    line(`drivers: ${drivers.length ? drivers.join(' then ') + ' (' + source + ')' : 'none chosen (opt in: install-kit --e2e-driver obscura|chrome|both, or --drivers)'}`);
    line(`obscura: ${findObscura() || 'not found'}`);
    line(`playwright: ${playwrightCli(a.cwd) ? 'installed' : 'not installed in this project'}`);
    return;
  }
  if (a.cmd !== 'run') { line('usage: drive.js status | run [--drivers obscura,chrome] [--double-check] [-- <playwright args>]'); process.exit(2); }
  if (!drivers.length) { line('e2e drive: no driver is chosen. Opt in with install-kit --e2e-driver obscura|chrome|both, or pass --drivers.'); process.exit(2); }
  process.exit(await drive({ cwd: a.cwd, drivers, doubleCheck: a.doubleCheck, passArgs: a.pass }));
}
if (require.main === module) void main();
