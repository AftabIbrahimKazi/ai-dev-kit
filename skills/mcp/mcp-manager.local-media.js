#!/usr/bin/env node
// Local media MCP server + installer for mcp-manager's `local-media` server. No dependencies.
//   node local-media.js preflight [--json]                       detect hardware, print the install plan (no changes)
//   node local-media.js setup [vision|image|all] [--backend cpu|cuda|vulkan|metal] [--tier 2b|4b] [--image-model sdturbo|sdxs] [--accept-license] [--force]
//   node local-media.js mcp                                      stdio MCP server: describe_image, generate_image
//   node local-media.js stop | status
// Everything lives in MEDIA_HOME (default ~/.ai-dev-kit/media), shared across projects.
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");

const HOME = process.env.MEDIA_HOME || path.join(os.homedir(), ".ai-dev-kit", "media");
const win = process.platform === "win32";
const exe = (n) => n + (win ? ".exe" : "");
const VISION_PORT = process.env.MEDIA_VISION_PORT || "8081";
const IDLE_MS = Number(process.env.MEDIA_IDLE_SECONDS || 600) * 1000;

// Pinned for reproducibility. Credits + licences: mcp-manager's local-media.md.
// extra = runtime DLL zip the GPU build needs (CUDA).
const PKG = {
  llama: {
    repo: "ggml-org/llama.cpp", tag: "b11390", check: "llama-server",
    pick: {
      win32: { cpu: /bin-win-cpu-x64\.zip$/, vulkan: /bin-win-vulkan-x64\.zip$/, cuda: /bin-win-cuda-12\.4-x64\.zip$/ },
      linux: { cpu: /bin-ubuntu-x64\.zip$/, vulkan: /bin-ubuntu-vulkan-x64\.zip$/ },
      darwin: { metal: /bin-macos-arm64\.zip$/ },
    },
    extra: { win32: { cuda: /^cudart-llama-bin-win-cuda-12\.4-x64\.zip$/ } },
  },
  sd: {
    repo: "leejet/stable-diffusion.cpp", tag: "master-929-3f8527a", check: "sd-cli",
    pick: {
      win32: { cpu: /bin-win-cpu-x64\.zip$/, vulkan: /bin-win-vulkan-x64\.zip$/, cuda: /bin-win-cuda12-x64\.zip$/ },
      linux: { cpu: /bin-Linux-Ubuntu.*x86_64\.zip$/ },
      darwin: { metal: /bin-Darwin.*arm64\.zip$/ },
    },
    extra: { win32: { cuda: /^cudart-sd-bin-win-cu12-x64\.zip$/ } },
  },
};
const HF = "https://huggingface.co/Qwen";
const MODELS = {
  vision2b: [
    { file: "qwen3vl-2b-instruct-q4_k_m.gguf", url: `${HF}/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf`, mb: 1107 },
    { file: "qwen3vl-2b-mmproj-q8_0.gguf", url: `${HF}/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf`, mb: 445 },
  ],
  vision4b: [
    { file: "qwen3vl-4b-instruct-q4_k_m.gguf", url: `${HF}/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf`, mb: 2497 },
    { file: "qwen3vl-4b-mmproj-q8_0.gguf", url: `${HF}/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf`, mb: 454 },
  ],
  // sdturbo: far better for business/SaaS imagery (clean illustration, stock-style photos); Stability Community License
  // (free under US$1M annual revenue, needs --accept-license). sdxs: lighter, faster drafts, OpenRAIL++.
  imagesdturbo: [
    { file: "sd-turbo-f16-q8_0.gguf", url: "https://huggingface.co/Green-Sky/SD-Turbo-GGUF/resolve/main/sd_turbo-f16-q8_0.gguf", mb: 2024 },
    { file: "taesd.safetensors", url: "https://huggingface.co/madebyollin/taesd/resolve/main/diffusion_pytorch_model.safetensors", mb: 10 },
  ],
  imagesdxs: [
    { file: "sdxs-512-q8_0.gguf", url: "https://huggingface.co/concedo/sdxs-512-tinySDdistilled-GGUF/resolve/main/sdxs-512-tinySDdistilled_Q8_0.gguf", mb: 683 },
  ],
};
const STYLES = {
  "saas-illustration": "flat vector illustration, clean minimal style, soft pastel gradient background, lots of white space",
  "isometric": "isometric illustration, soft shadows, clean vector style, white background",
  "business-photo": "professional stock photo, bright modern office, natural window light, candid, shallow depth of field",
  "icon-3d": "minimal 3D rendered icon, glossy, soft studio lighting, pastel gradient background",
  "gradient-bg": "abstract smooth gradient background, soft colors, minimal, no objects",
  "product-mockup": "product shot, clean white desk, soft daylight, minimal",
};
const RUNTIME_MB = { cpu: 50, vulkan: 65, metal: 50, cuda: 1550 };

