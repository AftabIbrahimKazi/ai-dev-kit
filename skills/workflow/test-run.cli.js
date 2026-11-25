#!/usr/bin/env node
"use strict";
// Run tests outside the model loop and hand back a verdict plus capped failure excerpts, never the raw log.
//   node cli.js [<case words>] [--model auto|none|local|kaggle|claude] [--cmd "<command>"] [--log <file>] [--max-lines n]
//   node cli.js gate            Stop-hook mode: reads the hook JSON on stdin, runs once per changed working tree
// The script ALWAYS runs first: on all tests, or only the files matching the case words ("login expired token").
// A pass ends there: one line, no model. Only a failure can involve a model, and --model is the one thing you choose:
//   none    digest only (what the script prints).
//   local   a local Ollama model condenses a long digest.
//   kaggle  the same against LOCAL_LLM_URL: any remote Ollama-compatible endpoint (a Kaggle tunnel); the digest leaves
//           this machine, secrets masked.
//   claude  a brief for ONE Claude subagent to read the saved log and return the failure (the command spawns it).
//   auto    (default) the chain, never skipped, never reordered: local, then kaggle/remote, then a Claude subagent. A step
//           that is unreachable or fails hands over to the next. A digest of 25 lines or fewer stays as is, and a Claude
//           subagent only joins when the digest was cut off (its 5k cold start costs more than reading a short, complete
//           digest). A condensed answer is kept only if it names every distinct error and copies only lines from the log.
//           Claude tier in auto: haiku low, or sonnet low when the log is over 40k tokens or has 4+ distinct errors.
//           Anything above sonnet low (a higher effort, or opus) is never started on its own: the script prints NEEDS
//           APPROVAL (exit 4) and the session asks you first, at planning, or here as the fallback. Opus is opt-in only
//           (--model claude:opus). Fable is never used. An approved effort is passed as --allow sonnet:medium plus
//           --from-log <saved log> so nothing reruns. Pre-approve for a project in .claude/test-gate.json {"allow": "sonnet:medium"}.
//   Laya was tried for tier choice and cannot judge a test report (scores did not separate noisy, typo and logic failures).
//   The script decides everything from the output, so a pass never starts anything: one line and done.
// Command resolution: --cmd, env TEST_GATE_CMD, .claude/test-gate.json {"cmd": [...]}, package.json scripts.test,
// then tests/*.test.js with node --test. Exit code mirrors the tests (0 pass, 1 fail), 2 bad usage, 3 nothing to run.
// Measured: a green 70-test run is 96,993 chars -> 40. The model arms are unmeasured; no A/B yet.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

