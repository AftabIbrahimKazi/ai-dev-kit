#!/usr/bin/env node
// Local vision MCP server + installer for mcp-manager's `local-vision` server. No dependencies.
//   node local-vision.js preflight [--json]                 detect hardware, print the install plan (no changes)
//   node local-vision.js setup [--backend cpu|cuda|vulkan|metal] [--tier 2b|4b] [--force]
//   node local-vision.js mcp                                stdio MCP server: describe_image
//   node local-vision.js stop | status
// Everything lives in VISION_HOME (default ~/.ai-dev-kit/vision), shared across projects.
import childProcess = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');
import https = require('https');

const { spawn, spawnSync } = childProcess;

const HOME = process.env.VISION_HOME || path.join(os.homedir(), '.ai-dev-kit', 'vision');
const win = process.platform === 'win32';
const exe = (n: string): string => n + (win ? '.exe' : '');
const PORT = process.env.VISION_PORT || '8081';
const IDLE_MS = Number(process.env.VISION_IDLE_SECONDS || 600) * 1000;

// Pinned for reproducibility. Credits + licences: mcp-manager's local-vision.md.
const PKG: { repo: string; tag: string; check: string; pick: Record<string, Record<string, RegExp>>; extra: Record<string, Record<string, RegExp>> } = {
  repo: 'ggml-org/llama.cpp', tag: 'b11390', check: 'llama-server',
  pick: {
    win32: { cpu: /bin-win-cpu-x64\.zip$/, vulkan: /bin-win-vulkan-x64\.zip$/, cuda: /bin-win-cuda-12\.4-x64\.zip$/ },
    linux: { cpu: /bin-ubuntu-x64\.zip$/, vulkan: /bin-ubuntu-vulkan-x64\.zip$/ },
    darwin: { metal: /bin-macos-arm64\.zip$/ },
  },
  extra: { win32: { cuda: /^cudart-llama-bin-win-cuda-12\.4-x64\.zip$/ } },
};
const HF = 'https://huggingface.co/Qwen';
interface ModelFile { file: string; url: string; mb: number }
const MODELS: Record<string, ModelFile[]> = {
  '2b': [
    { file: 'qwen3vl-2b-instruct-q4_k_m.gguf', url: `${HF}/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf`, mb: 1107 },
    { file: 'qwen3vl-2b-mmproj-q8_0.gguf', url: `${HF}/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf`, mb: 445 },
  ],
  '4b': [
    { file: 'qwen3vl-4b-instruct-q4_k_m.gguf', url: `${HF}/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf`, mb: 2497 },
    { file: 'qwen3vl-4b-mmproj-q8_0.gguf', url: `${HF}/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf`, mb: 454 },
  ],
};
const RUNTIME_MB: Record<string, number> = { cpu: 20, vulkan: 35, metal: 20, cuda: 650 };

// ---------- hardware detection + plan ----------
const sh = (cmd: string, args: string[]): string => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, windowsHide: true }); return r.status === 0 ? String(r.stdout).trim() : ''; };

export interface Gpu { name: string; vendor: string; vramGB: number | null; discrete: boolean }

function detectGpus(): Gpu[] {
  const gpus: Gpu[] = [];
  for (const l of sh('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']).split('\n').filter(Boolean)) {
    const [name, mb] = l.split(',').map((s) => s.trim());
    gpus.push({ name, vendor: 'nvidia', vramGB: Math.round(Number(mb) / 1024), discrete: true });
  }
  if (!gpus.length) {
    const names = win ? sh('powershell', ['-NoProfile', '-Command', "(Get-CimInstance Win32_VideoController).Name -join '|'"]).split('|')
      : process.platform === 'linux' ? sh('sh', ['-c', "lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/.*: //'"]).split('\n') : [];
    for (const n of names.map((s) => s.trim()).filter(Boolean)) {
      const vendor = /nvidia/i.test(n) ? 'nvidia' : /amd|radeon|advanced micro/i.test(n) ? 'amd' : /intel/i.test(n) ? 'intel' : 'other';
      const integrated = /radeon\s*\(tm\)\s*graphics|radeon graphics|vega \d|uhd|iris|hd graphics|intel\(r\) graphics|arc\(tm\) graphics|basic display|remote|virtual/i.test(n);
      gpus.push({ name: n, vendor, vramGB: null, discrete: !integrated });
    }
  }
  return gpus;
}

export interface Hardware { platform: string; arch: string; cores: number; ramGB: number; freeDiskGB: number | null; gpus: Gpu[] }