// ---------- hardware detection + plan ----------
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true }); return r.status === 0 ? String(r.stdout).trim() : ""; };

function detectGpus() {
  const gpus = [];
  for (const l of sh("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]).split("\n").filter(Boolean)) {
    const [name, mb] = l.split(",").map((s) => s.trim());
    gpus.push({ name, vendor: "nvidia", vramGB: Math.round(Number(mb) / 1024), discrete: true });
  }
  if (!gpus.length) {
    const names = win ? sh("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController).Name -join '|'"]).split("|")
      : process.platform === "linux" ? sh("sh", ["-c", "lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/.*: //'"]).split("\n") : [];
    for (const n of names.map((s) => s.trim()).filter(Boolean)) {
      const vendor = /nvidia/i.test(n) ? "nvidia" : /amd|radeon|advanced micro/i.test(n) ? "amd" : /intel/i.test(n) ? "intel" : "other";
      const integrated = /radeon\s*\(tm\)\s*graphics|radeon graphics|vega \d|uhd|iris|hd graphics|intel\(r\) graphics|arc\(tm\) graphics|basic display|remote|virtual/i.test(n);
      gpus.push({ name: n, vendor, vramGB: null, discrete: !integrated });
    }
  }
  return gpus;
}

function hardware() {
  if (process.env.MEDIA_FAKE_HW) return JSON.parse(process.env.MEDIA_FAKE_HW); // test hook: simulate other machines
  let dir = HOME; while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let freeDiskGB = null; try { const s = fs.statfsSync(dir); freeDiskGB = (s.bavail * s.bsize) / 1e9; } catch {}
  return { platform: process.platform, arch: process.arch, cores: os.cpus().length, ramGB: os.totalmem() / 1e9, freeDiskGB, gpus: detectGpus() };
}

