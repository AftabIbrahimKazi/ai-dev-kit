#!/usr/bin/env node
// Local media MCP server + installer for mcp-manager's `local-media` server. No dependencies.
//   node local-media.js setup [vision|image|all]   download binaries + models (resumable, skips what exists)
//   node local-media.js mcp                        stdio MCP server: describe_image, generate_image
//   node local-media.js stop                       stop an orphaned vision server
//   node local-media.js status                     what is installed
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

// Pinned for reproducibility. Models: licence + credit in mcp-manager's local-media.md.
const PKG = {
  llama: { repo: "ggml-org/llama.cpp", tag: "b11390", pick: { win32: /bin-win-cpu-x64\.zip$/, linux: /bin-ubuntu-x64\.zip$/, darwin: /bin-macos-arm64\.zip$/ }, dir: "llama" },
  sd: { repo: "leejet/stable-diffusion.cpp", tag: "master-929-3f8527a", pick: { win32: /bin-win-cpu-x64\.zip$/, linux: /bin-Linux-Ubuntu.*x86_64\.zip$/, darwin: /bin-Darwin.*arm64\.zip$/ }, dir: "sd" },
};
const MODELS = {
  vision: [
    { file: "qwen3vl-2b-instruct-q4_k_m.gguf", url: "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf", mb: 1107 },
    { file: "qwen3vl-2b-mmproj-q8_0.gguf", url: "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf", mb: 445 },
  ],
  image: [
    { file: "sdxs-512-q8_0.gguf", url: "https://huggingface.co/concedo/sdxs-512-tinySDdistilled-GGUF/resolve/main/sdxs-512-tinySDdistilled_Q8_0.gguf", mb: 683 },
  ],
};

const bin = (pkg, n) => {
  const root = path.join(HOME, "bin", PKG[pkg].dir);
  const direct = path.join(root, exe(n));
  if (fs.existsSync(direct)) return direct;
  const hit = fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).find((f) => path.basename(String(f)) === exe(n)) : null;
  return hit ? path.join(root, String(hit)) : null;
};
const model = (f) => path.join(HOME, "models", f);

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

async function installPkg(name) {
  if (bin(name, name === "llama" ? "llama-server" : "sd-cli")) return;
  const p = PKG[name]; const pick = p.pick[process.platform];
  if (!pick) throw new Error(`${name}: no prebuilt binary mapped for ${process.platform}; build from source`);
  const rel = await (await fetch(`https://api.github.com/repos/${p.repo}/releases/tags/${p.tag}`, { headers: { "User-Agent": "ai-dev-kit" } })).json();
  const asset = (rel.assets || []).find((a) => pick.test(a.name));
  if (!asset) throw new Error(`${name}: no matching asset in ${p.repo}@${p.tag}`);
  fs.mkdirSync(path.join(HOME, "bin", p.dir), { recursive: true });
  const zip = path.join(HOME, "bin", asset.name);
  console.error(`downloading ${asset.name} (${Math.round(asset.size / 1e6)} MB)`);
  await get(asset.browser_download_url, zip);
  const dest = path.join(HOME, "bin", p.dir);
  const r = win ? spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dest}'`], { stdio: "inherit" }) : spawnSync("unzip", ["-o", zip, "-d", dest], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`unzip failed for ${asset.name}`);
  fs.unlinkSync(zip);
}

async function setup(what) {
  const parts = what === "vision" ? ["vision"] : what === "image" ? ["image"] : ["vision", "image"];
  fs.mkdirSync(path.join(HOME, "models"), { recursive: true });
  for (const part of parts) {
    await installPkg(part === "vision" ? "llama" : "sd");
    for (const m of MODELS[part]) {
      if (fs.existsSync(model(m.file))) continue;
      console.error(`downloading ${m.file} (~${m.mb} MB)`);
      await get(m.url, model(m.file));
    }
  }
  console.error(`ready in ${HOME}`);
}

