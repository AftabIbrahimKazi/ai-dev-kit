#!/usr/bin/env node
// External tools the kit links to but never bundles. Reads install-kit.external.json (the registry), detects each tool,
// fetches it on request into ~/.ai-dev-kit/external/<id>/ (shared by every project, never inside a project tree),
// checks the pinned hash, and records what it pulled. Plain Node, no npm deps.
//
//   node install-kit.external.js status [--json]            what is present, pinned where, credited to whom
//   node install-kit.external.js fetch <id> [--force]       download or clone one tool (opt-in; prints its credit line)
//   node install-kit.external.js check                      fresh-machine check: which prerequisites (git, a supported Python) are missing
//   node install-kit.external.js remove <id>                delete the shared folder (other projects lose it too)
//   node install-kit.external.js download <url> <dest>      internal: sync-safe download used by fetch
//
// Env: AI_DEV_KIT_HOME replaces ~/.ai-dev-kit (tests); AI_DEV_KIT_REGISTRY replaces the registry file (tests).
// A `file://` or plain-path URL is copied instead of downloaded, so tests need no network.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import crypto = require('node:crypto');
import https = require('node:https');
import childProcess = require('node:child_process');

export interface ExternalRef {
  id: string; name: string; repo: string; licence: string; kind: 'clone' | 'release-zip' | 'pip' | 'npm-npx';
  ref: string; refNote?: string; asset?: string; sha256?: string; assetUrl?: string; platform?: string;
  fetch?: 'skill'; python?: { min: string; max: string }; packages?: string[]; models?: string[]; licenceNote?: string; detectPort?: number; postInstall?: string; optIn?: boolean; restrictions?: string[]; usedBy: string[]; detect: string; marker?: string; credit: string;
}
export interface RefState { id: string; name: string; present: boolean; where?: string; pinned: string; fetchedRef?: string; stale?: boolean; credit: string; repo: string; note?: string }
export interface FetchResult { id: string; ok: boolean; note?: string; path?: string; ref?: string; sha256?: string; commit?: string; error?: string; credit: string }
export interface ManifestExternal { ref: string; path: string; at: string; sha256?: string; commit?: string }

const HERE = __dirname;
export function registryFile(): string { return process.env.AI_DEV_KIT_REGISTRY || path.join(HERE, 'install-kit.external.json'); }
export function loadRegistry(file?: string): ExternalRef[] {
  const data = JSON.parse(fs.readFileSync(file || registryFile(), 'utf8')) as { refs: ExternalRef[] };
  return data.refs;
}
export function findRef(id: string, file?: string): ExternalRef | undefined { return loadRegistry(file).find((r) => r.id === id); }
export function externalHome(): string { return path.join(process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit'), 'external'); }
export function refDir(id: string): string { return path.join(externalHome(), id); }
function stamp(id: string): string { return path.join(refDir(id), '.ref.json'); }
export function creditLine(r: ExternalRef): string { return `${r.name} by its authors, ${r.licence}, ${r.repo} (credited in CREDITS.md; the kit links it and never bundles it)`; }

function readStamp(id: string): ManifestExternal | null {
  try { return JSON.parse(fs.readFileSync(stamp(id), 'utf8')) as ManifestExternal; } catch { return null; }
}

function onPath(bin: string): string | undefined {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const e of exts) { const p = path.join(dir, bin + e); try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ } }
  }
  return undefined;
}

// A tool that is a local server counts as installed when something already answers on its port (Docker, a desktop app, a hand-started copy).
function portOpen(port: number): boolean {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const js = `const s=require('net').connect(${port},'127.0.0.1');s.on('connect',()=>{process.stdout.write('1');process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1500)`;
  try { return childProcess.spawnSync(process.execPath, ['-e', js], { encoding: 'utf8', timeout: 4000 }).stdout === '1'; } catch { return false; }
}

