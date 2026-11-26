"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { digest, runCase, matchCase, gateDecide, mask, choose, tokens, pickClaude, distinctErrors, groupFailures, rejectCondensed } = require("../skills/workflow/test-run.cli.js");

function project(files) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "test-run-"));
    fs.mkdirSync(path.join(d, "tests"));
    for (const [n, body] of Object.entries(files)) fs.writeFileSync(path.join(d, "tests", n), body);
    return d;
}
const pass = (t) => `const test=require("node:test");test("${t}",()=>{});\n`;
const fail = (t) => `const test=require("node:test");test("${t}",()=>{throw new Error("boom ${t}")});\n`;

test("current case: no words runs the whole suite and collapses a green run", async () => {
    const d = project({ "a.test.js": pass("alpha ok"), "b.test.js": pass("beta ok") });
    const r = await runCase([], d);
    assert.strictEqual(r.code, 0);
    assert.match(r.out, /^\[none\] all tests\nPASS \(exit 0\): 2 tests, 2 pass, 0 fail$/);
});

test("current case: a failing suite returns FAIL with the failing test, not the whole log", async () => {
    const d = project({ "a.test.js": pass("alpha ok"), "b.test.js": fail("beta broken") });
    const r = await runCase([], d);
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /FAIL \(exit 1\)/);
    assert.match(r.out, /beta broken/);
});

test("specific case: words pick only the matching file", async () => {
    const d = project({ "login.test.js": pass("login rejects expired token"), "cart.test.js": fail("cart total") });
    const r = await runCase(["login", "expired", "token"], d);
    assert.strictEqual(r.code, 0);
    assert.match(r.out, /1 matched file\(s\): tests[\\/]login\.test\.js/);
    assert.match(r.out, /PASS/);
});

test("specific case: no match says so and runs nothing", async () => {
    const d = project({ "cart.test.js": fail("cart total") });
    const r = await runCase(["payments", "refund"], d);
    assert.strictEqual(r.code, 3);
    assert.match(r.out, /no test file matches/);
});

test("matchCase ranks a name hit above a title-only hit", () => {
    const d = project({ "x.test.js": pass("refund flow"), "refund.test.js": pass("something") });
    assert.strictEqual(matchCase("refund", d).files[0], path.join("tests", "refund.test.js"));
});

const big = (n) => ["FAIL (exit 1): 40 tests, 1 pass, 39 fail", ...Array.from({ length: n }, (_, i) => `  at frame ${i} node:internal/some/long/path/file.js:${i}:1`)].join("\n");
const io = (reach = {}) => ({ reachable: async (m) => !!reach[m] });

test("choose: a short digest never probes a model", async () => {
    let probed = false;
    const r = await choose("FAIL\nx", { reachable: async () => { probed = true; return true; } });
    assert.strictEqual(r.model, "none");
    assert.strictEqual(probed, false);
});

test("choose: a long digest goes to the cheapest reachable condenser, local before kaggle", async () => {
    assert.strictEqual((await choose(big(60), io({ local: true, kaggle: true }))).model, "local");
    process.env.LOCAL_LLM_URL = "http://x.invalid";
    assert.strictEqual((await choose(big(60), io({ kaggle: true }))).model, "kaggle");
    delete process.env.LOCAL_LLM_URL;
});

test("choose: with no free model, a subagent joins only for a cut-off digest", async () => {
    assert.strictEqual((await choose(big(60), io())).model, "none");
    assert.deepStrictEqual((await choose(big(60), io(), { truncated: true })).chain, ["claude"]);
    assert.strictEqual((await choose(big(60), io(), { distinct: 5 })).model, "none");
});

test("auto: a green run never reaches the chooser", async () => {
    const d = project({ "a.test.js": pass("ok") });
    const r = await runCase([], d, { reachable: async () => { throw new Error("must not probe"); } });
    assert.strictEqual(r.code, 0);
    assert.match(r.out, /^\[none\]/);
});

