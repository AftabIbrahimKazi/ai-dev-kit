#!/usr/bin/env node
"use strict";
// API mode switch: point Claude Code at the free unified router (FreeLLMAPI on 127.0.0.1:31415) or back at the
// subscription. The change lands in ~/.claude/settings.json and applies from the NEXT session; a session already
// running keeps the backend it launched with. Entering the opposite word flips back — the safety valve when either
// side's limit runs out.
//
//   node api-mode.js free      next sessions run on the free router (key read from ~/.ai-dev-kit/.env)
//   node api-mode.js claude    next sessions run on the subscription again
//   node api-mode.js --status  print the current mode without writing (no argument does the same)
// Every run prints the current mode. A backup of settings.json is written beside it before each change. The nine
// router env keys are managed as one unit — a partial strip breaks every call, so 'claude' removes all nine or none.
// Plain Node, no network, no deps. Exit codes: 0 done, 2 bad usage.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const BACKUP = SETTINGS + ".api-mode.bak";
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

const readSettings = () => {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
    }
    catch {
        return {};
    }
};
const ownedKeys = (env) => Object.keys(ENV_KEYS).filter((k) => env[k] !== undefined);

function currentMode(s) {
    const env = (s && s.env) || {};
    if (env.ANTHROPIC_BASE_URL === ROUTER)
        return "free (unified router)";
    if (env.ANTHROPIC_BASE_URL)
        return `custom gateway (not managed by api-mode: ${env.ANTHROPIC_BASE_URL})`;
    return "claude (subscription)";
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
    if (fs.existsSync(SETTINGS))
        fs.copyFileSync(SETTINGS, BACKUP);
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
    return BACKUP;
}

function apply(mode, key) {
    const s = readSettings();
    const env = s.env || {};
    const before = currentMode(s);
    const want = mode === "free" ? "free (unified router)" : "claude (subscription)";
    if (before === want)
        return `api-mode: already ${want}; nothing changed\nmode: ${before}`;
    if (mode === "free") {
        if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL !== ROUTER)
            return `api-mode: refused — settings.json points at another gateway (${env.ANTHROPIC_BASE_URL}); remove it by hand first`;
        if (!key)
            return "api-mode: refused — no UNIFIED_API_KEY found in ~/.ai-dev-kit/.env";
        for (const [k, v] of Object.entries(ENV_KEYS))
            env[k] = k === "ANTHROPIC_AUTH_TOKEN" ? key : v;
        s.env = env;
    }
    else {
        for (const k of Object.keys(ENV_KEYS))
            delete env[k];
        if (Object.keys(env).length === 0)
            delete s.env;
        else
            s.env = env;
    }
    const backup = write(s);
    return `api-mode: ${before} -> ${want}; applies from the next session (running sessions keep their backend)\nbackup: ${backup}\nmode: ${want}`;
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
    console.log(`api-mode: unknown argument "${argv[0]}"\nusage: node api-mode.js free | claude | --status`);
    process.exitCode = 2;
}
exports.currentMode = currentMode;
exports.readUnifiedKey = readUnifiedKey;
exports.apply = apply;
exports.ENV_KEYS = ENV_KEYS;
exports.ROUTER = ROUTER;
exports.SETTINGS = SETTINGS;
if (require.main === module)
    main(process.argv.slice(2));