function plan(hw, over = {}) {
  if (!PKG.llama.pick[hw.platform]) return { backend: "none", tier: "2b", needMB: 0, verdict: "blocked", expected: "n/a", warnings: [`no prebuilt binaries mapped for ${hw.platform}; build llama.cpp and stable-diffusion.cpp from source`] };
  const gpu = hw.gpus.find((g) => g.vendor === "nvidia" && (g.vramGB || 0) >= 4) || hw.gpus.find((g) => g.discrete && g.vendor !== "nvidia" && g.vendor !== "other");
  let backend = hw.platform === "darwin" && hw.arch === "arm64" ? "metal"
    : gpu && gpu.vendor === "nvidia" && win ? "cuda" : gpu && hw.platform !== "darwin" ? "vulkan" : "cpu";
  const avail = PKG.llama.pick[hw.platform] || {};
  if (!avail[backend]) backend = avail.cpu ? "cpu" : Object.keys(avail)[0];
  if (over.backend) backend = over.backend;
  const big = (gpu && gpu.vramGB >= 6) || (backend === "metal" && hw.ramGB >= 16);
  const tier = over.tier || (big ? "4b" : "2b");
  const needMB = MODELS["vision" + tier].reduce((a, m) => a + m.mb, 0) + MODELS["image" + (over.imageModel || "sdturbo")].reduce((a, m) => a + m.mb, 0) + RUNTIME_MB[backend];
  const warnings = []; let verdict = "ok";
  if (!PKG.llama.pick[hw.platform]) { verdict = "blocked"; warnings.push(`no prebuilt binaries mapped for ${hw.platform}`); }
  else if (hw.platform !== "win32") warnings.push(`${hw.platform} is mapped but untested`);
  if (hw.freeDiskGB !== null && hw.freeDiskGB * 1000 < needMB * 1.2) { verdict = "blocked"; warnings.push(`needs ~${(needMB * 1.2 / 1000).toFixed(1)} GB free, only ${hw.freeDiskGB.toFixed(1)} GB available`); }
  if (hw.ramGB < 4) { verdict = "blocked"; warnings.push(`${hw.ramGB.toFixed(1)} GB RAM is too low for the vision model (needs ~2.5 GB free)`); }
  else if (hw.ramGB < 8 && verdict === "ok") { verdict = "slow"; warnings.push("under 8 GB RAM: close other apps; vision and image generation will not run together comfortably"); }
  if (hw.cores < 4 && verdict === "ok") { verdict = "slow"; warnings.push(`only ${hw.cores} CPU threads: expect 2-3x the CPU timings below`); }
  if (backend === "cpu" && hw.gpus.some((g) => g.vendor === "nvidia")) warnings.push("an NVIDIA GPU with under 4 GB VRAM was found; CPU is the safer choice");
  const expected = backend === "cpu"
    ? "CPU (measured on 8 cores/16 threads): image ~6 s, vision ~7-12 s per image"
    : backend === "cuda" ? "CUDA GPU: expect image ~1-2 s, vision ~1-3 s (untested here)"
      : backend === "vulkan" ? "Vulkan GPU: expect a clear speed-up over CPU (untested here); falls back to CPU if it fails the self-test"
        : "Apple Metal: expect a clear speed-up over CPU (untested here)";
  const imageModel = over.imageModel || "sdturbo";
  if (imageModel === "sdturbo") warnings.push("SD-Turbo uses the Stability AI Community License: free for individuals/orgs under US$1M annual revenue, attribution required when distributing; pass --accept-license to confirm");
  return { backend, tier, imageModel, needMB, verdict, warnings, expected };
}

function report(hw, p) {
  const g = hw.gpus.length ? hw.gpus.map((x) => `${x.name}${x.vramGB ? ` ${x.vramGB} GB` : ""}${x.discrete ? "" : " (integrated)"}`).join("; ") : "none detected";
  return [`Hardware: ${hw.cores} threads, ${hw.ramGB.toFixed(1)} GB RAM, ${hw.freeDiskGB === null ? "disk ?" : hw.freeDiskGB.toFixed(1) + " GB free"}, GPU: ${g}`,
    `Plan: backend=${p.backend}, vision=Qwen3-VL-${p.tier.toUpperCase()}, image=${p.imageModel === "sdxs" ? "SDXS-512" : "SD-Turbo+TAESD"}, download ~${(p.needMB / 1000).toFixed(1)} GB`,
    `Expect: ${p.expected}`, `Verdict: ${p.verdict}`, ...p.warnings.map((w) => `  ! ${w}`)].join("\n");
}

// ---------- state, paths, download ----------
const stateFile = path.join(HOME, "state.json");
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return { backend: "cpu", tier: "2b", imageModel: "sdturbo" }; } };
const model = (f) => path.join(HOME, "models", f);
const binDir = (pkg, backend) => path.join(HOME, "bin", `${pkg}-${backend}`);
const findBin = (pkg, backend, n) => {
  const root = binDir(pkg, backend);
  if (!fs.existsSync(root)) return null;
  const hit = fs.readdirSync(root, { recursive: true }).find((f) => path.basename(String(f)) === exe(n));
  return hit ? path.join(root, String(hit)) : null;
};
const visionFiles = (st) => MODELS["vision" + st.tier];