// ---- digest ----
// node --test lists every failure in a "failing tests" section: "test at <file:line>", "✖ <title> (<ms>)", then the error.
// Group them by error message, so 40 failures with 5 causes become 5 lines that still name every failing test.
function groupFailures(text) {
    const at = text.indexOf("✖ failing tests:");
    if (at < 0) return [];
    const groups = new Map();
    const re = /^test at (\S+)\r?\n✖ (.+?) \([\d.]+ms\)\r?\n\s+([^\r\n]*)/gm;
    let m;
    while ((m = re.exec(text.slice(at)))) {
        const key = m[3].trim().slice(0, 160); // exact text: numbers in a message (expected 90 got 100) are part of the cause
        if (!groups.has(key)) groups.set(key, { msg: m[3].trim(), loc: m[1], titles: [] });
        groups.get(key).titles.push(m[2]);
    }
    return [...groups.values()];
}
function digest(text, code, opts = {}) {
    const maxLines = opts.maxLines ?? 60;
    const ctx = opts.context ?? 6;
    const lines = text.split(/\r?\n/);
    const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
    const pass = num(/^[ℹ#]\s*pass (\d+)/m);
    const fail = num(/^[ℹ#]\s*fail (\d+)/m);
    const total = num(/^[ℹ#]\s*tests (\d+)/m);
    const bad = /^\s*(✖|not ok|FAIL\b|Error:|AssertionError)/;
    const keep = new Set();
    lines.forEach((l, i) => { if (bad.test(l)) for (let j = i; j <= Math.min(lines.length - 1, i + ctx); j++) keep.add(j); });
    const counts = [total != null ? `${total} tests` : null, pass != null ? `${pass} pass` : null, fail != null ? `${fail} fail` : null].filter(Boolean).join(", ");
    const out = [`${code === 0 ? "PASS" : "FAIL"} (exit ${code})${counts ? ": " + counts : ""}`];
    const groups = code !== 0 ? groupFailures(text) : [];
    if (groups.length) {
        for (const g of groups) {
            const shown = g.titles.slice(0, 12).join(", ") + (g.titles.length > 12 ? `, +${g.titles.length - 12} more` : "");
            out.push(`${g.titles.length}x ${g.msg.slice(0, 160)}`, `   at ${g.loc}: ${shown}`);
        }
        if (out.length > maxLines) { const n = out.length - maxLines; out.length = maxLines; out.push(`... ${n} more lines (use --log to keep the full output)`); }
    } else if (code !== 0) {
        const picked = [...keep].sort((a, b) => a - b).map((i) => lines[i]);
        const body = picked.length ? picked : lines.slice(-ctx * 3);
        out.push(...body.slice(0, maxLines));
        if (body.length > maxLines) out.push(`... ${body.length - maxLines} more lines (use --log to keep the full output)`);
    }
    return out.join("\n");
}

// ---- command resolution and case matching ----
function resolveCmd(cwd, flagCmd) {
    const plain = (s) => s.trim().split(/\s+/);
    if (flagCmd) return plain(flagCmd);
    const env = process.env.TEST_GATE_CMD;
    if (env) {
        try { const j = JSON.parse(env); if (Array.isArray(j) && j.length) return j.map(String); } catch { /* plain line */ }
        return plain(env);
    }
    try {
        const j = JSON.parse(fs.readFileSync(path.join(cwd, ".claude", "test-gate.json"), "utf8"));
        if (Array.isArray(j.cmd) && j.cmd.length) return j.cmd.map(String);
    } catch { /* none */ }
    try {
        const t = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")).scripts?.test;
        if (t && !/no test specified/i.test(t)) return process.platform === "win32" ? ["npm", "test", "--silent"] : ["npm", "test", "--silent"];
    } catch { /* none */ }
    const dir = path.join(cwd, "tests");
    try {
        const files = fs.readdirSync(dir).filter((f) => /\.test\.[cm]?js$/.test(f)).map((f) => path.join("tests", f));
        if (files.length) return ["node", "--test", ...files];
    } catch { /* none */ }
    return null;
}

function listTestFiles(cwd) {
    const found = [];
    const skip = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "_sandbox", "site"]);
    (function walk(d, depth) {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) { if (depth < 4 && !skip.has(e.name) && !e.name.startsWith(".")) walk(path.join(d, e.name), depth + 1); }
            else if (/(\.|_)(test|spec)\.[cm]?[jt]sx?$|^test_.*\.py$|_test\.(py|go)$/.test(e.name)) found.push(path.join(d, e.name));
        }
    })(cwd, 0);
    return found;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "test", "tests", "case", "check", "run", "when", "should", "does", "not", "from", "into", "have", "has", "was", "are", "its", "fails", "works"]);
function matchCase(words, cwd) {
    const toks = [...new Set(words.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
    if (!toks.length) return { files: [], toks };
    const scored = [];
    for (const f of listTestFiles(cwd)) {
        let src = "";
        try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const titles = (src.match(/\b(?:test|it|describe|def test_\w*)\s*\(?\s*["'`]?([^\n]{0,120})/g) || []).join("\n").toLowerCase();
        const name = path.basename(f).toLowerCase();
        let s = 0;
        for (const t of toks) { if (name.includes(t)) s += 3; if (titles.includes(t)) s += 2; }
        if (s > 0) scored.push({ f: path.relative(cwd, f), s });
    }
    scored.sort((a, b) => b.s - a.s);
    return { files: scored.slice(0, 5).map((x) => x.f), toks };
}

// ---- model arms ----
const mask = (t) => t.replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xox[bap]-[A-Za-z0-9-]{10,})\b/g, "[masked]")
    .replace(/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*)["']?[^\s"',;]{6,}/gi, "$1[masked]");

function post(url, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;
        const data = JSON.stringify(body);
        const req = lib.request(u, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) }, timeout: timeoutMs }, (res) => {
            let buf = "";
            res.on("data", (c) => (buf += c));
            res.on("end", () => { try { resolve({ ok: res.statusCode < 300, status: res.statusCode, json: JSON.parse(buf) }); } catch { resolve({ ok: false, status: res.statusCode, json: null }); } });
        });
        req.on("timeout", () => { req.destroy(new Error("timeout")); });
        req.on("error", reject);
        req.end(data);
    });
}

function endpoint(via) {
    if (via === "kaggle") {
        const base = process.env.LOCAL_LLM_URL;
        if (!base) return { error: "LOCAL_LLM_URL is not set. Start the Kaggle notebook (/kaggle setup) and export its tunnel URL." };
        return { base: base.replace(/\/$/, ""), model: process.env.LOCAL_LLM_MODEL || "qwen3-coder:30b" };
    }
    const home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), ".ai-dev-kit");
    try {
        const m = JSON.parse(fs.readFileSync(path.join(home, "models.json"), "utf8"));
        return { base: (m.system2?.baseUrl || "http://127.0.0.1:11434").replace(/\/$/, ""), model: m.system2?.model || "qwen2.5:1.5b" };
    } catch { return { base: "http://127.0.0.1:11434", model: "qwen2.5:1.5b" }; }
}

