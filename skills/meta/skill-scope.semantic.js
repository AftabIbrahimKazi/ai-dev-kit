"use strict";
// Semantic skill hints from the local Laya model, for prompts the keyword rules cannot catch ("the checkout page just
// shows a blank screen" names no keyword, but is a debugging task). Prints one "<skill>\t<score>" line per skill the
// model says applies. Loopback only (host checked in code), never a hosted provider, never starts Laya, silent and fast
// when Laya is not running. Plain Node 18+, no dependencies.
//
//   node skill-scope.semantic.js [--skills a,b] [--json] <prompt text>
//
// Exit 0: asked and answered (no lines = nothing applies). Exit 2: Laya unavailable (not running, timed out, hosted
// provider configured). The caller counts exit 2 and stops asking for the session.
//
// Thresholds from tests/skill-scope.semantic.eval.js (hand-written fixture, 2026-11-24; tuned on it, so read the numbers as
// optimistic): debug-protocol 0.5 = recall 24/26, false 0/52; plan-first 0.25 = recall 14/16, false 3/65 (0.4 gave 12/16).
// Earlier probe: 14 paraphrases with no keyword in them: keywords 0/14, this 14/14, 0 false hints on 14 other
// prompts. intent-capture was tried and dropped: the model cannot tell a vague request from a specific one (scores
// 0.11-0.19 for vague, up to 0.25 for specific).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEMANTIC = void 0;
exports.resolveBase = resolveBase;
exports.pick = pick;
exports.ask = ask;
exports.SEMANTIC = {
    'debug-protocol': { q: 'Is something failing or misbehaving with an unknown cause (a bug, error, crash, regression, failing test or failing build)?', t: 0.5 },
    'plan-first': { q: 'Does this task span three or more files or have several deliverables, so it needs a plan before any edit?', t: 0.25 },
};
// A loopback base URL or null. A configured hosted key means "not Laya": never touch it from here.
function resolveBase(env) {
    if (env.SYSTEM1_API_KEY)
        return null;
    const base = env.SYSTEM1_BASE_URL || `http://127.0.0.1:${env.LAYA_PORT || '8000'}`;
    try {
        const u = new URL(base);
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost')
            return null;
        return base.replace(/\/+$/, '');
    }
    catch {
        return null;
    }
}
// results[0].answers[<skill>].noul is the yes-probability for one state with one question per skill.
function pick(results, skills, table = exports.SEMANTIC) {
    const answers = results?.results?.[0]?.answers;
    if (!answers)
        return [];
    const out = [];
    for (const s of skills) {
        const score = answers[s]?.noul;
        if (typeof score === 'number' && score >= table[s].t)
            out.push({ skill: s, score });
    }
    return out.sort((a, b) => b.score - a.score);
}
async function timed(url, ms, init) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: ac.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
async function ask(env, prompt, skills, healthMs = 800, askMs = 4000) {
    const base = resolveBase(env);
    const wanted = skills.filter((s) => s in exports.SEMANTIC);
    if (!base || !wanted.length)
        return base ? [] : null;
    try {
        if (!(await timed(`${base}/health`, healthMs)).ok)
            return null;
        const questions = {};
        for (const s of wanted)
            questions[s] = { type: 'noul', instructions: exports.SEMANTIC[s].q };
        const r = await timed(`${base}/v1/systemone/batch`, askMs, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ states: [`Prompt: ${prompt.slice(0, 1500)}`], questions }),
        });
        if (!r.ok)
            return null;
        return pick(await r.json(), wanted);
    }
    catch {
        return null;
    }
}
async function main() {
    const args = process.argv.slice(2);
    let skills = Object.keys(exports.SEMANTIC);
    const si = args.indexOf('--skills');
    if (si >= 0) {
        skills = (args.splice(si, 2)[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    const json = args.includes('--json');
    const prompt = args.filter((a) => a !== '--json').join(' ').trim();
    if (!prompt) {
        console.error('usage: skill-scope.semantic.js [--skills a,b] [--json] <prompt text>');
        process.exit(1);
    }
    const hits = await ask(process.env, prompt, skills);
    if (hits === null)
        process.exit(2);
    if (json)
        console.log(JSON.stringify(hits));
    else
        for (const h of hits)
            console.log(`${h.skill}\t${h.score.toFixed(2)}`);
}
if (require.main === module)
    main();