function get(url, dest, redirects = 8) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "ai-dev-kit" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirects > 0) { res.resume(); return resolve(get(new URL(res.headers.location, url).href, dest, redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const total = Number(res.headers["content-length"] || 0); let got = 0, last = 0;
      const tmp = dest + ".part"; const out = fs.createWriteStream(tmp);
      res.on("data", (c) => { got += c.length; if (total && Date.now() - last > 5000) { last = Date.now(); process.stderr.write(`  ${path.basename(dest)} ${Math.round((got / total) * 100)}%\n`); } });
      res.pipe(out);
      out.on("finish", () => { fs.renameSync(tmp, dest); resolve(); });
      out.on("error", reject);
    }).on("error", reject);
  });
}

async function installPkg(name, backend) {
  const p = PKG[name]; if (findBin(name, backend, p.check)) return;
  const rel = await (await fetch(`https://api.github.com/repos/${p.repo}/releases/tags/${p.tag}`, { headers: { "User-Agent": "ai-dev-kit" } })).json();
  const want = [p.pick[process.platform]?.[backend], p.extra?.[process.platform]?.[backend]].filter(Boolean);
  if (!want.length) throw new Error(`${name}: no ${backend} build mapped for ${process.platform}`);
  const dest = binDir(name, backend); fs.mkdirSync(dest, { recursive: true });
  for (const re of want) {
    const asset = (rel.assets || []).find((a) => re.test(a.name));
    if (!asset) throw new Error(`${name}: no asset matching ${re} in ${p.repo}@${p.tag}`);
    const zip = path.join(HOME, "bin", asset.name);
    console.error(`downloading ${asset.name} (${Math.round(asset.size / 1e6)} MB)`);
    await get(asset.browser_download_url, zip);
    const r = win ? spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dest}'`], { stdio: "inherit" }) : spawnSync("unzip", ["-o", zip, "-d", dest], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`unzip failed for ${asset.name}`);
    fs.unlinkSync(zip);
  }
}