function hardware(): Hardware {
  if (process.env.VISION_FAKE_HW) return JSON.parse(process.env.VISION_FAKE_HW); // test hook: simulate other machines
  let dir = HOME; while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let freeDiskGB: number | null = null; try { const s = fs.statfsSync(dir); freeDiskGB = (s.bavail * s.bsize) / 1e9; } catch { /* unknown */ }
  return { platform: process.platform, arch: process.arch, cores: os.cpus().length, ramGB: os.totalmem() / 1e9, freeDiskGB, gpus: detectGpus() };
}

export interface PlanOverride { backend?: string; tier?: string }
export interface PlanResult { backend: string; tier: string; needMB: number; verdict: string; warnings: string[]; expected: string }

function plan(hw: Hardware, over: PlanOverride = {}): PlanResult {
  if (!PKG.pick[hw.platform]) return { backend: 'none', tier: '2b', needMB: 0, verdict: 'blocked', expected: 'n/a', warnings: [`no prebuilt llama.cpp mapped for ${hw.platform}; build it from source`] };
  const gpu = hw.gpus.find((g) => g.vendor === 'nvidia' && (g.vramGB || 0) >= 4) || hw.gpus.find((g) => g.discrete && g.vendor !== 'nvidia' && g.vendor !== 'other');
  let backend = hw.platform === 'darwin' && hw.arch === 'arm64' ? 'metal'
    : gpu && gpu.vendor === 'nvidia' && win ? 'cuda' : gpu && hw.platform !== 'darwin' ? 'vulkan' : 'cpu';
  const avail = PKG.pick[hw.platform];
  if (!avail[backend]) backend = avail.cpu ? 'cpu' : Object.keys(avail)[0];
  if (over.backend) backend = over.backend;
  const big = (gpu && (gpu.vramGB || 0) >= 6) || (backend === 'metal' && hw.ramGB >= 16);
  const tier = over.tier || (big ? '4b' : '2b');
  const needMB = MODELS[tier].reduce((a, m) => a + m.mb, 0) + RUNTIME_MB[backend];
  const warnings: string[] = []; let verdict = 'ok';
  if (hw.platform !== 'win32') warnings.push(`${hw.platform} is mapped but untested`);
  if (hw.freeDiskGB !== null && hw.freeDiskGB * 1000 < needMB * 1.2) { verdict = 'blocked'; warnings.push(`needs ~${(needMB * 1.2 / 1000).toFixed(1)} GB free, only ${hw.freeDiskGB.toFixed(1)} GB available`); }
  if (hw.ramGB < 4) { verdict = 'blocked'; warnings.push(`${hw.ramGB.toFixed(1)} GB RAM is too low (needs ~2.5 GB free)`); }
  else if (hw.ramGB < 8 && verdict === 'ok') { verdict = 'slow'; warnings.push('under 8 GB RAM: close other apps while it runs'); }
  if (hw.cores < 4 && verdict === 'ok') { verdict = 'slow'; warnings.push(`only ${hw.cores} CPU threads: expect 2-3x the CPU timing below`); }
  if (backend === 'cpu' && hw.gpus.some((g) => g.vendor === 'nvidia')) warnings.push('an NVIDIA GPU with under 4 GB VRAM was found; CPU is the safer choice');
  const expected = backend === 'cpu' ? 'CPU (measured on 8 cores/16 threads): ~7-12 s per image'
    : backend === 'cuda' ? 'CUDA GPU: expect ~1-3 s per image (untested here)'
      : backend === 'vulkan' ? "Vulkan GPU: expect a speed-up over CPU (untested on discrete GPUs); falls back to CPU if it fails the self-test"
        : 'Apple Metal: expect a speed-up over CPU (untested here)';
  return { backend, tier, needMB, verdict, warnings, expected };
}

function report(hw: Hardware, p: PlanResult): string {
  const g = hw.gpus.length ? hw.gpus.map((x) => `${x.name}${x.vramGB ? ` ${x.vramGB} GB` : ''}${x.discrete ? '' : ' (integrated)'}`).join('; ') : 'none detected';
  return [`Hardware: ${hw.cores} threads, ${hw.ramGB.toFixed(1)} GB RAM, ${hw.freeDiskGB === null ? 'disk ?' : hw.freeDiskGB.toFixed(1) + ' GB free'}, GPU: ${g}`,
    `Plan: backend=${p.backend}, vision=Qwen3-VL-${p.tier.toUpperCase()}, download ~${(p.needMB / 1000).toFixed(1)} GB`,
    `Expect: ${p.expected}`, `Verdict: ${p.verdict}`, ...p.warnings.map((w) => `  ! ${w}`)].join('\n');
}

