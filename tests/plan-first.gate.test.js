"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { openStages, decide } = require("../skills/workflow/plan-first.gate.js");

const PLAN = "<!-- plan-gate -->\n- [x] one\n- [ ] two\n- [ ] three\n";

test("plan without the marker is never gated", () => {
    assert.strictEqual(openStages("- [ ] a\n"), null);
    assert.strictEqual(decide("- [ ] a\n").block, false);
});

test("unchecked stages block and name the next one", () => {
    const g = decide(PLAN);
    assert.strictEqual(g.block, true);
    assert.strictEqual(g.open, 2);
    assert.match(g.reason, /"two"/);
});

test("checkboxes inside code fences are ignored", () => {
    const s = openStages("<!-- plan-gate -->\n```\n- [ ] example\n```\n- [x] real\n");
    assert.strictEqual(s.open, 0);
});

test("all ticked releases the stop", () => {
    assert.strictEqual(decide("<!-- plan-gate -->\n- [x] a\n").block, false);
});

test("no progress for 2 blocks releases a stuck run", () => {
    let g = decide(PLAN);
    g = decide(PLAN, g);
    assert.strictEqual(g.block, true);
    g = decide(PLAN, g);
    assert.strictEqual(g.block, false);
});

test("progress resets the stuck count", () => {
    let g = decide(PLAN);
    g = decide(PLAN, g);
    g = decide("<!-- plan-gate -->\n- [ ] three\n", g);
    assert.strictEqual(g.block, true);
    assert.strictEqual(g.stuck, 0);
});

test("hook end to end: blocks via JSON, silent when off or missing", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "plan-gate-t-"));
    const run = (sid) => spawnSync("node", [path.join(__dirname, "../skills/workflow/plan-first.gate.js")], { input: JSON.stringify({ cwd: d, session_id: sid }), encoding: "utf8" });
    assert.strictEqual(run("t-none").stdout, "");
    fs.writeFileSync(path.join(d, "PLAN.md"), PLAN);
    const r = run("t-" + process.pid);
    assert.strictEqual(JSON.parse(r.stdout).decision, "block");
    fs.writeFileSync(path.join(d, "PLAN.md"), PLAN + "<!-- plan-gate: off -->\n");
    assert.strictEqual(run("t2-" + process.pid).stdout, "");
});