const PROMPT = "You condense a failing test report. Output at most 5 lines: each failing test name, file:line if shown, and the exact error message. Add nothing else. Copy text; do not guess.\n\n";
async function condense(text, via) {
    const ep = endpoint(via);
    if (ep.error) return { note: ep.error };
    try {
        const r = await post(`${ep.base}/api/generate`, { model: ep.model, prompt: PROMPT + mask(text), stream: false, think: false, options: { temperature: 0, num_predict: 300, num_ctx: 8192 } }, 60000);
        if (!r.ok || !r.json?.response) return { note: `${via} model returned HTTP ${r.status}; digest kept` };
        return { text: r.json.response.trim(), model: ep.model };
    } catch (e) { return { note: `${via} model unreachable (${e.message}); digest kept` }; }
}

// A condensed answer replaces a complete digest only if it loses nothing: every distinct error message is named, and no
// line is invented (each line of at least 12 characters must appear in the log). Returns a reason, or null when it passes.
function rejectCondensed(condensed, log) {
    const groups = groupFailures(log);
    const missing = groups.filter((g) => !condensed.includes(g.msg.slice(0, 30)));
    if (missing.length) return `dropped ${missing.length} of ${groups.length} distinct errors`;
    const flat = log.replace(/\s+/g, " ");
    const invented = condensed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 12 && !flat.includes(l.replace(/\s+/g, " ")));
    if (invented.length) return `${invented.length} line(s) not in the log`;
    return null;
}

