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

// ---- limits, notices, placeholders ----
const SOFT = Number(process.env.IMAGE_SOFT_LIMIT_PCT || 90) / 100; // switch provider at this share of the daily cap
const WARN = Number(process.env.IMAGE_WARN_PCT || 80) / 100;       // heads-up at this share
const PLACEHOLDER_BASE = process.env.PLACEHOLDER_API_BASE || "https://placehold.co";
const softLimit = (p) => Math.max(1, Math.ceil(CAPS[p] * SOFT));
const warnAt = (p) => Math.max(1, Math.ceil(CAPS[p] * WARN));
const nextResetUtc = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16) + "Z";
const SIZES = { "1:1": [1024, 1024], "16:9": [1600, 900], "9:16": [900, 1600], "4:3": [1200, 900], "3:4": [900, 1200], "3:2": [1200, 800], "2:3": [800, 1200] };
const esc = (t) => String(t).replace(/[<>&"]/g, " ");

const withExt = (f, ext) => { const q = path.parse(f); return path.join(q.dir, q.name + "." + ext); };
function logNotice(msg) { try { fs.mkdirSync(HOME, { recursive: true }); fs.appendFileSync(path.join(HOME, "notices.log"), `${new Date().toISOString()} ${msg}` + String.fromCharCode(10)); } catch {} }

// Last resort: a labelled placeholder from placehold.co, or a local SVG if the web is unreachable.
async function makePlaceholder(prompt, aspect, out) {
  const [w, h] = SIZES[aspect] || SIZES["16:9"];
  const label = String(prompt).replace(/\s+/g, " ").slice(0, 60);
  let data = null, ext = "png", source = "placehold.co";
  try {
    const r = await fetch(`${PLACEHOLDER_BASE}/${w}x${h}/e2e8f0/475569.png?text=${encodeURIComponent("Placeholder: " + label)}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) data = Buffer.from(await r.arrayBuffer());
  } catch {}
  if (!data) {
    ext = "svg"; source = "local SVG (web unreachable)";
    data = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" fill="#475569" font-family="sans-serif" font-size="${Math.round(h / 16)}" text-anchor="middle">Placeholder: ${esc(label)}</text></svg>`);
  }
  let file = path.resolve(out || path.join("generated-images", `placeholder-${Date.now()}.${ext}`));
  if (path.extname(file).slice(1).toLowerCase() !== ext) file = withExt(file, ext);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data);
  return { file, source };
}

async function generate({ prompt, style, aspect = "16:9", out }) {
  if (!prompt || !String(prompt).trim()) throw new Error("prompt required");
  if (style && !STYLES[style]) throw new Error(`unknown style "${style}"; use one of: ${Object.keys(STYLES).join(", ")}`);
  if (!ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${ASPECTS.join(", ")}`);
  const full = style ? `${prompt}, ${STYLES[style]}` : prompt;
  const ledger = readLedger(); const day = (ledger[today()] ||= {}); const cool = (ledger.cooldown ||= {}); const warned = (ledger.warned ||= {});
  const notices = []; const note = (m) => { notices.push(m); logNotice(m); };
  const done = (r) => { writeLedger(ledger); return { ...r, notices }; };

  // Everything was exhausted earlier: do not touch the providers again until the pause ends.
  if (ledger.pausedUntil && Date.now() < ledger.pausedUntil) {
    note(`image generation is PAUSED until ${hhmm(ledger.pausedUntil)} (all providers were at their limits). Using a placeholder, not a generated image.`);
    const ph = await makePlaceholder(prompt, aspect, out);
    return done({ file: ph.file, provider: "placeholder", model: ph.source, placeholder: true });
  }

  let exhausted = 0, unavailable = 0;
  for (const p of (process.env.IMAGE_PROVIDERS || "gemini,cloudflare").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!configured(p)) { unavailable++; note(`${p}: no key configured, skipped.`); continue; }
    if ((day[p] || 0) >= softLimit(p)) { exhausted++; note(`${p}: ${day[p]}/${CAPS[p]} images used today, at the ${Math.round(SOFT * 100)}% safety limit. Switching to the next provider.`); continue; }
    if (cool[p] && Date.now() < cool[p]) { exhausted++; note(`${p}: quota/auth error earlier, cooling down until ${hhmm(cool[p])}. Switching to the next provider.`); continue; }
    try {
      const img = await (p === "gemini" ? viaGemini(full, aspect) : viaCloudflare(full));
      const ext = img.mime.includes("jpeg") ? "jpg" : "png";
      let file = path.resolve(out || path.join("generated-images", `img-${Date.now()}.${ext}`));
      if (path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg") !== ext) file = withExt(file, ext);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, img.data);
      day[p] = (day[p] || 0) + 1; delete cool[p];
      if (p === "gemini" && !warned.geminiBilled) { warned.geminiBilled = true; note("gemini image generation is billed to your Google project; today's cap is " + CAPS.gemini + " images."); }
      if (day[p] >= softLimit(p)) note(`${p}: now ${day[p]}/${CAPS[p]} used today (safety limit reached). The next image will use another provider.`);
      else if (day[p] >= warnAt(p) && !warned[p]) { warned[p] = true; note(`heads-up: ${p} is at ${day[p]}/${CAPS[p]} images today (${Math.round((day[p] / CAPS[p]) * 100)}%).`); }
      return done({ file, provider: p, model: img.model, bytes: img.data.length, placeholder: false });
    } catch (e) {
      const quota = e instanceof ProviderError && e.cooldownSec;
      if (quota) { exhausted++; cool[p] = Date.now() + e.cooldownSec * 1000; }
      note(`${p} failed: ${e.message}. ${quota ? `Pausing it until ${hhmm(cool[p])}. ` : ""}Trying the next provider.`);
    }
  }
  if (exhausted > 0 && exhausted + unavailable >= (process.env.IMAGE_PROVIDERS || "gemini,cloudflare").split(",").filter((x) => x.trim()).length) {
    ledger.pausedUntil = nextResetUtc();
    note(`ALL image providers are at their limits. Image generation is now PAUSED until ${hhmm(ledger.pausedUntil)} (daily reset). Using placeholders.`);
  } else if (exhausted + unavailable === 0) note("image generation failed for a temporary reason; using a placeholder this time (not paused).");
  else note("no provider could produce an image right now; using a placeholder.");
  const ph = await makePlaceholder(prompt, aspect, out);
  note(`PLACEHOLDER saved from ${ph.source}: it is NOT a generated image. Replace it before shipping.`);
  return done({ file: ph.file, provider: "placeholder", model: ph.source, placeholder: true });
}

function status() {
  const l = readLedger(); const day = l[today()] || {};
  const rows = (process.env.IMAGE_PROVIDERS || "gemini,cloudflare").split(",").map((p) => p.trim()).map((p) => ({ provider: p, keyConfigured: configured(p), usedToday: day[p] || 0, dailyCap: CAPS[p], cooldownUntil: l.cooldown?.[p] && Date.now() < l.cooldown[p] ? new Date(l.cooldown[p]).toISOString() : null }));
  return { geminiModel: GEMINI_MODEL, softLimitPct: SOFT * 100, pausedUntil: l.pausedUntil && Date.now() < l.pausedUntil ? new Date(l.pausedUntil).toISOString() : null, providers: rows.map((r) => ({ ...r, switchesAt: softLimit(r.provider) })) };
}

// Plain-text report for the AI/user: notices first, because the user must be told about every switch, pause and placeholder.
function render(r) {
  const NL = String.fromCharCode(10);
  const head = r.notices.length ? ["NOTICES - tell the user about each of these in your reply:", ...r.notices.map((n) => "- " + n), ""] : [];
  const body = r.placeholder ? [`PLACEHOLDER (not a generated image): ${r.file}`, `source: ${r.model}`] : [r.file, `provider: ${r.provider} (${r.model})`];
  return [...head, ...body].join(NL);
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
          send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: render(r) }] } });
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
    if (cmd === "generate") { const r = await generate({ prompt: argv[1], style: flag("style"), aspect: flag("aspect"), out: flag("out") }); for (const n of r.notices) console.error("NOTICE: " + n); console.log(JSON.stringify(r, null, 2)); }
    else if (cmd === "status") console.log(JSON.stringify(status(), null, 2));
    else if (cmd === "reset") { const l = readLedger(); delete l.cooldown; delete l.pausedUntil; writeLedger(l); console.log("cooldowns and pause cleared"); }
    else if (cmd === "mcp") mcp();
    else { console.error('usage: node image-gen.js <generate "<prompt>" [--out f] [--style s] [--aspect r]|status|reset|mcp>'); process.exitCode = 2; }
  } catch (e) { console.error(e.message); process.exitCode = 1; } // exitCode, not exit(): exit() while a fetch is closing crashes Node on Windows
})();
