#!/usr/bin/env node
// Image generation with provider fallback, as a CLI and a stdio MCP server. No dependencies.
//   node image-gen.js generate "<prompt>" [--out file] [--style preset] [--aspect 16:9]
//   node image-gen.js status      configured providers, today's usage, cooldowns
//   node image-gen.js reset       clear cooldowns (e.g. after enabling billing)
//   node image-gen.js mcp         stdio MCP server exposing generate_image
// Chain (IMAGE_PROVIDERS, default "gemini,cloudflare"): Gemini "Nano Banana" -> Cloudflare Workers AI FLUX.1 [schnell].
// A provider is skipped when its key is missing, its daily cap is reached, or it is cooling down after a quota/auth error.
// Keys come from the environment or the project's .env (only the names below are read). Never written anywhere.
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = process.env.IMAGE_GEN_HOME || path.join(os.homedir(), ".ai-dev-kit", "image-gen");
const LEDGER = path.join(HOME, "usage.json");
const KEYS = ["GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
const GEMINI_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
const CF_BASE = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com";
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const CAPS = { gemini: Number(process.env.GEMINI_DAILY_CAP || 10), cloudflare: Number(process.env.CLOUDFLARE_DAILY_CAP || 150) };
const STYLES = {
  "saas-illustration": "flat vector illustration, clean minimal style, soft pastel gradient background, lots of white space",
  "isometric": "isometric illustration, soft shadows, clean vector style, white background",
  "business-photo": "professional stock photo, bright modern office, natural window light, candid, shallow depth of field",
  "icon-3d": "minimal 3D rendered icon, glossy, soft studio lighting, pastel gradient background",
  "product-mockup": "product shot, clean white desk, soft daylight, minimal",
};
const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

// Fill missing keys from ./.env (whitelisted names only).
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && KEYS.includes(m[1]) && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
})();

const today = () => new Date().toISOString().slice(0, 10);
const readLedger = () => { try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch { return {}; } };
const writeLedger = (l) => { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); };
const configured = (p) => p === "gemini" ? !!process.env.GEMINI_API_KEY : !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

class ProviderError extends Error { constructor(msg, status, cooldownSec) { super(msg); this.status = status; this.cooldownSec = cooldownSec; } }

async function viaGemini(prompt, aspect) {
  const r = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } } }),
    signal: AbortSignal.timeout(180000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const retry = JSON.stringify(d).match(/"retryDelay"\s*:\s*"(\d+)s"/);
    throw new ProviderError(`${r.status} ${d.error?.status || ""} ${String(d.error?.message || "").slice(0, 120)}`.trim(), r.status, [401, 403, 429].includes(r.status) ? Number(retry?.[1] || 3600) : 0);
  }
  const part = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw new ProviderError("no image in response (possibly blocked by safety filters)", 200, 0);
  return { data: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType || "image/png", model: GEMINI_MODEL };
}

async function viaCloudflare(prompt) {
  const r = await fetch(`${CF_BASE}/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 }), signal: AbortSignal.timeout(120000),
  });
  const d = await r.json().catch(() => ({}));
  const b64 = d.result?.image || d.image;
  if (!r.ok || !b64) throw new ProviderError(`${r.status} ${JSON.stringify(d.errors || d).slice(0, 140)}`, r.status, [401, 403, 429].includes(r.status) ? 3600 : 0);
  return { data: Buffer.from(b64, "base64"), mime: "image/jpeg", model: "flux-1-schnell" };
}

async function generate({ prompt, style, aspect = "16:9", out }) {
  if (!prompt || !String(prompt).trim()) throw new Error("prompt required");
  if (style && !STYLES[style]) throw new Error(`unknown style "${style}"; use one of: ${Object.keys(STYLES).join(", ")}`);
  if (!ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${ASPECTS.join(", ")}`);
  const full = style ? `${prompt}, ${STYLES[style]}` : prompt;
  const ledger = readLedger(); const day = (ledger[today()] ||= {}); const cool = (ledger.cooldown ||= {});
  const tried = [];
  for (const p of (process.env.IMAGE_PROVIDERS || "gemini,cloudflare").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!configured(p)) { tried.push(`${p}: no key configured`); continue; }
    if ((day[p] || 0) >= (CAPS[p] ?? 0)) { tried.push(`${p}: daily cap ${CAPS[p]} reached`); continue; }
    if (cool[p] && Date.now() < cool[p]) { tried.push(`${p}: cooling down until ${new Date(cool[p]).toISOString().slice(11, 16)}Z after a quota/auth error`); continue; }
    try {
      const img = await (p === "gemini" ? viaGemini(full, aspect) : viaCloudflare(full));
      const ext = img.mime.includes("jpeg") ? "jpg" : "png";
      let file = path.resolve(out || path.join("generated-images", `img-${Date.now()}.${ext}`));
      if (path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg") !== ext) file = file.replace(/\.[^.\\/]*$/, "") + "." + ext;
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, img.data);
      day[p] = (day[p] || 0) + 1; delete cool[p]; writeLedger(ledger);
      return { file, provider: p, model: img.model, bytes: img.data.length, fallbacks: tried };
    } catch (e) {
      tried.push(`${p}: ${e.message}`);
      if (e instanceof ProviderError && e.cooldownSec) cool[p] = Date.now() + e.cooldownSec * 1000;
    }
  }
  writeLedger(ledger);
  throw new Error(`no image produced. ${tried.join(" | ")}. Fall back to a text/CSS/SVG placeholder and tell the user.`);
}

