#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.build = build;
exports.render = render;
exports.scan = scan;
// device (skill-scope companion, /device): read-only scan of this machine, then a Have / Missing / Next report and a preset.
// Usage: node device.js [--json] [--preset lite|standard|full]
// Installs nothing, downloads nothing, never reads or prints secrets (Kaggle credentials: presence only).
// Test hook: DEVICE_FAKE_HW='<json>' replaces every probe (see tests/device-check.test.js).
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
// The registry module ships beside install-kit, not with this skill: an installed copy may not have it, so the rows are skipped then.
let ext = null;
try {
    ext = require('./install-kit.external');
}
catch { /* not present: no external rows */ }
const { spawnSync } = childProcess;
const win = process.platform === 'win32';
const home = os.homedir();
const kitHome = path.join(home, '.ai-dev-kit');
const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
    return { ok: r.status === 0 && !r.error, out: String(r.stdout || '').trim() };
};
const has = (cmd, args = ['--version']) => run(cmd, args).ok;
function detectGpus() {
    const gpus = [];
    const smi = run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
    if (smi.ok)
        for (const l of smi.out.split(/\r?\n/).filter(Boolean)) {
            const [name, mb] = l.split(',').map((s) => s.trim());
            gpus.push({ name, vendor: 'nvidia', vramGB: Math.round(Number(mb) / 1024), discrete: true });
        }
    if (gpus.length)
        return gpus;
    // Win32_VideoController AdapterRAM caps at 4 GB, so VRAM stays unknown here (never wmic).
    const names = win ? run('powershell', ['-NoProfile', '-Command', "(Get-CimInstance Win32_VideoController).Name -join '|'"]).out.split('|')
        : process.platform === 'linux' ? run('sh', ['-c', "lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/.*: //'"]).out.split('\n') : [];
    for (const n of names.map((s) => s.trim()).filter(Boolean)) {
        const vendor = /nvidia/i.test(n) ? 'nvidia' : /amd|radeon|advanced micro/i.test(n) ? 'amd' : /intel/i.test(n) ? 'intel' : 'other';
        const integrated = /radeon\s*\(tm\)\s*graphics|radeon graphics|vega \d|uhd|iris|hd graphics|intel\(r\) graphics|arc\(tm\) graphics|basic display|remote|virtual/i.test(n);
        gpus.push({ name: n, vendor, vramGB: null, discrete: !integrated });
    }
    return gpus;
}
// Same candidate list as laya-ctl.js; returns the best version string (>= 3.10) or null.
function findPython() {
    const cands = process.env.LAYA_PYTHON ? [[process.env.LAYA_PYTHON]] : [['py', '-3.12'], ['py', '-3.11'], ['py', '-3.13'], ['py', '-3.10'], ['python3'], ['python'], ['py', '-3']];
    let best = null;
    for (const [cmd, ...pre] of cands) {
        const r = run(cmd, [...pre, '-c', 'import sys;print(sys.version_info[0]*100+sys.version_info[1])']);
        const v = Number(r.out);
        if (r.ok && v >= 310 && (best === null || (v <= 313 && (best > 313 || v > best))))
            best = v;
    }
    return best === null ? null : `${Math.floor(best / 100)}.${best % 100}`;
}
function dirSizeGB(dir, depth = 6) {
    let total = 0;
    const walk = (d, n) => {
        if (n < 0)
            return;
        let ents = [];
        try {
            ents = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                walk(p, n - 1);
            else if (e.isFile()) {
                try {
                    total += fs.statSync(p).size;
                }
                catch { /* skip */ }
            }
        }
    };
    walk(dir, depth);
    return total / 1e9;
}
// Find a sibling script: next to this file, in the repo layout, or in the global copy folder.
function findScript(name, repoRel) {
    const c = [path.join(__dirname, name), path.join(__dirname, '..', repoRel), path.join(kitHome, 'mcp', name)];
    return c.find((p) => fs.existsSync(p)) || null;
}
function verdictOf(script, env) {
    if (!script)
        return null;
    const r = spawnSync(process.execPath, [script, 'preflight'], { encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, ...env } });
    const m = /Verdict:\s*(\w+)/.exec(String(r.stdout || ''));
    return m ? m[1] : null;
}
function scan() {
    if (process.env.DEVICE_FAKE_HW)
        return JSON.parse(process.env.DEVICE_FAKE_HW);
    let dir = home;
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir)
        dir = path.dirname(dir);
    let freeDiskGB = null;
    try {
        const s = fs.statfsSync(dir);
        freeDiskGB = (s.bavail * s.bsize) / 1e9;
    }
    catch { /* unknown */ }
    const gpus = detectGpus();
    const hf = path.join(process.env.HF_HOME || path.join(home, '.cache', 'huggingface'));
    const laya = fs.existsSync(path.join(process.env.LAYA_HOME || path.join(kitHome, 'laya'), 'venv'));
    const vision = fs.existsSync(path.join(process.env.VISION_HOME || path.join(kitHome, 'vision'), 'state.json'));
    const kaggleDir = path.join(home, '.kaggle');
    const s = {
        platform: process.platform, arch: process.arch, cores: os.cpus().length, ramGB: os.totalmem() / 1e9, freeDiskGB, gpus,
        tools: { node: process.versions.node, python: findPython(), ffmpeg: has('ffmpeg', ['-version']), git: has('git'), cloudflared: has('cloudflared', ['--version']) },
        state: {
            laya, vision, ollama: has('ollama', ['--version']), llamacpp: has('llama-server', ['--version']) || vision,
            kaggleCli: has('kaggle', ['--version']),
            kaggleCreds: fs.existsSync(path.join(kaggleDir, 'kaggle.json')) || fs.existsSync(path.join(kaggleDir, 'access_token')) || !!process.env.KAGGLE_API_TOKEN || !!process.env.KAGGLE_KEY, // presence only
            hfCacheGB: fs.existsSync(hf) ? Math.round(dirSizeGB(hf) * 10) / 10 : null,
        },
    };
    try {
        if (ext)
            s.externals = ext.status().filter((x) => !/own skill/.test(x.note || '')).map((x) => ({ id: x.id, name: x.name, present: x.present, where: x.where, pinned: x.pinned }));
    }
    catch { /* registry unreadable: skip the rows */ }
    s.keyNames = keyNamesIn(path.join(kitHome, '.env'));
    const bk = findScript('skill-scope.backends.js', 'meta/skill-scope.backends.js') || findScript('backends.js', '');
    if (bk) {
        const r = spawnSync(process.execPath, [bk, '--json'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
        try {
            const j = JSON.parse(String(r.stdout || ''));
            if (Array.isArray(j.backends)) {
                s.reachable = j.backends;
                s.searchReady = !!j.searchReady;
            }
        }
        catch { /* no live rows */ }
    }
    const nv = gpus.find((g) => g.vendor === 'nvidia');
    const layaFake = JSON.stringify({ cores: s.cores, ramGB: s.ramGB, freeDiskGB, nvidia: nv ? { name: nv.name, vramGB: nv.vramGB || 0 } : null });
    const visionFake = JSON.stringify({ platform: s.platform, arch: s.arch, cores: s.cores, ramGB: s.ramGB, freeDiskGB, gpus });
    s.verdicts = {
        laya: verdictOf(findScript('system1-prefilter.laya-ctl.js', 'addons/system1-prefilter.laya-ctl.js') || findScript('laya-ctl.js', ''), { LAYA_FAKE_HW: layaFake }),
        vision: verdictOf(findScript('mcp-manager.local-vision.js', 'mcp/mcp-manager.local-vision.js') || findScript('local-vision.js', ''), { VISION_FAKE_HW: visionFake }),
    };
    return s;
}
// Names only: a line NAME=value counts when the value is non-empty. The value is never kept.
function keyNamesIn(file) {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => /^\s*([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|KEY))\s*=\s*\S/.exec(l)?.[1]).filter((x) => !!x);
    }
    catch {
        return [];
    }
}
const pyOk = (s) => !!s.tools.python;
const fmt = (n, unit = 'GB') => (n === null ? '?' : `${n.toFixed(1)} ${unit}`);
function build(s, forced) {
    const nv = s.gpus.find((g) => g.vendor === 'nvidia');
    const cuda = !!nv && (nv.vramGB || 0) >= 4;
    const layaGB = cuda ? 5.5 : 2.2;
    const visionGB = cuda ? 3.2 : 1.6;
    const verdictBlocked = (v) => v === 'blocked';
    const rows = [];
    const row = (item, ok, have, missing, info = false) => { rows.push({ item, status: ok ? 'have' : info ? 'info' : 'missing', note: ok ? have : missing }); };
    rows.push({ item: 'System', status: 'info', note: `${s.platform}/${s.arch}, ${s.cores} threads, ${fmt(s.ramGB)} RAM, ${fmt(s.freeDiskGB)} free disk` });
    rows.push({ item: 'GPU', status: 'info', note: s.gpus.length ? s.gpus.map((g) => `${g.name}${g.vramGB ? ` ${g.vramGB} GB` : ''}${g.discrete ? '' : ' (integrated, treated as CPU)'}`).join('; ') : 'none detected (CPU only)' });
    row('Node', !!s.tools.node && Number(String(s.tools.node).split('.')[0]) >= 18, `v${s.tools.node}`, 'Node 18 or newer needed for every kit script');
    row('Python 3.10+', pyOk(s), `Python ${s.tools.python}`, 'not found (needed only for Laya; Kaggle runs its own)', true);
    row('git', s.tools.git, 'found', 'not found');
    row('ffmpeg', s.tools.ffmpeg, 'found', 'not found (needed only for the media harness)', true);
    row('cloudflared', s.tools.cloudflared, 'found', 'not found (optional, live-tunnel experiment only)', true);
    row('Laya (prefilter ranking)', s.state.laya, 'installed', 'not installed');
    row('local-vision (describe_image)', s.state.vision, 'installed', 'not installed');
    row('Ollama', s.state.ollama, 'found', 'not found (optional)', true);
    row('llama.cpp server', s.state.llamacpp, 'found', 'not found (local-vision installs its own)', true);
    row('Kaggle CLI', s.state.kaggleCli, 'found', 'not found (needed only for the media harness)', true);
    row('Kaggle credentials', s.state.kaggleCreds, 'present (contents not read)', 'not found (needed only for the media harness)', true);
    for (const x of s.externals || []) {
        rows.push({ item: 'External: ' + x.id, status: x.present ? 'have' : 'info', note: x.present ? `${x.name} ${x.pinned} at ${x.where}` : `${x.name} not fetched (optional): node install-kit.cli.js install --external ${x.id}` });
    }
    for (const b of s.reachable || [])
        rows.push({ item: `${b.label} (running)`, status: b.reachable ? 'have' : 'info', note: b.reachable ? `answering at ${b.url}${b.count ? `, ${b.count} model${b.count === 1 ? '' : 's'}: ${b.models.slice(0, 3).join(', ')}` : ''}` : `not answering at ${b.url}` });
    if (s.reachable)
        rows.push({ item: 'Web search via the router', status: s.searchReady ? 'have' : 'info', note: s.searchReady ? 'ready (the web-search mod can use it)' : 'not available (needs the router, UNIFIED_API_KEY and a search provider)' });
    if (s.keyNames)
        rows.push({ item: 'API keys (names only)', status: 'info', note: s.keyNames.length ? s.keyNames.join(', ') : 'none in ~/.ai-dev-kit/.env' });
    rows.push({ item: 'Hugging Face cache', status: 'info', note: s.state.hfCacheGB === null ? 'none' : `${s.state.hfCacheGB} GB` });
    if (s.verdicts) {
        if (s.verdicts.laya)
            rows.push({ item: 'Laya preflight', status: 'info', note: s.verdicts.laya });
        if (s.verdicts.vision)
            rows.push({ item: 'local-vision preflight', status: 'info', note: s.verdicts.vision });
    }
    const disk = s.freeDiskGB;
    const standardMissing = [];
    if (!s.state.laya && !pyOk(s))
        standardMissing.push('Python 3.10+ (for Laya)');
    if (s.ramGB < 4)
        standardMissing.push('4 GB RAM or more');
    const standardGB = (s.state.laya ? 0 : layaGB) + (s.state.vision ? 0 : visionGB);
    if (disk !== null && disk < standardGB * 1.2)
        standardMissing.push(`${(standardGB * 1.2).toFixed(1)} GB free disk`);
    if (verdictBlocked(s.verdicts && s.verdicts.laya) && !s.state.laya)
        standardMissing.push('Laya preflight is blocked');
    if (verdictBlocked(s.verdicts && s.verdicts.vision) && !s.state.vision)
        standardMissing.push('local-vision preflight is blocked');
    const fullMissing = [...standardMissing];
    if (!s.tools.ffmpeg)
        fullMissing.push('ffmpeg');
    if (!s.state.kaggleCli)
        fullMissing.push('Kaggle CLI');
    if (!s.state.kaggleCreds)
        fullMissing.push('Kaggle credentials');
    const presets = {
        lite: { fits: true, downloadGB: 0, lose: 'prefilter ranking and describe_image; script routes, hooks and standards all still work', missing: [] },
        standard: { fits: standardMissing.length === 0, downloadGB: Math.round(standardGB * 10) / 10, lose: 'the media harness (images and video on Kaggle)', missing: standardMissing },
        full: { fits: fullMissing.length === 0, downloadGB: Math.round(standardGB * 10) / 10, lose: 'nothing; the Kaggle part still needs a phone-verified account and a one-time model upload', missing: fullMissing },
    };
    const recommended = forced || (presets.full.fits && s.state.laya && s.state.vision ? 'full' : presets.standard.fits ? 'standard' : 'lite');
    const next = [];
    if (recommended === 'lite')
        next.push('Nothing to install. The kit works as it is.');
    if (recommended !== 'lite') {
        const p = presets[recommended];
        if (!p.fits)
            next.push(`Preset ${recommended} is not ready. Missing: ${p.missing.join(', ')}.`);
        if (!s.state.laya)
            next.push(`node ${path.join(kitHome, 'mcp', 'laya-ctl.js')} setup    (about ${layaGB} GB; weights download on first start)`);
        if (!s.state.vision)
            next.push(`node ${path.join(kitHome, 'mcp', 'local-vision.js')} setup    (about ${visionGB} GB)`);
        if (recommended === 'full') {
            if (!s.state.kaggleCli)
                next.push('pip install kaggle    (then add credentials from kaggle.com > Settings)');
            if (!s.tools.ffmpeg)
                next.push('install ffmpeg from your package manager (winget install Gyan.FFmpeg, brew install ffmpeg, apt install ffmpeg)');
        }
        if (s.state.laya && s.state.vision && p.fits)
            next.push('Everything for this preset is already installed.');
        next.push('Each command above downloads files. Run them only when you want them.');
    }
    return { scan: s, rows, preset: recommended, presets, next };
}
function render(r) {
    const w = Math.max(...r.rows.map((x) => x.item.length));
    const mark = { have: 'HAVE   ', missing: 'MISSING', info: '       ' };
    const out = ['Device check', ''];
    for (const x of r.rows)
        out.push(`  ${mark[x.status]}  ${x.item.padEnd(w)}  ${x.note}`);
    out.push('', 'Presets');
    for (const k of ['lite', 'standard', 'full']) {
        const p = r.presets[k];
        out.push(`  ${k === r.preset ? '>' : ' '} ${k.padEnd(8)} ${p.fits ? 'fits' : 'not ready'}, download ${p.downloadGB} GB. Skip it and you lose: ${p.lose}.${p.fits ? '' : ' Missing: ' + p.missing.join(', ') + '.'}`);
    }
    out.push('', `Recommended: ${r.preset}`, 'Next', ...r.next.map((l) => '  ' + l));
    return out.join('\n');
}
if (require.main === module) {
    const a = process.argv.slice(2);
    const pi = a.indexOf('--preset');
    const forced = pi >= 0 ? a[pi + 1] : undefined;
    if (forced && !['lite', 'standard', 'full'].includes(forced)) {
        console.error('Preset must be lite, standard or full.');
        process.exit(2);
    }
    const report = build(scan(), forced);
    console.log(a.includes('--json') ? JSON.stringify(report, null, 2) : render(report));
}
