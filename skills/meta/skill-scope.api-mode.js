#!/usr/bin/env node
"use strict";
// API mode switch: point Claude Code at the free unified router (FreeLLMAPI on 127.0.0.1:31415) or back at the
// subscription. The change lands in ~/.claude/settings.json and applies from the NEXT session; a session already
// running keeps the backend it launched with. Entering the opposite word flips back, the safety valve when either
// side's limit runs out.
//
//   node api-mode.js free             next sessions run on the free router (key read from ~/.ai-dev-kit/.env)
//   node api-mode.js claude           next sessions run on the subscription again
//   node api-mode.js --status         print the current mode without writing (no argument does the same)
//   node api-mode.js --doctor [--json]  list every place that sets the backend and which of them can fight a switch
//   node api-mode.js --install-escape   copy this script to ~/.ai-dev-kit/ and write use-claude.cmd / use-claude.sh there:
//                                       a switch-back that still works when the slash command does not
// Every run prints the current mode. The nine router env keys are managed as one unit: a partial strip breaks every
// call, so 'claude' removes all nine or none, and a half-stripped state is reported as "mixed", never as claude.
// Backups beside settings.json: .api-mode.bak (the state before the last write) and .pre-api-mode (the state before the
// FIRST write, never overwritten, so a bad round trip cannot erase the last good copy).
// Plain Node, no network, no deps. Exit codes: 0 done, 2 bad usage.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const BACKUP = SETTINGS + ".api-mode.bak";
const SNAPSHOT = SETTINGS + ".pre-api-mode";
const ENV_FILE = path.join(os.homedir(), ".ai-dev-kit", ".env");
const ROUTER = "http://127.0.0.1:31415";
// the keys api-mode owns; ANTHROPIC_AUTH_TOKEN is filled from the .env at run time
const ENV_KEYS = {
    ANTHROPIC_BASE_URL: ROUTER,
    ANTHROPIC_AUTH_TOKEN: null,
    ANTHROPIC_MODEL: "auto",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "auto",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "auto",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "auto",
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "102400",
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    CLAUDE_CODE_AUTO_MODE_SERVER: "0",
};
const FREE = "free (unified router)";
const CLAUDE = "claude (subscription)";

const readJson = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return {};
    }
};
const readSettings = () => readJson(SETTINGS);
const ownedKeys = (env) => Object.keys(ENV_KEYS).filter((k) => env[k] !== undefined);

function currentMode(s) {
    const env = (s && s.env) || {};
    const owned = ownedKeys(env);
    if (env.ANTHROPIC_BASE_URL === ROUTER) {
        if (owned.length === Object.keys(ENV_KEYS).length)
            return FREE;
        const missing = Object.keys(ENV_KEYS).filter((k) => env[k] === undefined);
        return `mixed (router URL set, ${missing.length} of ${Object.keys(ENV_KEYS).length} router keys missing: ${missing.join(", ")}); run: api-mode free or api-mode claude`;
    }
    if (env.ANTHROPIC_BASE_URL)
        return `custom gateway (not managed by api-mode: ${env.ANTHROPIC_BASE_URL})`;
    const left = owned.slice();
    if (s && s.model === "auto")
        left.push("model");
    if (left.length)
        return `mixed (no router URL but leftover router keys: ${left.join(", ")}); run: api-mode claude`;
    return CLAUDE;
}

function readUnifiedKey(envFile) {
    try {
        const m = fs.readFileSync(envFile, "utf8").match(/^UNIFIED_API_KEY\s*=\s*(.+)$/m);
        return m ? m[1].trim() : null;
    }
    catch {
        return null;
    }
}

function write(s) {
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
    if (fs.existsSync(SETTINGS)) {
        // the first-ever state is kept for good; the rolling backup only holds the state before this write
        if (!fs.existsSync(SNAPSHOT))
            fs.copyFileSync(SETTINGS, SNAPSHOT);
        fs.copyFileSync(SETTINGS, BACKUP);
    }
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
    return BACKUP;
}

function apply(mode, key) {
    const s = readSettings();
    const env = s.env || {};
    const before = currentMode(s);
    const want = mode === "free" ? FREE : CLAUDE;
    if (before === want)
        return `api-mode: already ${want}; nothing changed\nmode: ${before}`;
    if (mode === "free") {
        if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL !== ROUTER)
            return `api-mode: refused: settings.json points at another gateway (${env.ANTHROPIC_BASE_URL}); remove it by hand first`;
        if (!key)
            return "api-mode: refused: no UNIFIED_API_KEY found in ~/.ai-dev-kit/.env";
        for (const [k, v] of Object.entries(ENV_KEYS))
            env[k] = k === "ANTHROPIC_AUTH_TOKEN" ? key : v;
        s.env = env;
    }
    else {
        if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL !== ROUTER)
            return `api-mode: refused: settings.json points at another gateway (${env.ANTHROPIC_BASE_URL}); api-mode did not set it, so it will not remove it`;
        for (const k of Object.keys(ENV_KEYS))
            delete env[k];
        if (s.model === "auto")
            delete s.model; // the router's model id would be rejected by Anthropic
        if (Object.keys(env).length === 0)
            delete s.env;
        else
            s.env = env;
    }
    const backup = write(s);
    return `api-mode: ${before} -> ${want}; applies from the next session (running sessions keep their backend)\nbackup: ${backup}\nmode: ${want}`;
}

// ---- doctor: every layer that can set the backend --------------------------------------------------------------------

const PIN = /^(ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|ANTHROPIC_MODEL|ANTHROPIC_DEFAULT_(OPUS|SONNET|HAIKU)_MODEL)$/;