// ---------- state, paths, download ----------
const stateFile = path.join(HOME, 'state.json');
interface VisionState { backend: string; tier: string }
const readState = (): VisionState => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { backend: 'cpu', tier: '2b' }; } };
const model = (f: string): string => path.join(HOME, 'models', f);
const binDir = (backend: string): string => path.join(HOME, 'bin', `llama-${backend}`);
const findServer = (backend: string): string | null => {
  const root = binDir(backend);
  if (!fs.existsSync(root)) return null;
  const hit = fs.readdirSync(root, { recursive: true }).find((f) => path.basename(String(f)) === exe(PKG.check));
  return hit ? path.join(root, String(hit)) : null;
};

function get(url: string, dest: string, redirects = 8): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ai-dev-kit' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode!) && redirects > 0) { res.resume(); resolve(get(new URL(res.headers.location!, url).href, dest, redirects - 1)); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      const total = Number(res.headers['content-length'] || 0); let got = 0, last = 0;
      const tmp = dest + '.part'; const out = fs.createWriteStream(tmp);
      res.on('data', (c: Buffer) => { got += c.length; if (total && Date.now() - last > 5000) { last = Date.now(); process.stderr.write(`  ${path.basename(dest)} ${Math.round((got / total) * 100)}%\n`); } });
      res.pipe(out);
      out.on('finish', () => { fs.renameSync(tmp, dest); resolve(); });
      out.on('error', reject);
    }).on('error', reject);
  });
}

interface GithubAsset { name: string; size: number; browser_download_url: string }
interface GithubRelease { assets?: GithubAsset[] }

async function installServer(backend: string): Promise<void> {
  if (findServer(backend)) return;
  const rel: GithubRelease = await (await fetch(`https://api.github.com/repos/${PKG.repo}/releases/tags/${PKG.tag}`, { headers: { 'User-Agent': 'ai-dev-kit' } })).json();
  const want = [PKG.pick[process.platform]?.[backend], PKG.extra?.[process.platform]?.[backend]].filter(Boolean) as RegExp[];
  if (!want.length) throw new Error(`no ${backend} build mapped for ${process.platform}`);
  const dest = binDir(backend); fs.mkdirSync(dest, { recursive: true });
  for (const re of want) {
    const asset = (rel.assets || []).find((a) => re.test(a.name));
    if (!asset) throw new Error(`no asset matching ${re} in ${PKG.repo}@${PKG.tag}`);
    const zip = path.join(HOME, 'bin', asset.name);
    console.error(`downloading ${asset.name} (${Math.round(asset.size / 1e6)} MB)`);
    await get(asset.browser_download_url, zip);
    const r = win ? spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dest}'`], { stdio: 'inherit' }) : spawnSync('unzip', ['-o', zip, '-d', dest], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`unzip failed for ${asset.name}`);
    fs.unlinkSync(zip);
  }
}

