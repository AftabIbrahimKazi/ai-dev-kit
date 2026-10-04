#!/usr/bin/env node
// Local Laya provider control for system1-prefilter. No dependencies.
// Usage: node laya-ctl.js <preflight|setup|start|stop|health|status>   (setup/preflight accept --force)
// Everything lives in LAYA_HOME (default ~/.ai-dev-kit/laya), shared across projects.
// Env: LAYA_HOME, LAYA_PYTHON (python >=3.10), LAYA_PORT (8000), LAYA_MODELS (english).
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = process.env.LAYA_HOME || path.join(os.homedir(), ".ai-dev-kit", "laya");
const port = process.env.LAYA_PORT || "8000";
const models = process.env.LAYA_MODELS || "english"; // measured: english separates relevant/irrelevant candidates better than typed-decisions
const win = process.platform === "win32";
const venvBin = (n) => path.join(home, "venv", win ? "Scripts" : "bin", n + (win ? ".exe" : ""));
const pidFile = path.join(home, "serve.pid");
const base = `http://127.0.0.1:${port}`;

// ---- hardware check (preflight runs automatically before setup) ----
function hardware() {
  if (process.env.LAYA_FAKE_HW) return JSON.parse(process.env.LAYA_FAKE_HW); // test hook
  let dir = home; while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let freeDiskGB = null; try { const s = fs.statfsSync(dir); freeDiskGB = (s.bavail * s.bsize) / 1e9; } catch {}
  const r = spawnSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 15000, windowsHide: true });
  const [name, mb] = r.status === 0 ? String(r.stdout).split(/\r?\n/)[0].split(",").map((x) => x.trim()) : [];
  return { cores: os.cpus().length, ramGB: os.totalmem() / 1e9, freeDiskGB, nvidia: name ? { name, vramGB: Math.round(Number(mb) / 1024) } : null };
}
function plan(hw) {
  const cuda = !!(hw.nvidia && hw.nvidia.vramGB >= 2) && process.platform !== "darwin";
  const needGB = cuda ? 5.5 : 2.2; const warnings = []; let verdict = "ok";
  if (hw.freeDiskGB !== null && hw.freeDiskGB < needGB * 1.2) { verdict = "blocked"; warnings.push(`needs ~${(needGB * 1.2).toFixed(1)} GB free, only ${hw.freeDiskGB.toFixed(1)} GB available`); }
  if (hw.ramGB < 4) { verdict = "blocked"; warnings.push(`${hw.ramGB.toFixed(1)} GB RAM is too low (model needs ~2.5 GB)`); }
  else if (hw.ramGB < 6 && verdict === "ok") { verdict = "slow"; warnings.push("under 6 GB RAM: close other apps while it runs"); }
  if (hw.nvidia && !cuda) warnings.push("NVIDIA GPU under 2 GB VRAM: using CPU");
  return { device: cuda ? "cuda" : "cpu", needGB, verdict, warnings, expected: cuda ? "CUDA GPU: ~30 ms per decision (model card; untested here), ~2.5 GB extra download for CUDA torch" : "CPU (measured on 8 cores): 0.4-2.5 s per decision" };
}
function preflight() {
  const hw = hardware(); const p = plan(hw);
  console.log([`Hardware: ${hw.cores} threads, ${hw.ramGB.toFixed(1)} GB RAM, ${hw.freeDiskGB === null ? "disk ?" : hw.freeDiskGB.toFixed(1) + " GB free"}, GPU: ${hw.nvidia ? `${hw.nvidia.name} ${hw.nvidia.vramGB} GB` : "no NVIDIA GPU"}`,
    `Plan: device=${p.device}, download ~${p.needGB.toFixed(1)} GB`, `Expect: ${p.expected}`, `Verdict: ${p.verdict}`, ...p.warnings.map((w) => `  ! ${w}`)].join("\n"));
  return p;
}