function stop() {
  const f = path.join(HOME, "vision.pid");
  if (!fs.existsSync(f)) return console.log("vision server not running (no pid file)");
  const pid = fs.readFileSync(f, "utf8").trim();
  if (win) spawnSync("taskkill", ["/F", "/T", "/PID", pid]); else { try { process.kill(Number(pid)); } catch {} }
  fs.unlinkSync(f); console.log("stopped");
}

function status() {
  const s = { home: HOME, llama: !!bin("llama", "llama-server"), sd: !!bin("sd", "sd-cli") };
  for (const part of Object.keys(MODELS)) for (const m of MODELS[part]) s[m.file] = fs.existsSync(model(m.file));
  return s;
}

// ---- vision server lifecycle (on demand, idle shutdown) ----
let visionProc = null, idleTimer = null;
async function visionUp() {
  try { return (await fetch(`http://127.0.0.1:${VISION_PORT}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
async function ensureVision() {
  if (!(await visionUp())) {
    const server = bin("llama", "llama-server");
    if (!server || !MODELS.vision.every((m) => fs.existsSync(model(m.file)))) throw new Error("vision not set up: run `node local-media.js setup vision`");
    visionProc = spawn(server, ["-m", model(MODELS.vision[0].file), "--mmproj", model(MODELS.vision[1].file), "--host", "127.0.0.1", "--port", VISION_PORT, "-c", "4096", "--no-webui"], { stdio: "ignore", windowsHide: true });
    fs.writeFileSync(path.join(HOME, "vision.pid"), String(visionProc.pid));
    const end = Date.now() + 180000;
    while (Date.now() < end && !(await visionUp())) await new Promise((r) => setTimeout(r, 1500));
    if (!(await visionUp())) throw new Error("vision server did not become ready in 180 s");
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (visionProc) visionProc.kill(); visionProc = null; }, IDLE_MS);
  idleTimer.unref();
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

function generateImage({ prompt, output_path, width = 512, height = 512, seed }) {
  const cli = bin("sd", "sd-cli");
  if (!cli || !fs.existsSync(model(MODELS.image[0].file))) throw new Error("image gen not set up: run `node local-media.js setup image`");
  if (!prompt) throw new Error("prompt required");
  const clamp = (v) => Math.min(768, Math.max(256, Math.round(Number(v) / 64) * 64));
  const out = path.resolve(output_path || path.join(HOME, "out", `img-${Date.now()}.png`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ["-M", "img_gen", "-m", model(MODELS.image[0].file), "-p", prompt, "--steps", "1", "--cfg-scale", "1", "-W", String(clamp(width)), "-H", String(clamp(height)), "-o", out];
  if (seed !== undefined) args.push("--seed", String(seed));
  const r = spawnSync(cli, args, { encoding: "utf8", timeout: 300000 });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`sd-cli failed: ${(r.stderr || r.stdout || "").slice(-300)}`);
  return out;
}

// ---- minimal MCP over stdio (newline-delimited JSON-RPC) ----
const TOOLS = [
  { name: "describe_image", description: "Describe/read an image file with a local vision model (free, offline, ~10-60 s on CPU). Use for screenshots, diagrams, photos, OCR-style questions.", inputSchema: { type: "object", properties: { image_path: { type: "string", description: "Absolute path to a png/jpg/webp/gif" }, prompt: { type: "string", description: "What to look for (default: full description)" } }, required: ["image_path"] } },
  { name: "generate_image", description: "Generate a 512px-class image from a text prompt with a local fast diffusion model (free, offline, ~10 s on CPU). Draft quality: mockups, placeholders, concepts. Returns the saved file path.", inputSchema: { type: "object", properties: { prompt: { type: "string" }, output_path: { type: "string", description: "Where to save the PNG (default: media home)" }, width: { type: "number", description: "256-768, multiple of 64 (default 512)" }, height: { type: "number" }, seed: { type: "number" } }, required: ["prompt"] } },
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
      if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "local-media", version: "1.0.0" } } });
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
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === "setup") await setup(arg || "all");
    else if (cmd === "mcp") mcp();
    else if (cmd === "stop") stop();
    else if (cmd === "status") console.log(JSON.stringify(status(), null, 2));
    else { console.error("usage: node local-media.js <setup [vision|image|all]|mcp|stop|status>"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
})();