function findProjectDir(start) {
    let dir = path.resolve(start);
    const home = path.resolve(os.homedir());
    for (;;) {
        if (dir !== home && fs.existsSync(path.join(dir, ".claude")))
            return dir;
        if (fs.existsSync(path.join(dir, ".git")))
            return null; // the project ends at its git root; a .claude above it belongs to something else
        const up = path.dirname(dir);
        if (up === dir || dir === home)
            return null;
        dir = up;
    }
}

function settingsLayer(label, file) {
    if (!fs.existsSync(file))
        return { label, file, exists: false, pins: [] };
    const s = readJson(file);
    const pins = Object.keys(s.env || {}).filter((k) => PIN.test(k));
    if (s.model === "auto")
        pins.push("model=auto"); // a normal model choice is not a backend pin; the router's id is
    return { label, file, exists: true, pins, baseUrl: (s.env || {}).ANTHROPIC_BASE_URL };
}

function vscodeSettingsFile() {
    if (process.platform === "win32")
        return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Code", "User", "settings.json");
    if (process.platform === "darwin")
        return path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json");
    return path.join(os.homedir(), ".config", "Code", "User", "settings.json");
}

function vscodeLayer() {
    const file = vscodeSettingsFile();
    if (!fs.existsSync(file))
        return { label: "VS Code user settings (claudeCode.environmentVariables)", file, exists: false, pins: [] };
    // settings.json allows comments, so scan the text for the variable names instead of parsing it
    const raw = fs.readFileSync(file, "utf8");
    const pins = [];
    for (const m of raw.matchAll(/"name"\s*:\s*"([A-Z_]+)"/g))
        if (PIN.test(m[1]) && !pins.includes(m[1]))
            pins.push(m[1]);
    return { label: "VS Code user settings (claudeCode.environmentVariables)", file, exists: true, pins };
}

function doctor(cwd) {
    const layers = [settingsLayer("user settings", SETTINGS), settingsLayer("user local settings", path.join(path.dirname(SETTINGS), "settings.local.json"))];
    const proj = findProjectDir(cwd);
    if (proj) {
        layers.push(settingsLayer("project settings", path.join(proj, ".claude", "settings.json")));
        layers.push(settingsLayer("project local settings", path.join(proj, ".claude", "settings.local.json")));
    }
    layers.push(vscodeLayer());
    const envPins = Object.keys(process.env).filter((k) => PIN.test(k));
    layers.push({ label: "process environment (this shell)", file: "(env)", exists: envPins.length > 0, pins: envPins, baseUrl: process.env.ANTHROPIC_BASE_URL });
    const mode = currentMode(readSettings());
    const others = layers.filter((l) => l.label !== "user settings" && l.pins.length);
    const verdict = others.length
        ? `WARNING: ${others.map((l) => l.label).join("; ")} also set backend keys. A switch in user settings can be overridden or contradicted by them; remove those keys or they will fight api-mode.`
        : "ok: no other layer sets the backend; user settings is the only one api-mode has to manage";
    return { mode, layers, verdict, snapshot: fs.existsSync(SNAPSHOT) ? SNAPSHOT : null };
}

function renderDoctor(d) {
    const lines = [`api-mode doctor`, `mode: ${d.mode}`];
    for (const l of d.layers)
        lines.push(`  ${l.exists ? (l.pins.length ? "SETS   " : "present") : "absent "} ${l.label}${l.exists ? ` [${l.file}]` : ""}${l.pins.length ? ": " + l.pins.join(", ") : ""}`);
    lines.push(d.verdict);
    lines.push(`first-state snapshot: ${d.snapshot || "none yet (written before the first switch)"}`);
    lines.push("running sessions keep the backend they started with; open a new session after a switch.");
    return lines.join("\n");
}

// ---- escape hatch: a switch-back that does not depend on the slash command -----------------------------------------

function installEscape() {
    const dir = path.join(os.homedir(), ".ai-dev-kit");
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, "api-mode.js");
    if (path.resolve(__filename) !== path.resolve(copy))
        fs.copyFileSync(__filename, copy);
    const cmd = path.join(dir, "use-claude.cmd");
    const sh = path.join(dir, "use-claude.sh");
    fs.writeFileSync(cmd, `@echo off\r\nnode "${copy}" claude\r\npause\r\n`);
    fs.writeFileSync(sh, `#!/bin/sh\nnode "${copy}" claude\n`, { mode: 0o755 });
    return `escape hatch ready:\n  ${cmd}  (double-click on Windows)\n  ${sh}\n  or run: node "${copy}" claude`;
}

function main(argv) {
    const arg = (argv[0] || "").toLowerCase();
    const s = readSettings();
    if (!arg || arg === "--status") {
        console.log(`api-mode: ${currentMode(s)}`);
        return;
    }
    if (arg === "free" || arg === "claude") {
        console.log(apply(arg, readUnifiedKey(ENV_FILE)));
        return;
    }
    if (arg === "--doctor") {
        const d = doctor(process.cwd());
        console.log(argv.includes("--json") ? JSON.stringify(d, null, 2) : renderDoctor(d));
        return;
    }
    if (arg === "--install-escape") {
        console.log(installEscape());
        return;
    }
    console.log(`api-mode: unknown argument "${argv[0]}"\nusage: node api-mode.js free | claude | --status | --doctor [--json] | --install-escape`);
    process.exitCode = 2;
}
exports.currentMode = currentMode;
exports.readUnifiedKey = readUnifiedKey;
exports.apply = apply;
exports.doctor = doctor;
exports.ENV_KEYS = ENV_KEYS;
exports.ROUTER = ROUTER;
exports.SETTINGS = SETTINGS;
if (require.main === module)
    main(process.argv.slice(2));