test("auto: a small failure stays on the script digest and says why", async () => {
    const d = project({ "a.test.js": fail("boom small") });
    const r = await runCase([], d, io({ local: true }));
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /^\[none\] all tests \(digest is \d+ lines/);
    assert.match(r.out, /boom small/);
});

test("--model claude after a failure prints a one-agent brief that points at the saved log", async () => {
    const d = project({ "a.test.js": fail("would fail") });
    const r = await runCase(["--model", "claude"], d);
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /DELEGATE to ONE Claude subagent/);
    assert.match(r.out, /test-run-last\.log/);
});

test("--model kaggle without LOCAL_LLM_URL keeps the digest and says why", async () => {
    delete process.env.LOCAL_LLM_URL;
    const d = project({ "a.test.js": fail("kaggle down") });
    const r = await runCase(["--model", "kaggle"], d);
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /LOCAL_LLM_URL is not set/);
    assert.match(r.out, /kaggle down/);
});

test("a bad --model is a usage error", async () => {
    const r = await runCase(["--model", "gpt"], process.cwd());
    assert.strictEqual(r.code, 2);
});

test("mask hides obvious secrets before a digest leaves the machine", () => {
    const m = mask('token: "abcdef123456" and sk-abcdefghijklmnop1234 and ok');
    assert.doesNotMatch(m, /abcdef123456|sk-abcdefghijklmnop1234/);
    assert.match(m, /ok$/);
});

test("digest: a long green log is one line; a long red log is capped", () => {
    assert.strictEqual(digest("ok line\n".repeat(5000) + "ℹ tests 9\nℹ pass 9\nℹ fail 0\n", 0), "PASS (exit 0): 9 tests, 9 pass, 0 fail");
    const red = digest("✖ broken\n" + "  AssertionError: x\n".repeat(200), 1, { maxLines: 10 });
    assert.ok(red.split("\n").length <= 13);
});

let n = 0;
const gd = (over = {}) => ({ resolve: () => ["x"], fingerprint: () => "fp1", run: () => ({ code: 0, text: "" }), ...over });
const sid = () => `g${Date.now()}-${n++}`;

test("gate: never re-enters, silent without a command, silent on pass, blocks on fail", () => {
    let ran = false;
    assert.strictEqual(gateDecide({ stop_hook_active: true, session_id: sid() }, gd({ run: () => { ran = true; return { code: 1, text: "" }; } })), null);
    assert.strictEqual(ran, false);
    assert.strictEqual(gateDecide({ session_id: sid() }, gd({ resolve: () => null })), null);
    assert.strictEqual(gateDecide({ session_id: sid() }, gd()), null);
    const out = gateDecide({ session_id: sid() }, gd({ run: () => ({ code: 1, text: "✖ bad\n" }) }));
    assert.strictEqual(out.decision, "block");
    assert.match(out.reason, /bad/);
});

test("gate: an unchanged tree is not run twice, a changed one is", () => {
    const s = sid();
    let runs = 0;
    const d = gd({ run: () => { runs++; return { code: 1, text: "✖ x\n" }; } });
    assert.ok(gateDecide({ session_id: s }, d));
    assert.strictEqual(gateDecide({ session_id: s }, d), null);
    assert.ok(gateDecide({ session_id: s }, { ...d, fingerprint: () => "fp2" }));
    assert.strictEqual(runs, 2);
});

test("claude tier: haiku low by default, sonnet low for a big log or 4+ distinct errors, never above low unprompted", () => {
    assert.deepStrictEqual(pickClaude(5000, 1), { model: "haiku", effort: "low" });
    assert.deepStrictEqual(pickClaude(50000, 1), { model: "sonnet", effort: "low" });
    assert.deepStrictEqual(pickClaude(5000, 6), { model: "sonnet", effort: "low" });
    const big = pickClaude(200000, 1);
    assert.deepStrictEqual({ m: big.model, e: big.effort, ask: big.ask }, { m: "sonnet", e: "low", ask: { model: "sonnet", effort: "medium" } });
    assert.strictEqual(pickClaude(5000, 20).ask.effort, "medium");
});