// A GPU build that cannot load (driver/DLL) is replaced by the CPU build instead of failing later.
function selfTest(backend: string): boolean {
  const b = findServer(backend);
  if (!b) return false;
  const r = spawnSync(b, ['--help'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  return !r.error && (String(r.stdout) + String(r.stderr)).length > 100;
}

interface SetupFlags { backend?: string; tier?: string; force?: boolean }

async function setup(flags: SetupFlags): Promise<void> {
  const hw = hardware(); const p = plan(hw, { backend: flags.backend, tier: flags.tier });
  console.error(report(hw, p));
  if (p.verdict === 'blocked' && !flags.force) { console.error('Blocked. Fix the above or pass --force.'); process.exit(3); }
  fs.mkdirSync(path.join(HOME, 'models'), { recursive: true });
  let backend = p.backend;
  await installServer(backend);
  if (backend !== 'cpu' && !selfTest(backend)) { console.error(`${backend} build failed its self-test; falling back to CPU`); backend = 'cpu'; await installServer('cpu'); }
  for (const m of MODELS[p.tier]) {
    if (fs.existsSync(model(m.file))) continue;
    console.error(`downloading ${m.file} (~${m.mb} MB)`);
    await get(m.url, model(m.file));
  }
  fs.writeFileSync(stateFile, JSON.stringify({ backend, tier: p.tier }));
  console.error(`ready in ${HOME} (backend=${backend}, vision=${p.tier})`);
}

function status(): Record<string, unknown> {
  const st = readState(); const s: Record<string, unknown> = { home: HOME, ...st, server: !!findServer(st.backend) };
  for (const m of MODELS[st.tier]) s[m.file] = fs.existsSync(model(m.file));
  return s;
}

// ---------- vision server lifecycle (on demand, idle shutdown) ----------
let proc: childProcess.ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const up = async (): Promise<boolean> => { try { return (await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
async function ensureServer(): Promise<void> {
  if (!(await up())) {
    const st = readState(); const server = findServer(st.backend); const [m, proj] = MODELS[st.tier];
    if (!server || !fs.existsSync(model(m.file)) || !fs.existsSync(model(proj.file))) throw new Error('vision not set up: run `node local-vision.js setup`');
    const args = ['-m', model(m.file), '--mmproj', model(proj.file), '--host', '127.0.0.1', '--port', PORT, '-c', '4096', '--no-webui'];
    if (st.backend !== 'cpu') args.push('-ngl', '99');
    proc = spawn(server, args, { stdio: 'ignore', windowsHide: true });
    fs.writeFileSync(path.join(HOME, 'server.pid'), String(proc.pid));
    const end = Date.now() + 180000;
    while (Date.now() < end && !(await up())) await new Promise((r) => setTimeout(r, 1500));
    if (!(await up())) throw new Error('vision server did not become ready in 180 s');
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (proc) proc.kill(); proc = null; }, IDLE_MS);
  idleTimer.unref();
}

function stop(): void {
  const f = path.join(HOME, 'server.pid');
  if (!fs.existsSync(f)) { console.log('vision server not running (no pid file)'); return; }
  const pid = fs.readFileSync(f, 'utf8').trim();
  if (win) spawnSync('taskkill', ['/F', '/T', '/PID', pid]); else { try { process.kill(Number(pid)); } catch { /* already gone */ } }
  fs.unlinkSync(f); console.log('stopped');
}

interface DescribeArgs { image_path?: string; prompt?: string }

async function describeImage({ image_path, prompt }: DescribeArgs): Promise<string> {
  if (!image_path || !fs.existsSync(image_path)) throw new Error(`image not found: ${image_path}`);
  const ext = path.extname(image_path).slice(1).toLowerCase().replace('jpg', 'jpeg');
  if (!['png', 'jpeg', 'webp', 'gif'].includes(ext)) throw new Error('unsupported image type (png/jpg/webp/gif)');
  await ensureServer();
  const b64 = fs.readFileSync(image_path).toString('base64');
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 500, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/${ext};base64,${b64}` } }, { type: 'text', text: prompt || 'Describe this image in detail, including any visible text.' }] }] }),
  });
  if (!r.ok) throw new Error(`vision HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}

// ---------- minimal MCP over stdio (newline-delimited JSON-RPC) ----------
const TOOLS = [
  { name: 'describe_image', description: 'Describe/read an image file with a local vision model (free, offline). Use for screenshots, diagrams, photos, OCR-style questions. Treat exact strings/numbers as unverified.', inputSchema: { type: 'object', properties: { image_path: { type: 'string', description: 'Absolute path to a png/jpg/webp/gif' }, prompt: { type: 'string', description: 'What to look for (default: full description)' } }, required: ['image_path'] } },
];
function mcp(): void {
  const send = (o: unknown): void => { process.stdout.write(JSON.stringify(o) + '\n'); };
  let buf = '';
  process.stdin.on('data', async (d: Buffer) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m: { id?: unknown; method: string; params?: Record<string, unknown> };
      try { m = JSON.parse(line); } catch { continue; }
      if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params?.protocolVersion as string) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'local-vision', version: '2.0.0' } } });
      else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
      else if (m.method === 'tools/call') {
        try {
          if (m.params!.name !== 'describe_image') throw new Error('unknown tool');
          send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: await describeImage((m.params!.arguments as DescribeArgs) || {}) }] } });
        } catch (e) { send({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: String((e as Error).message) }] } }); }
      } else if (m.id !== undefined && !m.method.startsWith('notifications/')) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
    }
  });
  process.on('exit', () => { if (proc) proc.kill(); });
  process.stdin.on('end', () => process.exit(0));
}

(async () => {
  const argv = process.argv.slice(2); const cmd = argv[0];
  const flag = (n: string): string | undefined => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const flags: SetupFlags = { backend: flag('backend'), tier: flag('tier'), force: argv.includes('--force') };
  try {
    if (cmd === 'preflight') {
      const hw = hardware(); const p = plan(hw, flags);
      console.log(argv.includes('--json') ? JSON.stringify({ hw, plan: p }, null, 2) : report(hw, p));
      process.exit(p.verdict === 'blocked' ? 3 : 0);
    } else if (cmd === 'setup') await setup(flags);
    else if (cmd === 'mcp') mcp();
    else if (cmd === 'stop') stop();
    else if (cmd === 'status') console.log(JSON.stringify(status(), null, 2));
    else { console.error('usage: node local-vision.js <preflight|setup|mcp|stop|status>'); process.exit(2); }
  } catch (e) { console.error((e as Error).message); process.exit(1); }
})();