// ---- run ----
function runTests(cmd, cwd) {
    const needShell = process.platform === "win32" && /\.(cmd|bat)$|^(npm|npx|pnpm|yarn)$/i.test(cmd[0]);
    const q = (a) => (needShell && /[\s"]/.test(a) ? `"${a.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : a);
    // Inside a node --test run, NODE_TEST_CONTEXT makes a child `node --test` report to the parent and exit 0.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(q(cmd[0]), cmd.slice(1).map(q), { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: needShell });
    return { code: r.status ?? 1, text: (r.stdout || "") + (r.stderr || "") };
}

// ---- auto: cost estimate ----
// Real tokens are about 1.5x chars/4 (measured on this kit). Costs are tokens Claude itself would spend.
// Laya was tried for this and dropped (2026-11-25 probe): its "noise" and "reasoning" scores did not separate a stack-frame
// dump (0.81/0.39), a one-line typo failure (0.82/0.50) and five logic failures (0.91/0.10); the hardest case scored
// most noise and least reasoning. It routes skills well, but cannot judge a test report, so size and reachability decide.
const tokens = (t) => Math.ceil((t.length / 4) * 1.5);
const COST = { subagentColdStart: 5000, condensedRead: 150, smallLines: 25, haikuMaxLogTokens: 40000, sonnetLowMaxLogTokens: 120000, haikuMaxDistinct: 3, sonnetLowMaxDistinct: 12 };
const EFFORT_RANK = { low: 0, medium: 1, high: 2 };
// Distinct error messages in a log, digits folded so "x at line 4" and "x at line 9" count once.
function distinctErrors(text) {
    const seen = new Set();
    for (const l of text.split(/\r?\n/)) {
        const m = /^\s*(\w*Error\b[^\n]*)/.exec(l);
        if (m) seen.add(m[1].trim().replace(/\d+/g, "#"));
    }
    return seen.size;
}
// What the Claude step needs vs what is allowed. Haiku cannot reason across several distinct failures, so those go to
// sonnet; the effort stays low unless the user allowed more. Opus is never picked here. Returns { model, effort, ask }
// where ask, when set, names the model and effort the job wants but the allowance does not cover.
function pickClaude(logTokens, distinct, opts = {}) {
    if (opts.forced === "opus") return { model: "opus", effort: "low" };
    const allowed = opts.allow || {}; // e.g. { sonnet: "medium" }
    const allowedEffort = (m) => allowed[m] || "low";
    let want = { model: "haiku", effort: "low" };
    if (logTokens > COST.haikuMaxLogTokens || distinct > COST.haikuMaxDistinct) want = { model: "sonnet", effort: "low" };
    if (logTokens > COST.sonnetLowMaxLogTokens || distinct > COST.sonnetLowMaxDistinct) want = { model: "sonnet", effort: "medium" };
    if (opts.forced === "haiku") want = { model: "haiku", effort: "low" };
    if (opts.forced === "sonnet" && want.model === "haiku") want = { model: "sonnet", effort: "low" };
    if (EFFORT_RANK[want.effort] > EFFORT_RANK[allowedEffort(want.model)]) {
        return { model: want.model, effort: allowedEffort(want.model), ask: want };
    }
    return want;
}
async function timed(url, ms, init) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function reachable(model) {
    const ep = endpoint(model);
    if (ep.error) return false;
    try { return (await timed(`${ep.base}/api/tags`, 800)).ok; } catch { return false; }
}
// The auto chain: which steps run, in order. Reachability is passed in so it can be tested.
async function choose(body, io = { reachable }, hints = {}) {
    const lines = body.split("\n").length;
    const tk = tokens(body);
    if (lines <= COST.smallLines) return { model: "none", chain: [], why: `digest is ${lines} lines (~${tk} tokens): reading it costs less than any model call` };
    const chain = [];
    if (await io.reachable("local")) chain.push("local");
    if (process.env.LOCAL_LLM_URL && (await io.reachable("kaggle"))) chain.push("kaggle");
    // The digest already groups failures by cause, so a subagent adds something only when the digest was cut off.
    if (hints.truncated) chain.push("claude");
    if (!chain.length) return { model: "none", chain, why: `~${tk} tokens, no free model reachable, and the digest is complete with few distinct errors: a subagent (~${COST.subagentColdStart} cold start) costs more than reading it` };
    return { model: chain[0], chain, why: `~${tk} tokens; chain ${chain.join(" > ")}` };
}

function parseAllow(v) {
    const m = /^(haiku|sonnet):(low|medium|high)$/.exec(v || "");
    return m ? { [m[1]]: m[2] } : null;
}
function configAllow(cwd) {
    try { return parseAllow(JSON.parse(fs.readFileSync(path.join(cwd, ".claude", "test-gate.json"), "utf8")).allow); } catch { return null; }
}

async function runCase(argv, cwd = process.cwd(), io) {
    const o = { model: "auto", words: [], cmd: "", log: "", maxLines: 60, allow: "", fromLog: "" };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--model") o.model = argv[++i];
        else if (a === "--cmd") o.cmd = argv[++i];
        else if (a === "--log") o.log = argv[++i];
        else if (a === "--allow") o.allow = argv[++i];
        else if (a === "--from-log") o.fromLog = argv[++i];
        else if (a === "--max-lines") o.maxLines = Number(argv[++i]);
        else o.words.push(a);
    }
    if (/^claude:fable/i.test(o.model || "")) return { code: 2, out: "fable is not used: too costly, and most plans lack it. Use claude, claude:haiku, claude:sonnet or claude:opus." };
    const forced = (/^claude:(haiku|sonnet|opus)$/.exec(o.model || "") || [])[1];
    if (!["auto", "none", "local", "kaggle", "claude"].includes(o.model) && !forced) return { code: 2, out: "usage: --model auto|none|local|kaggle|claude[:haiku|sonnet|opus]" };
    if (o.allow && !parseAllow(o.allow)) return { code: 2, out: "usage: --allow haiku|sonnet:low|medium|high" };
    const allow = parseAllow(o.allow) || configAllow(cwd) || {};
    const words = o.words.join(" ").trim();
    let scope = "all tests";
    let r;
    if (o.fromLog) { // an approved rerun: read the saved failure, do not run the tests again
        try { r = { code: 1, text: fs.readFileSync(o.fromLog, "utf8") }; } catch { return { code: 2, out: "cannot read --from-log " + o.fromLog }; }
        scope = "saved log";
    } else {
        let cmd = resolveCmd(cwd, o.cmd);
        if (words) {
            const m = matchCase(words, cwd);
            if (!m.files.length) return { code: 3, out: `no test file matches "${words}" (looked for: ${m.toks.join(", ") || "no usable words"}). Name the file, or write the test first.` };
            // Another runner (jest, vitest, pytest) takes the files as extra args; everything else runs through node --test.
            const other = cmd && cmd.some((x) => /jest|vitest|pytest/.test(x));
            cmd = other ? [...cmd, ...m.files] : ["node", "--test", ...m.files];
            scope = `${m.files.length} matched file(s): ${m.files.join(", ")}`;
        }
        if (!cmd) return { code: 3, out: "no test command found. Pass --cmd, set .claude/test-gate.json, or add a package.json test script." };
        r = runTests(cmd, cwd); // the script always runs first; a pass ends here, no agent, no model
    }
    const body = digest(r.text, r.code, { maxLines: o.maxLines });
    if (r.code === 0) return { code: 0, out: `[none] ${scope}
${body}` };
    const logFile = o.fromLog || o.log || path.join(os.tmpdir(), "test-run-last.log");
    if (!o.fromLog) fs.writeFileSync(logFile, r.text);
    const logTokens = tokens(r.text);
    const distinct = groupFailures(r.text).length || distinctErrors(r.text);
    const first = body.split("\n")[0];
    const notes = [];
    let steps;
    let why = "chosen by you";
    if (o.model === "auto") {
        const c = await choose(body, io, { truncated: /more lines \(use --log/.test(body), distinct });
        steps = c.chain;
        why = c.why;
    } else steps = [forced ? "claude" : o.model];
    for (const step of steps) {
        if (step === "local" || step === "kaggle") {
            const c = await condense(body, step);
            const bad = c.text ? rejectCondensed(c.text, r.text) : null;
            if (c.text && bad) c.note = `${step} output rejected (${bad}); next step`;
            if (c.text && !bad) return { code: r.code, out: `[${step}] ${scope} (${why})
${first}
${c.text}
(condensed by ${c.model}; full log: ${logFile}${notes.length ? "; " + notes.join("; ") : ""})` };
            notes.push(c.note); // the chain does not break: the next step takes over
            continue;
        }
        if (step === "claude") {
            const c = pickClaude(logTokens, distinct, { allow, forced });
            const prior = notes.length ? ` (${notes.join("; ")})` : "";
            if (c.ask) {
                return { code: 4, out: `[claude] ${scope} (${why})${prior}
${first}
NEEDS APPROVAL before any agent starts: this log (~${logTokens} tokens, ${distinct} distinct errors) wants ${c.ask.model} at ${c.ask.effort} effort; the allowance is ${c.model} at ${c.effort}. Ask the user: allow ${c.ask.model}:${c.ask.effort}, stay at ${c.model} ${c.effort}, or skip the agent. If allowed, run: node <skill-root>/test-run/cli.js --from-log ${logFile} --model claude --allow ${c.ask.model}:${c.ask.effort}` };
            }
            return { code: r.code, out: `[claude] ${scope} (${why})${prior}
${first}
DELEGATE to ONE Claude subagent with model=${c.model} effort=${c.effort} (no other agent): read ${logFile}, return only the failing test names, file:line and exact messages. Do not read source files or fix anything.` };
        }
    }
    return { code: r.code, out: `[none] ${scope} (${why}${notes.length ? "; " + notes.join("; ") : ""})
${body}` };
}

// ---- Stop hook ----
function gateDecide(input, deps = {}) {
    if (input.stop_hook_active) return null;
    const cwd = input.cwd || process.cwd();
    const cmd = (deps.resolve || resolveCmd)(cwd, "");
    if (!cmd) return null;
    const fingerprint = deps.fingerprint || ((d) => {
        const g = (a) => spawnSync("git", a, { cwd: d, encoding: "utf8" });
        const st = g(["status", "--porcelain"]);
        return st.status === 0 ? crypto.createHash("sha256").update(st.stdout + (g(["diff", "HEAD"]).stdout || "")).digest("hex") : null;
    });
    const fp = fingerprint(cwd);
    if (!fp) return null;
    const stateFile = path.join(os.tmpdir(), `test-run-gate-${crypto.createHash("sha256").update(cwd + (input.session_id || "")).digest("hex").slice(0, 12)}.txt`);
    let last = "";
    try { last = fs.readFileSync(stateFile, "utf8"); } catch { /* first */ }
    if (last === fp) return null;
    const r = (deps.run || runTests)(cmd, cwd);
    fs.writeFileSync(stateFile, fp);
    if (r.code === 0) return null;
    return { decision: "block", reason: `test-run: tests failed after this turn's changes. Fix them, then stop again.\n${digest(r.text, r.code, { maxLines: 40 })}` };
}

async function main(argv) {
    if (argv[0] === "gate") {
        let input = {};
        try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { /* ignore */ }
        const out = gateDecide(input);
        if (out) process.stdout.write(JSON.stringify(out));
        process.exit(0);
    }
    const r = await runCase(argv);
    console.log(r.out);
    process.exit(r.code);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { digest, resolveCmd, matchCase, runCase, gateDecide, mask, choose, tokens, pickClaude, distinctErrors, groupFailures, rejectCondensed };
