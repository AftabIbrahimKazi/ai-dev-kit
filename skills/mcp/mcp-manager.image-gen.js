#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate = generate;
exports.status = status;
exports.enhance = enhance;
// Image generation through the free router (the Unified API), as a CLI and a stdio MCP server. No dependencies.
//   node image-gen.js generate "<prompt>" [--out file] [--style preset] [--aspect 16:9]
//   node image-gen.js enhance <file> [--preset natural] ...   traditional edits via ImageMagick, no AI
//   node image-gen.js status      allowed or not, today's count, cooldown
//   node image-gen.js reset       clear the cooldown
//   node image-gen.js mcp         stdio MCP server exposing generate_image and enhance_image
// The project allows the router with "image": ["unified"] in .claude/ai-backends.json (install-kit asks). Not allowed, no key, a
// cooldown after a quota or auth error, or any failure: a labelled placeholder, never a block. The router picks the model and
// the provider (Cloudflare FLUX today) and its own failover. The key (UNIFIED_API_KEY) comes from the environment, the project's
// .env or ~/.ai-dev-kit/.env (only the names below are read). Never written anywhere.
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process_1 = require("child_process");
function sibling(installed, library) {
    return require(path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library));
}
const bk = sibling('backends.js', 'mcp-manager.backends.js');
const HOME = process.env.IMAGE_GEN_HOME || path.join(os.homedir(), '.ai-dev-kit', 'image-gen');
const LEDGER = path.join(HOME, 'usage.json');
const KEYS = ['UNIFIED_API_KEY', 'UNIFIED_API_BASE'];
const COOLDOWN_MS = 3600000; // after a quota or auth error (429, 401, 403) the router is left alone for an hour
const STYLES = {
    'saas-illustration': 'flat vector illustration, clean minimal style, soft pastel gradient background, lots of white space',
    isometric: 'isometric illustration, soft shadows, clean vector style, white background',
    'business-photo': 'professional stock photo, bright modern office, natural window light, candid, shallow depth of field',
    'icon-3d': 'minimal 3D rendered icon, glossy, soft studio lighting, pastel gradient background',
    'product-mockup': 'product shot, clean white desk, soft daylight, minimal',
};
const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
// Fill missing keys from ./.env (project) and then ~/.ai-dev-kit/.env (global, set once for every project). Whitelisted names only.
(function loadEnv() {
    for (const file of [path.join(process.cwd(), '.env'), path.join(os.homedir(), '.ai-dev-kit', '.env')]) {
        try {
            for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
                const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
                if (m && KEYS.includes(m[1]) && !process.env[m[1]] && m[2])
                    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
            }
        }
        catch { /* no .env here */ }
    }
})();
const today = () => new Date().toISOString().slice(0, 10);
const readLedger = () => { try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}
catch {
    return {};
} };
const writeLedger = (l) => { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); };
const PLACEHOLDER_BASE = process.env.PLACEHOLDER_API_BASE || 'https://placehold.co';
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16) + 'Z';
const SIZES = { '1:1': [1024, 1024], '16:9': [1600, 900], '9:16': [900, 1600], '4:3': [1200, 900], '3:4': [900, 1200], '3:2': [1200, 800], '2:3': [800, 1200] };
const esc = (t) => String(t).replace(/[<>&"]/g, ' ');
const withExt = (f, ext) => { const q = path.parse(f); return path.join(q.dir, q.name + '.' + ext); };
function logNotice(msg) { try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.appendFileSync(path.join(HOME, 'notices.log'), `${new Date().toISOString()} ${msg}` + String.fromCharCode(10));
}
catch { /* best effort */ } }
// Last resort: a labelled placeholder from placehold.co, or a local SVG if the web is unreachable.
async function makePlaceholder(prompt, aspect, out) {
    const [w, h] = SIZES[aspect] || SIZES['16:9'];
    const label = String(prompt).replace(/\s+/g, ' ').slice(0, 60);
    let data = null, ext = 'png', source = 'placehold.co';
    try {
        const r = await fetch(`${PLACEHOLDER_BASE}/${w}x${h}/e2e8f0/475569.png?text=${encodeURIComponent('Placeholder: ' + label)}`, { signal: AbortSignal.timeout(10000) });
        if (r.ok && (r.headers.get('content-type') || '').startsWith('image/'))
            data = Buffer.from(await r.arrayBuffer());
    }
    catch { /* fall through to local SVG */ }
    if (!data) {
        ext = 'svg';
        source = 'local SVG (web unreachable)';
        data = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" fill="#475569" font-family="sans-serif" font-size="${Math.round(h / 16)}" text-anchor="middle">Placeholder: ${esc(label)}</text></svg>`);
    }
    let file = path.resolve(out || path.join('generated-images', `placeholder-${Date.now()}.${ext}`));
    if (path.extname(file).slice(1).toLowerCase() !== ext)
        file = withExt(file, ext);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return { file, source };
}
async function generate({ prompt, style, aspect = '16:9', out }) {
    if (!prompt || !String(prompt).trim())
        throw new Error('prompt required');
    if (style && !STYLES[style])
        throw new Error(`unknown style "${style}"; use one of: ${Object.keys(STYLES).join(', ')}`);
    if (!ASPECTS.includes(aspect))
        throw new Error(`aspect must be one of ${ASPECTS.join(', ')}`);
    const full = style ? `${prompt}, ${STYLES[style]}` : prompt;
    const ledger = readLedger();
    const day = (ledger[today()] ||= {});
    const cool = (ledger.cooldown ||= {});
    const notices = [];
    const note = (m) => { notices.push(m); logNotice(m); };
    const done = (r) => { writeLedger(ledger); return { ...r, notices }; };
    const placeholder = async () => {
        const ph = await makePlaceholder(prompt, aspect, out);
        note(`PLACEHOLDER saved from ${ph.source}: it is NOT a generated image. Replace it before shipping.`);
        return done({ file: ph.file, provider: 'placeholder', model: ph.source, placeholder: true });
    };
    if (!bk.readBackends(process.cwd(), 'image').includes('unified')) {
        note('no image backend is allowed in this project (.claude/ai-backends.json "image": ["unified"]; run install-kit and tick the Unified API).');
        return placeholder();
    }
    if (cool.unified && Date.now() < cool.unified) {
        note(`the image router hit a quota or auth error earlier and is paused until ${hhmm(cool.unified)}.`);
        return placeholder();
    }
    const [w, h] = SIZES[aspect];
    const r = await bk.askImage(full, `${w}x${h}`);
    if ('note' in r) {
        const quota = [401, 403, 429].includes(r.status || 0);
        if (quota)
            cool.unified = Date.now() + COOLDOWN_MS;
        note(`${r.note}. ${quota ? `Pausing the router until ${hhmm(cool.unified)}.` : 'Temporary; not paused.'} Using a placeholder.`);
        return placeholder();
    }
    const ext = r.mime.includes('jpeg') ? 'jpg' : r.mime.includes('webp') ? 'webp' : 'png';
    let file = path.resolve(out || path.join('generated-images', `img-${Date.now()}.${ext}`));
    if (path.extname(file).slice(1).toLowerCase().replace('jpeg', 'jpg') !== ext)
        file = withExt(file, ext);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, r.data);
    day.unified = (day.unified || 0) + 1;
    delete cool.unified;
    return done({ file, provider: r.provider, model: r.model, bytes: r.data.length, placeholder: false });
}
function status() {
    const l = readLedger();
    const day = l[today()] || {};
    return { allowed: bk.readBackends(process.cwd(), 'image').includes('unified'), keyConfigured: !!bk.unifiedKey(process.env), usedToday: day.unified || 0, cooldownUntil: l.cooldown?.unified && Date.now() < l.cooldown.unified ? new Date(l.cooldown.unified).toISOString() : null };
}
const PRESETS = {
    natural: { auto: true, contrast: 8, saturation: 10, sharpen: 0.6 },
    vivid: { auto: true, contrast: 15, saturation: 30, sharpen: 0.8 },
    warm: { auto: true, warmth: 20, saturation: 8, sharpen: 0.5 },
    cool: { auto: true, warmth: -20, saturation: 5, sharpen: 0.5 },
    matte: { auto: true, lift: true, contrast: -5, saturation: -10 },
    'product-clean': { auto: true, brightness: 6, contrast: 12, sharpen: 1 },
    bw: { auto: true, gray: true, contrast: 15, sharpen: 0.6 },
};
const IM = process.env.IMAGEMAGICK_BIN || 'magick'; // never bare "convert": on Windows that is a system utility
const runIM = (args) => new Promise((resolve, reject) => {
    (0, child_process_1.execFile)(IM, args, { timeout: 120000, windowsHide: true }, (err, _o, stderr) => {
        if (!err)
            return resolve();
        reject(new Error(err.code === 'ENOENT'
            ? `ImageMagick not found (looked for "${IM}"). Install it (winget install ImageMagick.ImageMagick / brew install imagemagick / apt install imagemagick) or set IMAGEMAGICK_BIN.`
            : `ImageMagick failed: ${String(stderr || err.message).trim().slice(0, 300)}`));
    });
});
const num = (n, lo, hi, name) => {
    if (n === undefined || n === null || Number.isNaN(n))
        return undefined;
    const v = Number(n);
    if (!Number.isFinite(v) || v < lo || v > hi)
        throw new Error(`${name} must be a number from ${lo} to ${hi}`);
    return v;
};
async function enhance(a) {
    if (!a.input)
        throw new Error('input required');
    const input = path.resolve(a.input);
    if (!fs.existsSync(input) || !fs.statSync(input).isFile())
        throw new Error(`input file not found: ${input}`);
    const pre = a.preset ? PRESETS[a.preset] : {};
    if (!pre)
        throw new Error(`unknown preset "${a.preset}"; use one of: ${Object.keys(PRESETS).join(', ')}`);
    const brightness = num(a.brightness, -100, 100, 'brightness') ?? pre.brightness, contrast = num(a.contrast, -100, 100, 'contrast') ?? pre.contrast;
    const saturation = num(a.saturation, -100, 100, 'saturation') ?? pre.saturation, warmth = num(a.warmth, -100, 100, 'warmth') ?? pre.warmth;
    const gamma = num(a.gamma, 0.2, 5, 'gamma'), sharpen = num(a.sharpen, 0, 5, 'sharpen') ?? pre.sharpen, denoise = num(a.denoise, 0, 20, 'denoise');
    const maxW = num(a.max_width, 16, 20000, 'max_width'), quality = num(a.quality, 1, 100, 'quality') ?? 92;
    const ext = path.extname(input) || '.jpg';
    const outFile = path.resolve(a.out || path.join(path.dirname(input), `${path.basename(input, ext)}-enhanced${ext}`));
    if (outFile.toLowerCase() === input.toLowerCase())
        throw new Error('output_path must differ from the input: originals are never overwritten');
    const args = [input, '-auto-orient'], applied = [];
    const add = (label, ...op) => { args.push(...op); applied.push(label); };
    if (denoise)
        add(`denoise ${denoise}%`, '-wavelet-denoise', `${denoise}%`); // before sharpening, or the noise gets sharpened
    if (pre.auto)
        add('auto-level', '-auto-level');
    if (pre.lift)
        add('lifted blacks', '+level', '6%,100%');
    if (gamma && gamma !== 1)
        add(`gamma ${gamma}`, '-gamma', String(gamma));
    if (brightness || contrast)
        add(`brightness ${brightness || 0} / contrast ${contrast || 0}`, '-brightness-contrast', `${brightness || 0}x${contrast || 0}`);
    if (warmth)
        add(`warmth ${warmth}`, '-channel', 'R', '-evaluate', 'Multiply', String(1 + warmth / 500), '-channel', 'B', '-evaluate', 'Multiply', String(1 - warmth / 500), '+channel');
    if (saturation)
        add(`saturation ${saturation}`, '-modulate', `100,${100 + saturation},100`);
    if (pre.gray)
        add('black & white', '-colorspace', 'Gray');
    if (maxW)
        add(`max width ${maxW}px`, '-resize', `${maxW}x>`);
    if (sharpen)
        add(`sharpen ${sharpen}`, '-unsharp', `0x1+${sharpen}+0.02`);
    if (!applied.length)
        throw new Error('nothing to do: pass a preset or at least one adjustment');
    args.push('-quality', String(quality), outFile);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await runIM(args);
    return { file: outFile, input, bytes: fs.statSync(outFile).size, applied };
}
// Plain-text report for the AI/user: notices first, because the user must be told about every switch, pause and placeholder.
function render(r) {
    const NL = String.fromCharCode(10);
    const head = r.notices.length ? ['NOTICES - tell the user about each of these in your reply:', ...r.notices.map((n) => '- ' + n), ''] : [];
    const body = r.placeholder ? [`PLACEHOLDER (not a generated image): ${r.file}`, `source: ${r.model}`] : [r.file, `provider: ${r.provider} (${r.model})`];
    return [...head, ...body].join(NL);
}
// ---- MCP over stdio (newline-delimited JSON-RPC) ----
const TOOL = { name: 'generate_image', description: "Generate an image for a website/app through the free router (Cloudflare FLUX today). Pass `style` for SaaS/business looks. Reports who made it. Never put exact text, logos or real people's likenesses in the prompt. When the router is not allowed or fails you get a labelled placeholder, which is not a generated image.", inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'Subject and setting' }, style: { type: 'string', enum: Object.keys(STYLES) }, aspect: { type: 'string', enum: ASPECTS, description: 'Default 16:9; a hint, the model may return its native size' }, output_path: { type: 'string', description: 'Where to save (extension may change to match the image format)' } }, required: ['prompt'] } };
const ENHANCE_TOOL = { name: 'enhance_image', description: 'Enhance an existing photo with traditional editing (auto-levels, brightness/contrast, saturation, warmth, gamma, sharpen, denoise, resize) via ImageMagick. Deterministic: no AI, no quota, nothing invented, subject unchanged. Writes a new file beside the original (never overwrites). Use a preset and/or individual adjustments.', inputSchema: { type: 'object', properties: { input_path: { type: 'string' }, preset: { type: 'string', enum: Object.keys(PRESETS) }, brightness: { type: 'number', description: '-100..100' }, contrast: { type: 'number', description: '-100..100' }, saturation: { type: 'number', description: '-100..100' }, warmth: { type: 'number', description: '-100 cool .. 100 warm' }, gamma: { type: 'number', description: '0.2..5, above 1 brightens midtones' }, sharpen: { type: 'number', description: '0..5' }, denoise: { type: 'number', description: '0..20 percent' }, max_width: { type: 'number', description: 'downscale only' }, quality: { type: 'number', description: 'JPEG quality, default 92' }, output_path: { type: 'string', description: 'default <name>-enhanced.<ext> next to the input' } }, required: ['input_path'] } };
const SV = ['2026-07-28', '2025-11-25'];
const META = 'io.modelcontextprotocol/';
const INFO = { name: 'image-gen', version: '1.0.0' };
function mcp() {
    let legacy = false; // set by an initialize request: older clients keep session semantics
    const send = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };
    let buf = '';
    process.stdin.on('data', async (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line)
                continue;
            let m;
            try {
                m = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (!m.method)
                continue;
            if (m.method === 'initialize') {
                legacy = true;
                send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: INFO } });
                continue;
            }
            if (m.method === 'server/discover') {
                send({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', supportedVersions: SV, capabilities: { tools: {} }, _meta: { [META + 'serverInfo']: INFO }, ttlMs: 3600000, cacheScope: 'public' } });
                continue;
            }
            if (m.method === 'ping' && legacy) {
                send({ jsonrpc: '2.0', id: m.id, result: {} });
                continue;
            }
            if (!legacy && m.id !== undefined && m.method !== 'ping') {
                const meta = (m.params?._meta || {});
                const v = meta[META + 'protocolVersion'];
                if (typeof v !== 'string' || !meta[META + 'clientCapabilities']) {
                    send({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'Invalid params: _meta protocolVersion and clientCapabilities required' } });
                    continue;
                }
                if (!SV.includes(v)) {
                    send({ jsonrpc: '2.0', id: m.id, error: { code: -32022, message: 'Unsupported protocol version', data: { supported: SV, requested: v } } });
                    continue;
                }
            }
            if (m.method === 'tools/list')
                send({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', ttlMs: 3600000, cacheScope: 'public', tools: [TOOL, ENHANCE_TOOL] } });
            else if (m.method === 'tools/call') {
                try {
                    if (m.params.name === 'enhance_image') {
                        const e = m.params.arguments || {};
                        const r = await enhance({ ...e, input: e.input_path, out: e.output_path });
                        send({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', content: [{ type: 'text', text: [r.file, `applied: ${r.applied.join(', ')}`, `original untouched: ${r.input}`].join(String.fromCharCode(10)) }] } });
                        continue;
                    }
                    if (m.params.name !== 'generate_image')
                        throw new Error('unknown tool');
                    const a = m.params.arguments || {};
                    const r = await generate({ prompt: a.prompt, style: a.style, aspect: a.aspect, out: a.output_path });
                    send({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', content: [{ type: 'text', text: render(r) }] } });
                }
                catch (e) {
                    send({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', isError: true, content: [{ type: 'text', text: String(e.message) }] } });
                }
            }
            else if (m.id !== undefined && !m.method.startsWith('notifications/'))
                send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
        }
    });
    process.stdin.on('end', () => process.exit(0));
}
(async () => {
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
    try {
        if (cmd === 'generate') {
            const r = await generate({ prompt: argv[1], style: flag('style'), aspect: flag('aspect'), out: flag('out') });
            for (const n of r.notices)
                console.error('NOTICE: ' + n);
            console.log(JSON.stringify(r, null, 2));
        }
        else if (cmd === 'enhance') {
            const n = (k) => flag(k) === undefined ? undefined : Number(flag(k));
            const r = await enhance({ input: argv[1], preset: flag('preset'), brightness: n('brightness'), contrast: n('contrast'), saturation: n('saturation'), warmth: n('warmth'), gamma: n('gamma'), sharpen: n('sharpen'), denoise: n('denoise'), max_width: n('max-width'), quality: n('quality'), out: flag('out') });
            console.log(JSON.stringify(r, null, 2));
        }
        else if (cmd === 'status')
            console.log(JSON.stringify(status(), null, 2));
        else if (cmd === 'reset') {
            const l = readLedger();
            delete l.cooldown;
            writeLedger(l);
            console.log('cooldown cleared');
        }
        else if (cmd === 'mcp')
            mcp();
        else {
            console.error('usage: node image-gen.js <enhance <file> [--preset p] [--brightness n] [--contrast n] [--saturation n] [--warmth n] [--gamma n] [--sharpen n] [--denoise n] [--max-width px] [--out f]|generate "<prompt>" [--out f] [--style s] [--aspect r]|status|reset|mcp>');
            process.exitCode = 2;
        }
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    } // exitCode, not exit(): exit() while a fetch is closing crashes Node on Windows
})();