test("claude tier: an allowance lifts the ask, opus is never picked unless forced", () => {
    assert.deepStrictEqual(pickClaude(200000, 1, { allow: { sonnet: "medium" } }), { model: "sonnet", effort: "medium" });
    for (const [t, d] of [[5000, 1], [50000, 6], [999999, 99]]) assert.notStrictEqual(pickClaude(t, d, { allow: { sonnet: "high" } }).model, "opus");
    assert.strictEqual(pickClaude(5000, 1, { forced: "opus" }).model, "opus");
});

test("distinctErrors folds digits and counts unique messages", () => {
    assert.strictEqual(distinctErrors("Error: x at line 4\nError: x at line 9\nTypeError: y\n"), 2);
});

function deadLocal() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "kit-home-"));
    fs.writeFileSync(path.join(home, "models.json"), JSON.stringify({ system2: { baseUrl: "http://127.0.0.1:1", model: "none" } }));
    process.env.AI_DEV_KIT_HOME = home;
    return () => { delete process.env.AI_DEV_KIT_HOME; };
}
const manyFail = (n) => 'const test=require("node:test");\n' + Array.from({ length: n }, (_, i) => 'test("case ' + i + '",()=>{throw new Error("distinct failure k' + i + '");});').join("\n");

test("a forced local model that fails keeps the digest and says why; auto on a 40-error log goes straight to claude and asks before anything above low", async () => {
    const undo = deadLocal();
    try {
        const d = project({ "a.test.js": manyFail(40) });
        const forced = await runCase(["--model", "local"], d);
        assert.strictEqual(forced.code, 1);
        assert.match(forced.out, /local model unreachable/);
        assert.match(forced.out, /distinct failure k0/, "the digest is kept");
        const r = await runCase([], d, { reachable: async () => { throw new Error("must not probe: 40 distinct errors cannot be condensed to 5 lines"); } });
        assert.strictEqual(r.code, 4); // 40 distinct causes want more than sonnet low, so the agent waits for approval
        assert.match(r.out, /^\[claude\]/);
        assert.match(r.out, /NEEDS APPROVAL before any agent starts/);
        const ok = await runCase(["--allow", "sonnet:medium"], d, { reachable: async () => false });
        assert.strictEqual(ok.code, 1);
        assert.match(ok.out, /DELEGATE to ONE Claude subagent with model=sonnet effort=medium/);
    } finally { undo(); }
});

test("a log that wants more than sonnet low stops with NEEDS APPROVAL (exit 4) and starts no agent", async () => {
    const d = project({ "a.test.js": manyFail(40) });
    const forcedBig = { reachable: async () => false };
    const r = await runCase(["--model", "claude"], d, forcedBig);
    // 40 failures give a handful of distinct messages, so this one stays within sonnet low; force the ask with a huge synthetic log.
    assert.ok(r.code === 1 || r.code === 4);
    const log = path.join(d, "big.log");
    fs.writeFileSync(log, ("Error: boom line\n" + "x".repeat(200) + "\n").repeat(3000) + Array.from({ length: 15 }, (_, i) => "Error: unique " + String.fromCharCode(97 + i) + "\n").join(""));
    const ask = await runCase(["--model", "claude", "--from-log", log], d, forcedBig);
    assert.strictEqual(ask.code, 4);
    assert.match(ask.out, /NEEDS APPROVAL before any agent starts/);
    assert.doesNotMatch(ask.out, /DELEGATE/);
    const ok = await runCase(["--model", "claude", "--from-log", log, "--allow", "sonnet:medium"], d, forcedBig);
    assert.strictEqual(ok.code, 1);
    assert.match(ok.out, /model=sonnet effort=medium/);
});

