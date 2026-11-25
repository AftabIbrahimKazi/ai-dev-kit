#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.STUCK_MAX = void 0;
exports.openStages = openStages;
exports.decide = decide;
// Stop hook: keeps a multi-stage run going while PLAN.md still has unchecked `- [ ]` stages.
// Opt-in per plan: PLAN.md must carry the line `<!-- plan-gate -->`. A plan without it, or with
// `<!-- plan-gate: off -->`, is never gated, so a stale checklist cannot trap a session.
// Reads the hook JSON on stdin ({ cwd, session_id }). Fails open on any read or parse problem.
// Releases the stop when the unchecked count has not dropped for 4 blocks in a row (a stuck run).
// 2 was measured too low: Haiku ignored two blocks in 2 of 9 runs and then finished when blocked again.
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
exports.STUCK_MAX = 4;
// Counts `- [ ]` items outside code fences. Returns null when the plan is not opted in.
function openStages(plan) {
    if (!/<!--\s*plan-gate\s*-->/.test(plan))
        return null;
    let fence = false;
    let open = 0;
    let next = '';
    for (const line of plan.split(/\r?\n/)) {
        if (/^\s*(```|~~~)/.test(line)) {
            fence = !fence;
            continue;
        }
        if (fence)
            continue;
        const m = /^\s*[-*]\s+\[ \]\s+(.*)$/.exec(line);
        if (m) {
            open++;
            if (!next)
                next = m[1].trim();
        }
    }
    return { open, next };
}
// prev = the last block's open count and how many blocks in a row made no progress.
function decide(plan, prev) {
    const s = openStages(plan);
    if (!s || s.open === 0)
        return { block: false, open: s ? 0 : -1, stuck: 0 };
    const stuck = prev && s.open >= prev.open ? prev.stuck + 1 : 0;
    if (stuck >= exports.STUCK_MAX)
        return { block: false, open: s.open, stuck };
    return {
        block: true,
        open: s.open,
        stuck,
        reason: `PLAN.md still has ${s.open} unchecked stage(s). Next: "${s.next}". Do not summarize or ask: do that stage now, tick it, then the next. Stop only on a blocking error you cannot fix in 2 attempts, then say so and add <!-- plan-gate: off --> to PLAN.md.`,
    };
}
function main() {
    let input = {};
    try {
        input = JSON.parse(fs.readFileSync(0, 'utf8'));
    }
    catch {
        return;
    }
    const cwd = input.cwd || process.cwd();
    let plan;
    try {
        plan = fs.readFileSync(path.join(cwd, 'PLAN.md'), 'utf8');
    }
    catch {
        return;
    }
    if (/<!--\s*plan-gate:\s*off\s*-->/.test(plan))
        return;
    const key = (input.session_id || 'x').replace(/[^\w-]/g, '').slice(0, 64);
    const state = path.join(os.tmpdir(), `plan-gate-${key}.json`);
    let prev;
    try {
        prev = JSON.parse(fs.readFileSync(state, 'utf8'));
    }
    catch { /* first block */ }
    const g = decide(plan, prev);
    try {
        if (g.block)
            fs.writeFileSync(state, JSON.stringify({ open: g.open, stuck: g.stuck }));
        else
            fs.rmSync(state, { force: true });
    }
    catch { /* state is best effort */ }
    if (g.block)
        process.stdout.write(JSON.stringify({ decision: 'block', reason: g.reason }));
}
if (require.main === module)
    main();