function findPython() {
  const cands = process.env.LAYA_PYTHON ? [[process.env.LAYA_PYTHON]] : [["py", "-3.12"], ["py", "-3.11"], ["py", "-3.13"], ["py", "-3.10"], ["python3"], ["python"], ["py", "-3"]];
  const found = [];
  for (const [cmd, ...pre] of cands) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print(sys.version_info[0]*100+sys.version_info[1])"], { encoding: "utf8" });
    if (r.status === 0 && Number(r.stdout) >= 310) found.push({ py: [cmd, ...pre], v: Number(r.stdout) });
  }
  // torch wheels lag new Pythons: prefer 3.10-3.13, fall back to anything >= 3.10
  const best = found.find((f) => f.v <= 313) || found[0];
  return best ? best.py : null;
}

async function health() {
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function setup() {
  const pf = preflight();
  if (pf.verdict === "blocked" && !process.argv.includes("--force")) { console.error("Blocked. Fix the above or pass --force."); process.exit(3); }
  const py = findPython();
  if (!py) { console.error("No Python >=3.10 found. Install one or set LAYA_PYTHON."); process.exit(2); }
  fs.mkdirSync(home, { recursive: true });
  const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status !== 0) process.exit(r.status || 1); };
  if (!fs.existsSync(venvBin("python"))) run(py[0], [...py.slice(1), "-m", "venv", path.join(home, "venv")]);
  run(venvBin("python"), ["-m", "pip", "install", "--upgrade", "pip"]);
  if (pf.device === "cuda") run(venvBin("python"), ["-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cu124"]);
  run(venvBin("python"), ["-m", "pip", "install", "laya[serve]"]);
  let device = "cpu";
  if (pf.device === "cuda") {
    const t = spawnSync(venvBin("python"), ["-c", "import torch;print(torch.cuda.is_available())"], { encoding: "utf8" });
    if (String(t.stdout).trim() === "True") device = "cuda"; else console.error("CUDA torch installed but no usable GPU/driver; using CPU");
  }
  fs.writeFileSync(path.join(home, "device.txt"), device);
  console.log(`Installed in ${home} (device=${device}). Weights download from Hugging Face on first start (~1 GB).`);
}

async function start() {
  if (await health()) { console.log("already running"); return; }
  if (!fs.existsSync(venvBin("laya-serve"))) { console.error("Not set up. Run: node laya-ctl.js setup"); process.exit(2); }
  const env = { ...process.env, LAYA_HOST: "127.0.0.1", LAYA_PORT: port, LAYA_DEVICE: (() => { try { return fs.readFileSync(path.join(home, "device.txt"), "utf8").trim(); } catch { return "cpu"; } })(), LAYA_MODELS: models, LAYA_DEFAULT_MODEL: models.split(",")[0], LAYA_IDLE_UNLOAD_SECONDS: process.env.LAYA_IDLE_UNLOAD_SECONDS || "600" };
  const log = fs.openSync(path.join(home, "serve.log"), "a");
  const child = spawn(venvBin("laya-serve"), [], { env, detached: true, stdio: ["ignore", log, log], windowsHide: true });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const h = await health();
    if (h) { console.log(`ready: ${JSON.stringify(h.loaded)} on ${h.device}`); return; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.error(`Not ready after 10 min. See ${path.join(home, "serve.log")}`);
  process.exit(1);
}

function stop() {
  if (!fs.existsSync(pidFile)) { console.log("not running (no pid file)"); return; }
  const pid = fs.readFileSync(pidFile, "utf8").trim();
  if (win) spawnSync("taskkill", ["/F", "/T", "/PID", pid]);
  else { try { process.kill(-Number(pid)); } catch { try { process.kill(Number(pid)); } catch {} } }
  fs.unlinkSync(pidFile);
  console.log("stopped");
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === "preflight") process.exit(preflight().verdict === "blocked" ? 3 : 0);
  else if (cmd === "setup") await setup();
  else if (cmd === "start") await start();
  else if (cmd === "stop") stop();
  else if (cmd === "health" || cmd === "status") {
    const h = await health();
    console.log(h ? `ok: ${JSON.stringify(h.loaded)} on ${h.device}` : "server not running");
    process.exit(h ? 0 : 1);
  } else { console.error("usage: node laya-ctl.js <preflight|setup|start|stop|health>"); process.exit(2); }
})();