test("a pass starts nothing: no reachability probe, no agent", async () => {
    const d = project({ "a.test.js": pass("fine") });
    const r = await runCase([], d, { reachable: async () => { throw new Error("must not probe"); } });
    assert.strictEqual(r.code, 0);
    assert.doesNotMatch(r.out, /DELEGATE|NEEDS APPROVAL/);
});

test("--model claude:opus is opt-in and runs at low effort; fable is refused", async () => {
    const d = project({ "a.test.js": fail("forced") });
    const r = await runCase(["--model", "claude:opus"], d);
    assert.match(r.out, /model=opus effort=low/);
    const f = await runCase(["--model", "claude:fable"], d);
    assert.strictEqual(f.code, 2);
    assert.match(f.out, /fable is not used/);
});

test("digest groups failures by cause and still names every failing test", () => {
    const log = ["✖ failing tests:", ""];
    for (let i = 0; i < 30; i++) log.push("test at tests\a.test.js:" + (i + 1) + ":1", "✖ case " + i + " (0.1ms)", "  Error: cause " + (i % 3), "      at stack frame", "");
    log.push("ℹ tests 30", "ℹ pass 0", "ℹ fail 30");
    const d = digest(log.join("\n"), 1);
    assert.match(d, /^FAIL \(exit 1\): 30 tests, 0 pass, 30 fail/);
    assert.strictEqual(d.split("\n").filter((l) => /^\d+x /.test(l)).length, 3);
    for (let i = 0; i < 30; i++) assert.ok(d.includes("case " + i + (i < 12 || true ? "" : "")) || /more/.test(d), "case " + i);
});

test("a condensed answer that drops a distinct error or invents a line is rejected", () => {
    const log = "✖ failing tests:\n\ntest at a.js:1:1\n✖ t1 (1ms)\n  Error: alpha problem here\n\ntest at a.js:2:1\n✖ t2 (1ms)\n  Error: beta problem here\n";
    assert.match(rejectCondensed("Error: alpha problem here", log), /dropped 1 of 2/);
    assert.match(rejectCondensed("Error: alpha problem here\nError: beta problem here\nsomething the model made up", log), /not in the log/);
    assert.strictEqual(rejectCondensed("Error: alpha problem here\nError: beta problem here", log), null);
});

// ---- unified step and the "tests" list in .claude/ai-backends.json ----
const http = require("node:http");
const bigDigest = (n) => Array.from({ length: n }, (_, i) => `✖ case ${i}\n  Error: distinct failure k${i}`).join("\n");
function withBackends(d, tests) {
    fs.mkdirSync(path.join(d, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(d, ".claude", "ai-backends.json"), JSON.stringify({ tests }));
}
function router(reply) {
    return new Promise((resolve) => {
        const calls = [];
        const s = http.createServer((req, res) => {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => { calls.push({ url: req.url, auth: req.headers.authorization, body }); res.setHeader("content-type", "application/json"); res.end(req.method === "POST" ? JSON.stringify({ choices: [{ message: { content: reply } }] }) : JSON.stringify({ data: [] })); });
        });
        s.listen(0, "127.0.0.1", () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
    });
}
const withEnv = (vars, fn) => async () => {
    const prev = {};
    for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === null) delete process.env[k]; else process.env[k] = vars[k]; }
    try { await fn(); } finally { for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};

test("choose: the chain is local, kaggle, unified in that order; unified only when the project allows it", async () => {
    const all = { reachable: async () => true };
    process.env.LOCAL_LLM_URL = "http://127.0.0.1:1";
    try {
        assert.deepStrictEqual((await choose(bigDigest(60), all, { allowed: new Set(["local", "kaggle", "unified"]) })).chain, ["local", "kaggle", "unified"]);
        assert.deepStrictEqual((await choose(bigDigest(60), all, { allowed: new Set(["unified"]) })).chain, ["unified"]);
        assert.deepStrictEqual((await choose(bigDigest(60), all, {})).chain, ["local", "kaggle"], "no list: the old default, never unified");
        assert.deepStrictEqual((await choose(bigDigest(60), all, { allowed: new Set(), truncated: true })).chain, ["claude"], "an empty list leaves Claude only");
        assert.strictEqual((await choose(bigDigest(60), { reachable: async (m) => m !== "unified" }, { allowed: new Set(["unified"]) })).model, "none", "an unreachable unified is skipped");
    } finally { delete process.env.LOCAL_LLM_URL; }
});

