#!/usr/bin/env node
// Local Laya provider control for system1-prefilter. No dependencies.
// Usage: node laya-ctl.js <setup|start|stop|health|status>
// Everything lives in LAYA_HOME (default ~/.ai-dev-kit/laya), shared across projects.
// Env: LAYA_HOME, LAYA_PYTHON (python >=3.10), LAYA_PORT (8000), LAYA_MODELS (typed-decisions).
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = process.env.LAYA_HOME || path.join(os.homedir(), ".ai-dev-kit", "laya");
const port = process.env.LAYA_PORT || "8000";
const models = process.env.LAYA_MODELS || "typed-decisions";
const win = process.platform === "win32";
const venvBin = (n) => path.join(home, "venv", win ? "Scripts" : "bin", n + (win ? ".exe" : ""));
const pidFile = path.join(home, "serve.pid");
const base = `http://127.0.0.1:${port}`;

function findPython() {
  const cands = process.env.LAYA_PYTHON ? [[process.env.LAYA_PYTHON]] : [["python3"], ["python"], ["py", "-3"]];
  for (const [cmd, ...pre] of cands) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print(sys.version_info[0]*100+sys.version_info[1])"], { encoding: "utf8" });
    if (r.status === 0 && Number(r.stdout) >= 310) return [cmd, ...pre];
  }
  return null;
}

async function health() {
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function setup() {
  const py = findPython();
  if (!py) { console.error("No Python >=3.10 found. Install one or set LAYA_PYTHON."); process.exit(2); }
  fs.mkdirSync(home, { recursive: true });
  const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status !== 0) process.exit(r.status || 1); };
  if (!fs.existsSync(venvBin("python"))) run(py[0], [...py.slice(1), "-m", "venv", path.join(home, "venv")]);
  run(venvBin("python"), ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvBin("python"), ["-m", "pip", "install", "laya[serve]"]);
  console.log(`Installed in ${home}. Weights download from Hugging Face on first start (~1 GB).`);
}

async function start() {
  if (await health()) { console.log("already running"); return; }
  if (!fs.existsSync(venvBin("laya-serve"))) { console.error("Not set up. Run: node laya-ctl.js setup"); process.exit(2); }
  const env = { ...process.env, LAYA_HOST: "127.0.0.1", LAYA_PORT: port, LAYA_MODELS: models, LAYA_DEFAULT_MODEL: models.split(",")[0], LAYA_IDLE_UNLOAD_SECONDS: process.env.LAYA_IDLE_UNLOAD_SECONDS || "600" };
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
  if (cmd === "setup") await setup();
  else if (cmd === "start") await start();
  else if (cmd === "stop") stop();
  else if (cmd === "health" || cmd === "status") {
    const h = await health();
    console.log(h ? `ok: ${JSON.stringify(h.loaded)} on ${h.device}` : "server not running");
    process.exit(h ? 0 : 1);
  } else { console.error("usage: node laya-ctl.js <setup|start|stop|health>"); process.exit(2); }
})();
