#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overlap = overlap;
exports.isRetry = isRetry;
exports.mineTranscript = mineTranscript;
exports.rank = rank;
exports.readUsageLogs = readUsageLogs;
exports.defaultProjectDir = defaultProjectDir;
exports.mineDir = mineDir;
exports.render = render;
// Zero-token retry miner. Reads Claude Code transcripts (~/.claude/projects/<project>/*.jsonl) and, when present, the
// feature-usage logs (~/.ai-dev-kit/usage/log), and ranks skills by loads, retries after a load, and session tokens.
// A retry is a user prompt that follows an assistant turn and either opens with a negative word or repeats most of the
// previous prompt. Names and counts only: prompt text is never printed or stored.
// Usage: node usage-mine.js [--project <dir>] [--usage <dir>] [--days N] [--json] [--out <file>]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
function parseArgs(argv) {
    const a = {};
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--project')
            a.project = argv[++i];
        else if (k === '--usage')
            a.usage = argv[++i];
        else if (k === '--days')
            a.days = Number(argv[++i]);
        else if (k === '--json')
            a.json = true;
        else if (k === '--out')
            a.out = argv[++i];
    }
    return a;
}
const NEGATIVE = /^\s*(no\b|nope|wrong|that'?s (not|wrong)|not (what|quite|right)|still\b|again\b|it (didn'?t|doesn'?t|did not|does not)|didn'?t work|doesn'?t work|not working|you (missed|forgot|didn'?t)|try again|redo|undo|revert|stop\b)/i;
const SYSTEMISH = /^\s*<(task-notification|system-reminder|command-|local-command|user-prompt-submit-hook|ide_)/i;
const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
function overlap(a, b) {
    const x = words(a);
    const y = words(b);
    if (x.size < 4 || y.size < 4)
        return 0;
    let n = 0;
    for (const w of x)
        if (y.has(w))
            n++;
    return n / Math.min(x.size, y.size);
}
function isRetry(prompt, previous) {
    if (NEGATIVE.test(prompt))
        return true;
    return previous !== null && overlap(prompt, previous) >= 0.7;
}
function promptText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return null;
    if (content.some((b) => b && b.type === 'tool_result'))
        return null;
    const t = content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
    return t || null;
}
// A skill load is a Skill tool call, or a Read of a SKILL.md / skill body file.
function skillOf(block) {
    if (block.name === 'Skill' && block.input && typeof block.input.skill === 'string')
        return String(block.input.skill).replace(/^.*:/, '');
    if (block.name === 'Read' && block.input && typeof block.input.file_path === 'string') {
        const p = String(block.input.file_path).split(String.fromCharCode(92)).join('/');
        const m = /\/skills\/(?:[a-z0-9-]+\/)?([a-z0-9-]+)\/SKILL\.md$/.exec(p);
        if (m)
            return m[1];
    }
    return null;
}
function mineTranscript(text, sidHint) {
    const st = { sid: sidHint, prompts: 0, retries: 0, toolErrors: 0, tokens: 0, skills: [], retryAfterLoad: [] };
    const seenMsg = new Set();
    const loaded = [];
    let previous = null;
    let sawAssistant = false;
    const afterLoad = new Set();
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        let r;
        try {
            r = JSON.parse(line);
        }
        catch {
            continue;
        } // a torn line
        if (!r || r.isSidechain)
            continue;
        if (r.sessionId && st.sid === sidHint)
            st.sid = String(r.sessionId);
        const msg = r.message;
        if (!msg)
            continue;
        if (r.type === 'assistant') {
            sawAssistant = true;
            const id = msg.id ? String(msg.id) : '';
            const u = msg.usage;
            if (u && (!id || !seenMsg.has(id))) {
                if (id)
                    seenMsg.add(id);
                st.tokens += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
            }
            if (Array.isArray(msg.content)) {
                for (const b of msg.content) {
                    if (b && b.type === 'tool_use') {
                        const s = skillOf(b);
                        if (s && !loaded.includes(s)) {
                            loaded.push(s);
                        }
                    }
                }
            }
        }
        else if (r.type === 'user') {
            if (Array.isArray(msg.content)) {
                for (const b of msg.content)
                    if (b && b.type === 'tool_result' && b.is_error === true)
                        st.toolErrors++;
            }
            const t = promptText(msg.content);
            if (t === null || r.isMeta || SYSTEMISH.test(t))
                continue;
            st.prompts++;
            if (sawAssistant && isRetry(t, previous)) {
                st.retries++;
                for (const s of loaded)
                    afterLoad.add(s);
            }
            previous = t;
        }
    }
    st.skills = loaded;
    st.retryAfterLoad = [...afterLoad];
    return st;
}
const median = (xs) => {
    if (!xs.length)
        return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
// extra: skill names per session id from the feature-usage logs, merged in so a load the transcript missed still counts.
function rank(stats, extra = new Map()) {
    const by = new Map();
    for (const st of stats) {
        const names = new Set([...st.skills, ...(extra.get(st.sid) || [])]);
        for (const n of names) {
            const e = by.get(n) || { sessions: [], retry: 0, loads: 0 };
            e.sessions.push(st);
            e.loads++;
            if (st.retryAfterLoad.includes(n))
                e.retry++;
            by.set(n, e);
        }
    }
    return [...by.entries()]
        .map(([skill, e]) => ({
        skill,
        loads: e.loads,
        sessions: e.sessions.length,
        retrySessions: e.retry,
        retryRate: e.sessions.length ? Math.round((e.retry / e.sessions.length) * 100) / 100 : 0,
        medianTokens: median(e.sessions.map((s) => s.tokens)),
    }))
        .sort((a, b) => b.loads - a.loads || b.retryRate - a.retryRate || a.skill.localeCompare(b.skill));
}
function readUsageLogs(dir) {
    const out = new Map();
    if (!fs.existsSync(dir))
        return out;
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                walk(p);
            else if (e.name.endsWith('.jsonl')) {
                for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
                    if (!line.trim())
                        continue;
                    try {
                        const r = JSON.parse(line);
                        if (r.kind === 'skill' && r.sid && r.name) {
                            const l = out.get(String(r.sid)) || [];
                            if (!l.includes(r.name))
                                l.push(String(r.name));
                            out.set(String(r.sid), l);
                        }
                    }
                    catch { /* skip a torn line */ }
                }
            }
        }
    };
    walk(dir);
    return out;
}
function defaultProjectDir(cwd) {
    const slug = cwd.replace(/[^A-Za-z0-9]/g, '-');
    const base = path.join(os.homedir(), '.claude', 'projects');
    const exact = path.join(base, slug);
    if (fs.existsSync(exact))
        return exact;
    const lower = slug.toLowerCase();
    const hit = fs.existsSync(base) ? fs.readdirSync(base).find((d) => d.toLowerCase() === lower) : undefined;
    return hit ? path.join(base, hit) : exact;
}
function mineDir(dir, days) {
    if (!fs.existsSync(dir))
        return [];
    const cutoff = days && days > 0 ? Date.now() - days * 86400000 : 0;
    const stats = [];
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.jsonl'))
            continue;
        const p = path.join(dir, f);
        if (cutoff && fs.statSync(p).mtimeMs < cutoff)
            continue;
        stats.push(mineTranscript(fs.readFileSync(p, 'utf8'), f.replace(/\.jsonl$/, '')));
    }
    return stats;
}
function render(stats, rows, usageSeen) {
    const retries = stats.reduce((n, s) => n + s.retries, 0);
    const prompts = stats.reduce((n, s) => n + s.prompts, 0);
    const errors = stats.reduce((n, s) => n + s.toolErrors, 0);
    const out = [];
    out.push('# Usage mine report', '');
    out.push(`${stats.length} session(s), ${prompts} prompt(s), ${retries} retry(ies), ${errors} tool error(s). feature-usage logs: ${usageSeen ? 'merged' : 'none found (transcripts only)'}.`, '');
    if (!rows.length) {
        out.push('No skill loads found.');
        return out.join('\n') + '\n';
    }
    out.push('| skill | loads | sessions with retry after load | retry rate | median session tokens |', '|---|---:|---:|---:|---:|');
    for (const r of rows)
        out.push(`| ${r.skill} | ${r.loads} | ${r.retrySessions} | ${Math.round(r.retryRate * 100)}% | ${r.medianTokens} |`);
    out.push('', 'Reading it: a retry follows a negative reply or a repeated prompt after the skill loaded. It is a hint, not proof the skill caused it. Low loads with zero retries make an unpin candidate only after an ablation run (skills/meta/ab-gate.js).');
    return out.join('\n') + '\n';
}
if (require.main === module) {
    const a = parseArgs(process.argv.slice(2));
    const dir = a.project || defaultProjectDir(process.cwd());
    const usageDir = a.usage || path.join(os.homedir(), '.ai-dev-kit', 'usage', 'log');
    const stats = mineDir(dir, a.days);
    const extra = readUsageLogs(usageDir);
    const rows = rank(stats, extra);
    if (a.json)
        console.log(JSON.stringify({ sessions: stats.length, rows }));
    else {
        const text = render(stats, rows, extra.size > 0);
        if (a.out) {
            fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
            fs.writeFileSync(a.out, text);
            console.log('wrote ' + a.out);
        }
        else
            process.stdout.write(text);
    }
}