function status() {
  const l = readLedger(); const day = l[today()] || {};
  const rows = (process.env.IMAGE_PROVIDERS || "gemini,cloudflare").split(",").map((p) => p.trim()).map((p) => ({ provider: p, keyConfigured: configured(p), usedToday: day[p] || 0, dailyCap: CAPS[p], cooldownUntil: l.cooldown?.[p] && Date.now() < l.cooldown[p] ? new Date(l.cooldown[p]).toISOString() : null }));
  return { geminiModel: GEMINI_MODEL, providers: rows };
}

// ---- MCP over stdio (newline-delimited JSON-RPC) ----
const TOOL = { name: "generate_image", description: "Generate an image for a website/app via Gemini 'Nano Banana' with automatic fallback to Cloudflare FLUX.1 schnell (daily caps apply). Pass `style` for SaaS/business looks. Reports which provider was used. Never put exact text, logos or real people's likenesses in the prompt. On failure, fall back to a placeholder.", inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Subject and setting" }, style: { type: "string", enum: Object.keys(STYLES) }, aspect: { type: "string", enum: ASPECTS, description: "Gemini only (default 16:9); Cloudflare uses its native size" }, output_path: { type: "string", description: "Where to save (extension may change to match the image format)" } }, required: ["prompt"] } };
function mcp() {
  const send = (o) => process.stdout.write(JSON.stringify(o) + "\n"); let buf = "";
  process.stdin.on("data", async (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "image-gen", version: "1.0.0" } } });
      else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: [TOOL] } });
      else if (m.method === "tools/call") {
        try {
          if (m.params.name !== "generate_image") throw new Error("unknown tool");
          const a = m.params.arguments || {}; const r = await generate({ prompt: a.prompt, style: a.style, aspect: a.aspect, out: a.output_path });
          send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `${r.file}\nprovider: ${r.provider} (${r.model})${r.fallbacks.length ? "\nskipped: " + r.fallbacks.join(" | ") : ""}` }] } });
        } catch (e) { send({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: String(e.message) }] } }); }
      } else if (m.id !== undefined && !m.method.startsWith("notifications/")) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

(async () => {
  const argv = process.argv.slice(2); const cmd = argv[0];
  const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    if (cmd === "generate") { const r = await generate({ prompt: argv[1], style: flag("style"), aspect: flag("aspect"), out: flag("out") }); console.log(JSON.stringify(r, null, 2)); }
    else if (cmd === "status") console.log(JSON.stringify(status(), null, 2));
    else if (cmd === "reset") { const l = readLedger(); delete l.cooldown; writeLedger(l); console.log("cooldowns cleared"); }
    else if (cmd === "mcp") mcp();
    else { console.error('usage: node image-gen.js <generate "<prompt>" [--out f] [--style s] [--aspect r]|status|reset|mcp>'); process.exitCode = 2; }
  } catch (e) { console.error(e.message); process.exitCode = 1; } // exitCode, not exit(): exit() while a fetch is closing crashes Node on Windows
})();