// Present means: fetched by us (stamp plus marker file) or, for binaries, found on PATH.
export function detect(r: ExternalRef): RefState {
  const base = { id: r.id, name: r.name, pinned: r.ref, credit: r.credit, repo: r.repo };
  if (r.fetch === 'skill') return { ...base, present: false, note: 'pulled by its own skill (' + r.usedBy[0] + '), not by this registry' };
  const st = readStamp(r.id);
  if (st && (!r.marker || fs.existsSync(path.join(refDir(r.id), r.marker)))) {
    return { ...base, present: true, where: refDir(r.id), fetchedRef: st.ref, stale: st.ref !== r.ref && r.ref !== 'live' };
  }
  if (r.detectPort && portOpen(r.detectPort)) return { ...base, present: true, where: `127.0.0.1:${r.detectPort} (already running)`, note: 'a server is already answering on that port; nothing to fetch' };
  if (r.marker) {
    const hit = onPath(path.basename(r.marker).replace(/\.exe$/i, ''));
    if (hit) return { ...base, present: true, where: hit, note: 'found on PATH (not fetched by the kit; pin not checked)' };
  }
  return { ...base, present: false };
}
export function status(): RefState[] { return loadRegistry().map(detect); }

function sha256File(p: string): string { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// Download one URL to a file, following redirects. Run as a child process so callers stay synchronous.
function downloadAsync(url: string, dest: string, hops = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (/^file:\/\//i.test(url) || !/^https?:\/\//i.test(url)) {
      try { fs.copyFileSync(url.replace(/^file:\/\/\/?/i, process.platform === 'win32' ? '' : '/'), dest); resolve(); } catch (e) { reject(e as Error); }
      return;
    }
    if (!/^https:\/\//i.test(url)) { reject(new Error('refusing a non-https download: ' + url)); return; }
    https.get(url, { headers: { 'User-Agent': 'ai-dev-kit' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hops > 5) { reject(new Error('too many redirects')); return; }
        downloadAsync(new URL(res.headers.location, url).toString(), dest, hops + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); return; }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    }).on('error', reject);
  });
}
function downloadSync(url: string, dest: string): void {
  const r = childProcess.spawnSync(process.execPath, [__filename, 'download', url, dest], { encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'download failed').trim().split('\n').pop());
}

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  const r = childProcess.spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}
function extractZip(zip: string, dir: string): void {
  if (run('tar', ['-xf', zip, '-C', dir]).ok) return;
  if (process.platform === 'win32') {
    if (run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`]).ok) return;
  } else if (run('unzip', ['-o', '-q', zip, '-d', dir]).ok) return;
  throw new Error('could not extract the archive: no working tar, unzip or Expand-Archive');
}

function assetUrl(r: ExternalRef): string {
  return r.assetUrl || `${r.repo}/releases/download/${r.ref}/${r.asset}`;
}
function guardRestrictions(r: ExternalRef): void {
  if (/stealth/i.test(r.asset || '') || /stealth/i.test(r.assetUrl || '')) throw new Error('refusing a stealth build: ' + r.id);
}

// Prerequisites: what a fresh machine may lack. Each is checked before anything is fetched, and a missing one is named with how to get it,
// so a first install stops with one clear line instead of a cryptic spawn error halfway through.
const INSTALL_HINT: Record<string, string> = {
  git: 'install Git (https://git-scm.com/downloads, or: winget install Git.Git / brew install git / apt install git)',
  python: 'install Python (https://www.python.org/downloads/, or: winget install Python.Python.3.12 / brew install python@3.12 / apt install python3 python3-venv)',
};
const verOf = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0);
const verIn = (v: number[], min: string, max: string): boolean => {
  const cmp = (a: number[], b: number[]): number => { for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  const hi = verOf(max); const top = [hi[0], hi[1], 999];
  return cmp(v, verOf(min)) >= 0 && cmp(v, top) <= 0;
};
// A Python in the range the packages support (e.g. 3.10 to 3.12: newer ones often lack wheels for torch), looked up as the py launcher
// first on Windows, then versioned names, then plain python3 / python. Returns the command and its leading arguments.
export function findPython(min: string, max: string): { cmd: string; args: string[]; version: string } | undefined {
  const tries: { cmd: string; args: string[] }[] = [];
  if (process.platform === 'win32') for (const v of ['3.12', '3.11', '3.10', '3.13']) tries.push({ cmd: 'py', args: ['-' + v] });
  for (const v of ['3.12', '3.11', '3.10', '3.13']) tries.push({ cmd: 'python' + v, args: [] });
  tries.push({ cmd: 'python3', args: [] }, { cmd: 'python', args: [] });
  for (const t of tries) {
    const r = childProcess.spawnSync(t.cmd, [...t.args, '-c', 'import sys;print("%d.%d.%d" % sys.version_info[:3])'], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) { const v = (r.stdout || '').trim(); if (verIn(verOf(v), min, max)) return { ...t, version: v }; }
  }
  return undefined;
}
export function preflight(r: ExternalRef): string | undefined {
  if (r.kind === 'clone' && childProcess.spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) return `git is not installed, and ${r.name} is fetched with it: ${INSTALL_HINT.git}`;
  if (r.kind === 'pip') {
    const py = r.python || { min: '3.10', max: '3.12' };
    if (!findPython(py.min, py.max)) return `no Python ${py.min} to ${py.max} was found, and ${r.name} needs one: ${INSTALL_HINT.python}`;
  }
  return undefined;
}
export function venvPython(id: string): string { return path.join(refDir(id), 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python'); }

// kind "pip": a private virtual environment under the tool's own folder, the listed packages installed into it, then each listed model
// downloaded from its official Hugging Face repository (the kit never hosts weights). The environment is built where it will live, since
// a venv cannot be moved. A failed build removes it, and a re-run resumes: pip and the Hugging Face cache keep what already arrived.
function fetchPip(r: ExternalRef, dir: string, base: { id: string; credit: string }): FetchResult {
  const py = findPython((r.python || { min: '3.10', max: '3.12' }).min, (r.python || { min: '3.10', max: '3.12' }).max)!;
  fs.mkdirSync(dir, { recursive: true });
  const venv = path.join(dir, 'venv');
  const keep = fs.existsSync(venv);
  try {
    if (!keep) { const v = run(py.cmd, [...py.args, '-m', 'venv', venv]); if (!v.ok) throw new Error('could not create the Python environment: ' + v.out.split('\n').pop() + (process.platform === 'linux' ? ' (on Debian or Ubuntu: apt install python3-venv)' : '')); }
    const vp = venvPython(r.id);
    const pip = run(vp, ['-m', 'pip', 'install', '-q', ...(r.packages || [])]);
    if (!pip.ok) throw new Error('pip install failed: ' + pip.out.split('\n').pop());
    for (const m of r.models || []) {
      const dl = childProcess.spawnSync(vp, ['-c', 'import sys;from huggingface_hub import snapshot_download as d;d(sys.argv[1])', m], { encoding: 'utf8', timeout: 3600000, env: { ...process.env, HF_HUB_DISABLE_PROGRESS_BARS: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', HF_HUB_DISABLE_XET: '1' } });
      if (dl.status !== 0) throw new Error(`model ${m} did not download (${(dl.stderr || '').trim().split('\n').pop()}); run the same command again to resume`);
    }
    const st: ManifestExternal = { ref: r.ref, path: dir, at: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, '.ref.json'), JSON.stringify(st, null, 2));
    return { ...base, ok: true, path: dir, ref: r.ref, note: [r.licenceNote, r.postInstall].filter(Boolean).join(' ') || undefined };
  } catch (e) {
    if (!keep) fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

export function fetchRef(r: ExternalRef, force?: boolean): FetchResult {
  const base = { id: r.id, credit: creditLine(r) };
  try {
    if (r.fetch === 'skill') return { ...base, ok: false, error: `${r.id} is pulled by its own skill (${r.usedBy[0]}); run that instead` };
    guardRestrictions(r);
    if (r.platform && r.platform !== process.platform) return { ...base, ok: false, error: `${r.id} is registered for ${r.platform} only (this is ${process.platform})` };
    const cur = detect(r);
    if (cur.present && !cur.stale && cur.where === refDir(r.id) && !force) return { ...base, ok: true, path: cur.where, ref: cur.fetchedRef };
    const missing = preflight(r);
    if (missing) return { ...base, ok: false, error: missing };
    const dir = refDir(r.id);
    if (r.kind === 'pip') return fetchPip(r, dir, base);
    const tmp = dir + '.tmp-' + process.pid;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    let sha: string | undefined; let commit: string | undefined;
    try {
      if (r.kind === 'release-zip') {
        const zip = path.join(tmp, '_download.zip');
        downloadSync(assetUrl(r), zip);
        sha = sha256File(zip);
        if (sha !== r.sha256) throw new Error(`hash mismatch for ${r.asset}: expected ${r.sha256}, got ${sha}; nothing was installed`);
        extractZip(zip, tmp);
        fs.rmSync(zip, { force: true });
      } else if (r.kind === 'clone') {
        const rev = r.ref === 'live' ? [] : ['--branch', r.ref];
        const c = run('git', ['clone', '--depth', '1', ...rev, r.repo, tmp + '/src']);
        if (!c.ok) throw new Error('git clone failed: ' + c.out.split('\n').pop());
        commit = run('git', ['-C', tmp + '/src', 'rev-parse', 'HEAD']).out;
        fs.rmSync(path.join(tmp, 'src', '.git'), { recursive: true, force: true });
      } else throw new Error(`kind ${r.kind} is not fetched by this script`);
      if (r.marker && !fs.existsSync(path.join(tmp, r.marker))) {
        // a zip often nests everything in one folder; hoist it
        const only = fs.readdirSync(tmp);
        if (only.length === 1 && fs.statSync(path.join(tmp, only[0])).isDirectory()) {
          const inner = path.join(tmp, only[0]);
          for (const f of fs.readdirSync(inner)) fs.renameSync(path.join(inner, f), path.join(tmp, f));
          fs.rmdirSync(inner);
        }
        if (!fs.existsSync(path.join(tmp, r.marker))) throw new Error(`fetched, but ${r.marker} is not in it; nothing was installed`);
      }
      const st: ManifestExternal = { ref: r.ref, path: dir, at: new Date().toISOString(), sha256: sha, commit };
      fs.writeFileSync(path.join(tmp, '.ref.json'), JSON.stringify(st, null, 2));
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.renameSync(tmp, dir);
      return { ...base, ok: true, path: dir, ref: r.ref, sha256: sha, commit, note: r.postInstall };
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  } catch (e) {
    return { ...base, ok: false, error: (e as Error).message };
  }
}

export function removeRef(id: string): { removed: boolean; path: string } {
  const dir = refDir(id);
  const had = fs.existsSync(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: had, path: dir };
}

function main(): void {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'check') { // fresh-machine report: what the registry's tools need and what is missing
    const miss = loadRegistry().filter((r) => r.fetch !== 'skill' && (!r.platform || r.platform === process.platform)).map((r) => ({ id: r.id, problem: preflight(r) })).filter((x) => x.problem);
    console.log(miss.length ? miss.map((x) => `${x.id}: ${x.problem}`).join('\n') : 'every external tool can be fetched on this machine');
    process.exit(miss.length ? 1 : 0);
  }
  const json = process.argv.includes('--json');
  const force = process.argv.includes('--force');
  if (cmd === 'download') {
    downloadAsync(a, b).then(() => process.exit(0), (e: Error) => { console.error(e.message); process.exit(1); });
    return;
  }
  if (cmd === 'status') {
    const s = status();
    if (json) console.log(JSON.stringify(s, null, 2));
    else for (const x of s) console.log(`${x.present ? 'present' : 'absent '} ${x.id.padEnd(16)} pin ${x.pinned}${x.stale ? ' (STALE, run fetch --force)' : ''}${x.note ? ' - ' + x.note : ''}`);
    return;
  }
  if (cmd === 'fetch' && a) {
    const r = findRef(a);
    if (!r) { console.error('unknown external tool: ' + a); process.exit(2); }
    const res = fetchRef(r!, force);
    console.log(json ? JSON.stringify(res, null, 2) : res.ok ? `${r!.id} ready at ${res.path}\ncredit: ${res.credit}` : 'FAILED: ' + res.error);
    process.exit(res.ok ? 0 : 1);
  }
  if (cmd === 'remove' && a) { console.log(JSON.stringify(removeRef(a))); return; }
  console.error('usage: install-kit.external.js <status|check|fetch <id>|remove <id>> [--json] [--force]');
  process.exit(2);
}
if (require.main === module) main();