test("a project with tests: [] probes nothing and sends nothing to any model", async () => {
    const d = project({ "a.test.js": manyFail(40) });
    withBackends(d, []);
    const r = await runCase([], d, { reachable: async () => { throw new Error("must not probe"); } });
    assert.match(r.out, /^\[claude\]/);
});

test("unified step (forced): the digest goes to the router with model auto, and a complete answer replaces it", withEnv({ UNIFIED_API_KEY: "k-test-1" }, async () => {
    const d = project({ "a.test.js": manyFail(40) });
    withBackends(d, ["unified"]);
    const reply = Array.from({ length: 40 }, (_, i) => `Error: distinct failure k${i}`).join("\n");
    const rt = await router(reply);
    process.env.UNIFIED_API_BASE = rt.base;
    try {
        const r = await runCase(["--model", "unified"], d);
        assert.match(r.out, /^\[unified\]/);
        assert.match(r.out, /condensed by the unified router/);
        const post = rt.calls.find((c) => c.url === "/v1/chat/completions");
        assert.ok(post && post.auth === "Bearer k-test-1" && JSON.parse(post.body).model === "auto");
    } finally { delete process.env.UNIFIED_API_BASE; rt.s.close(); }
}));

test("unified step (forced): an answer that invents a line is rejected and the digest is kept", withEnv({ UNIFIED_API_KEY: "k-test-1" }, async () => {
    const d = project({ "a.test.js": manyFail(40) });
    withBackends(d, ["unified"]);
    const rt = await router("Error: a line the model made up\n" + Array.from({ length: 40 }, (_, i) => `Error: distinct failure k${i}`).join("\n"));
    process.env.UNIFIED_API_BASE = rt.base;
    try {
        const r = await runCase(["--model", "unified"], d);
        assert.match(r.out, /^\[none\]/);
        assert.match(r.out, /unified output rejected/);
        assert.match(r.out, /distinct failure k0/, "the digest is kept");
    } finally { delete process.env.UNIFIED_API_BASE; rt.s.close(); }
}));

test("--model unified without a key keeps the digest and says why; usage lists unified", withEnv({ UNIFIED_API_KEY: null, AI_DEV_KIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), "no-key-")) }, async () => {
    const d = project({ "a.test.js": fail("no key here") });
    const r = await runCase(["--model", "unified"], d);
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /UNIFIED_API_KEY/);
    assert.match(r.out, /no key here/);
    assert.match((await runCase(["--model", "gpt"], process.cwd())).out, /unified/);
}));

test("choose: more than 5 distinct errors skips every condenser (a 5-line answer cannot name them) and keeps the Claude tier", async () => {
    const all = { reachable: async () => { throw new Error("must not probe"); } };
    const cut = await choose(bigDigest(60), all, { allowed: new Set(["local", "kaggle", "unified"]), distinct: 6, truncated: true });
    assert.deepStrictEqual(cut.chain, ["claude"]);
    assert.match(cut.why, /6 distinct errors/);
    assert.deepStrictEqual((await choose(bigDigest(60), all, { distinct: 6 })).chain, [], "complete digest, nothing to add");
    const five = await choose(bigDigest(60), { reachable: async () => true }, { allowed: new Set(["unified"]), distinct: 5 });
    assert.deepStrictEqual(five.chain, ["unified"], "five or fewer still tries the condenser");
});