// A GPU build that cannot load (driver/DLL) is replaced by the CPU build instead of failing later.
function selfTest(name, backend) {
  const b = findBin(name, backend, PKG[name].check);
  if (!b) return false;
  const r = spawnSync(b, ["--help"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  return !r.error && (String(r.stdout) + String(r.stderr)).length > 100;
}

async function setup(what, flags) {
  const hw = hardware(); const p = plan(hw, { backend: flags.backend, tier: flags.tier, imageModel: flags.imageModel });
  console.error(report(hw, p));
  if (p.imageModel === "sdturbo" && what !== "vision" && !flags.accept) { console.error("SD-Turbo needs licence acceptance (Stability AI Community License, https://stability.ai/license). Re-run with --accept-license, or use --image-model sdxs."); process.exit(4); }
  if (p.verdict === "blocked" && !flags.force) { console.error("Blocked. Fix the above or pass --force."); process.exit(3); }
  const parts = what === "vision" ? ["vision"] : what === "image" ? ["image"] : ["vision", "image"];
  fs.mkdirSync(path.join(HOME, "models"), { recursive: true });
  let backend = p.backend;
  for (const part of parts) {
    const pkg = part === "vision" ? "llama" : "sd";
    await installPkg(pkg, backend);
    if (backend !== "cpu" && !selfTest(pkg, backend)) {
      console.error(`${pkg} ${backend} build failed its self-test; falling back to CPU`);
      backend = "cpu"; await installPkg("llama", "cpu"); await installPkg("sd", "cpu");
    }
    for (const m of part === "vision" ? MODELS["vision" + p.tier] : MODELS["image" + p.imageModel]) {
      if (fs.existsSync(model(m.file))) continue;
      console.error(`downloading ${m.file} (~${m.mb} MB)`);
      await get(m.url, model(m.file));
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify({ backend, tier: p.tier, imageModel: p.imageModel }));
  console.error(`ready in ${HOME} (backend=${backend}, vision=${p.tier}, image=${p.imageModel})`);
}

function status() {
  const st = readState(); const s = { home: HOME, ...st, llama: !!findBin("llama", st.backend, "llama-server"), sd: !!findBin("sd", st.backend, "sd-cli") };
  for (const m of [...visionFiles(st), ...MODELS["image" + st.imageModel]]) s[m.file] = fs.existsSync(model(m.file));
  return s;
}

// ---------- vision server lifecycle (on demand, idle shutdown) ----------
let visionProc = null, idleTimer = null;
const visionUp = async () => { try { return (await fetch(`http://127.0.0.1:${VISION_PORT}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
async function ensureVision() {
  if (!(await visionUp())) {
    const st = readState(); const server = findBin("llama", st.backend, "llama-server"); const [m, proj] = visionFiles(st);
    if (!server || !fs.existsSync(model(m.file)) || !fs.existsSync(model(proj.file))) throw new Error("vision not set up: run `node local-media.js setup vision`");
    const args = ["-m", model(m.file), "--mmproj", model(proj.file), "--host", "127.0.0.1", "--port", VISION_PORT, "-c", "4096", "--no-webui"];
    if (st.backend !== "cpu") args.push("-ngl", "99");
    visionProc = spawn(server, args, { stdio: "ignore", windowsHide: true });
    fs.writeFileSync(path.join(HOME, "vision.pid"), String(visionProc.pid));
    const end = Date.now() + 180000;
    while (Date.now() < end && !(await visionUp())) await new Promise((r) => setTimeout(r, 1500));
    if (!(await visionUp())) throw new Error("vision server did not become ready in 180 s");
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (visionProc) visionProc.kill(); visionProc = null; }, IDLE_MS);
  idleTimer.unref();
}

function stop() {
  const f = path.join(HOME, "vision.pid");
  if (!fs.existsSync(f)) return console.log("vision server not running (no pid file)");
  const pid = fs.readFileSync(f, "utf8").trim();
  if (win) spawnSync("taskkill", ["/F", "/T", "/PID", pid]); else { try { process.kill(Number(pid)); } catch {} }
  fs.unlinkSync(f); console.log("stopped");
}

async function describeImage({ image_path, prompt }) {
  if (!image_path || !fs.existsSync(image_path)) throw new Error(`image not found: ${image_path}`);
  const ext = path.extname(image_path).slice(1).toLowerCase().replace("jpg", "jpeg");
  if (!["png", "jpeg", "webp", "gif"].includes(ext)) throw new Error("unsupported image type (png/jpg/webp/gif)");
  await ensureVision();
  const b64 = fs.readFileSync(image_path).toString("base64");
  const r = await fetch(`http://127.0.0.1:${VISION_PORT}/v1/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_tokens: 500, temperature: 0.2, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/${ext};base64,${b64}` } }, { type: "text", text: prompt || "Describe this image in detail, including any visible text." }] }] }),
  });
  if (!r.ok) throw new Error(`vision HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}

function generateImage({ prompt, style, quality = "fast", output_path, width = 512, height = 512, seed }) {
  const st = readState(); const cli = findBin("sd", st.backend, "sd-cli"); const files = MODELS["image" + st.imageModel];
  if (!cli || !files.every((m) => fs.existsSync(model(m.file)))) throw new Error("image gen not set up: run `node local-media.js setup image`");
  if (!prompt) throw new Error("prompt required");
  if (style && !STYLES[style]) throw new Error(`unknown style "${style}"; use one of: ${Object.keys(STYLES).join(", ")}`);
  if (style) prompt = `${prompt}, ${STYLES[style]}`;
  const clamp = (v) => Math.min(768, Math.max(256, Math.round(Number(v) / 64) * 64));
  const out = path.resolve(output_path || path.join(HOME, "out", `img-${Date.now()}.png`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ["-M", "img_gen", "-m", model(files[0].file), "-p", prompt, "--steps", st.imageModel === "sdxs" ? "1" : quality === "best" ? "4" : "2", "--cfg-scale", "1", "-W", String(clamp(width)), "-H", String(clamp(height)), "-o", out];
  if (st.imageModel === "sdturbo") args.push("--taesd", model("taesd.safetensors"));
  if (seed !== undefined) args.push("--seed", String(seed));
  const r = spawnSync(cli, args, { encoding: "utf8", timeout: 300000 });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`sd-cli failed: ${(r.stderr || r.stdout || "").slice(-300)}`);
  return out;
}

// ---------- minimal MCP over stdio (newline-delimited JSON-RPC) ----------
const TOOLS = [
  { name: "describe_image", description: "Describe/read an image file with a local vision model (free, offline). Use for screenshots, diagrams, photos, OCR-style questions. Treat exact strings/numbers as unverified.", inputSchema: { type: "object", properties: { image_path: { type: "string", description: "Absolute path to a png/jpg/webp/gif" }, prompt: { type: "string", description: "What to look for (default: full description)" } }, required: ["image_path"] } },
  { name: "generate_image", description: "Generate a 512px-class image locally (free, offline, ~14 s fast / ~26 s best on CPU). Suited to SaaS/business sites via `style` presets: saas-illustration, isometric, business-photo, icon-3d, gradient-bg, product-mockup. Text inside images is unreliable; use drafts/placeholders, not final art. Returns the saved file path.", inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Subject and setting; the style preset adds the look" }, style: { type: "string", enum: Object.keys(STYLES) }, quality: { type: "string", enum: ["fast", "best"], description: "fast = 2 steps, best = 4 steps (default fast)" }, output_path: { type: "string", description: "Where to save the PNG (default: media home)" }, width: { type: "number", description: "256-768, multiple of 64 (default 512)" }, height: { type: "number" }, seed: { type: "number" } }, required: ["prompt"] } },
];
function mcp() {
  const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  let buf = "";
  process.stdin.on("data", async (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "local-media", version: "1.1.0" } } });
      else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } });
      else if (m.method === "tools/call") {
        try {
          const a = m.params.arguments || {};
          const text = m.params.name === "describe_image" ? await describeImage(a) : m.params.name === "generate_image" ? generateImage(a) : (() => { throw new Error("unknown tool"); })();
          send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text }] } });
        } catch (e) { send({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: String(e.message) }] } }); }
      } else if (m.id !== undefined && !m.method.startsWith("notifications/")) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
    }
  });
  process.on("exit", () => { if (visionProc) visionProc.kill(); });
  process.stdin.on("end", () => process.exit(0));
}

(async () => {
  const argv = process.argv.slice(2); const cmd = argv[0];
  const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const flags = { backend: flag("backend"), tier: flag("tier"), imageModel: flag("image-model"), force: argv.includes("--force"), accept: argv.includes("--accept-license") };
  try {
    if (cmd === "preflight") {
      const hw = hardware(); const p = plan(hw, flags);
      console.log(argv.includes("--json") ? JSON.stringify({ hw, plan: p }, null, 2) : report(hw, p));
      process.exit(p.verdict === "blocked" ? 3 : 0);
    } else if (cmd === "setup") await setup(["vision", "image", "all"].includes(argv[1]) ? argv[1] : "all", flags);
    else if (cmd === "mcp") mcp();
    else if (cmd === "stop") stop();
    else if (cmd === "status") console.log(JSON.stringify(status(), null, 2));
    else { console.error("usage: node local-media.js <preflight|setup [vision|image|all]|mcp|stop|status>"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
})();
