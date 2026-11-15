#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIMITS = exports.CAPS = exports.MODEL = void 0;
exports.readToken = readToken;
exports.parsePlan = parsePlan;
exports.buildPrompt = buildPrompt;
exports.estimate = estimate;
exports.parseFiles = parseFiles;
exports.gateFile = gateFile;
exports.kaggleCommand = kaggleCommand;
exports.slugFor = slugFor;
exports.weekMinutes = weekMinutes;
exports.budgetCheck = budgetCheck;
exports.buildNotebook = buildNotebook;
exports.kernelMetadata = kernelMetadata;
exports.stageResults = stageResults;
// Opt-in add-on: send a finished, executor-ready plan to a private Kaggle GPU notebook that runs qwen3-coder through Ollama,
// pull the answers back into a staging folder, run cheap local gates, and hand Claude only the failures. Nothing runs by itself:
// every step is a subcommand. The Kaggle CLI (pip install kaggle) is a prerequisite and is called as a program; no npm packages.
//
//   node cli.js setup [--user <kaggle-name>]        check the Kaggle CLI and token, save the account name
//   node cli.js plan <plan.md> [--standards <dir>]  lint the plan, build the prompts, estimate GPU minutes (no GPU, no network)
//   node cli.js run <plan.md> [--force] [--no-wait] [--poll <seconds>]   push, wait, fetch, stage, gate
//   node cli.js fetch                               pull the last run's output (after --no-wait) and gate it
//   node cli.js retry                               build a follow-up job from the failed tasks (max 2 rounds), then run it
//   node cli.js status | stop | usage | review
//
// Plan format (the "executor-ready" schema): one `## Task <n>: <title>` section per task with the lines `Target: <path>` (one
// or two, comma separated), `Check: <command or "none">`, optional `Standards: <rule ids or file names>` and `Context: <paths>`,
// then the task text, which must stand alone (no "see above"). Answers go to a staging folder, never straight into the repo.
// Env: KAGGLE_RUNNER (a node script used instead of the kaggle CLI: tests), AI_DEV_KIT_HOME (state and .env location).
// Token: KAGGLE_API_TOKEN or KAGGLE_API_KEY in the environment or in ~/.ai-dev-kit/.env (spaces and quotes are trimmed).
// Exit codes: 0 done, 1 error, 2 bad usage, 3 blocked (budget, active session, missing prerequisite).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const node_child_process_1 = require("node:child_process");
exports.MODEL = 'qwen3-coder:30b';
// Measured on 2x T4 (findings/kaggle-stage0.md): 65 tok/s at 16k, 37 tok/s with 30k in context, cold start about 5 minutes.
exports.CAPS = { wall_s: 2400, task_s: 600, max_fail: 3, num_ctx: 32768, num_predict: 4096 };
exports.LIMITS = { promptTokens: 20000, weekHours: 30, warnFraction: 0.9, coldStartMin: 5, tokPerSec: 40 };
const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const stateRoot = () => path.join(home(), 'kaggle');
const approxTokens = (s) => Math.ceil(s.length / 3.5);
function readToken(env = process.env) {
    const clean = (v) => (v || '').replace(/[\r"']/g, '').trim();
    const fromEnv = clean(env.KAGGLE_API_TOKEN) || clean(env.KAGGLE_API_KEY);
    if (fromEnv)
        return fromEnv;
    try {
        for (const line of fs.readFileSync(path.join(env.AI_DEV_KIT_HOME || home(), '.env'), 'utf8').replace(/\r/g, '').split('\n')) {
            const m = /^\s*(?:export\s+)?KAGGLE_API_(?:TOKEN|KEY)\s*=(.*)$/.exec(line);
            if (m && clean(m[1]))
                return clean(m[1]);
        }
    }
    catch { /* no .env */ }
    return '';
}
function readConfig() { try {
    return JSON.parse(fs.readFileSync(path.join(stateRoot(), 'config.json'), 'utf8'));
}
catch {
    return {};
} }
function writeConfig(c) { fs.mkdirSync(stateRoot(), { recursive: true }); fs.writeFileSync(path.join(stateRoot(), 'config.json'), JSON.stringify(c, null, 2)); }
// Parse and lint the executor schema. A problem is a line the model would otherwise have to guess at.
function parsePlan(md) {
    const problems = [];
    const tasks = [];
    const parts = md.split(/^##\s+Task\s+/im).slice(1);
    if (!parts.length)
        problems.push('no "## Task <n>: <title>" sections found');
    for (const part of parts) {
        const head = part.split('\n')[0];
        const m = /^(\S+?)\s*[:.-]\s*(.*)$/.exec(head.trim());
        const id = (m ? m[1] : head.trim().split(/\s+/)[0] || '').replace(/[^\w.-]/g, '') || `t${tasks.length + 1}`;
        const body = part.split('\n').slice(1);
        const field = (name) => { const l = body.find((x) => new RegExp(`^\\s*${name}\\s*:`, 'i').test(x)); return l ? l.replace(/^[^:]*:/, '').trim() : ''; };
        const list = (s) => s.split(',').map((x) => x.trim().replace(/^`|`$/g, '')).filter((x) => x && x.toLowerCase() !== 'none');
        const t = { id, title: m ? m[2] : head.trim(), targets: list(field('Target')), check: field('Check'), standards: list(field('Standards')), context: list(field('Context')),
            text: body.filter((l) => !/^\s*(Target|Check|Standards|Context)\s*:/i.test(l)).join('\n').trim() };
        if (!t.targets.length)
            problems.push(`task ${id}: no Target line`);
        if (t.targets.length > 2)
            problems.push(`task ${id}: ${t.targets.length} targets; keep one or two files per task`);
        if (!t.check)
            problems.push(`task ${id}: no Check line (a command, or "none")`);
        if (t.text.length < 40)
            problems.push(`task ${id}: the task text is too short to stand alone`);
        if (/\b(see above|as above|as discussed|the previous task|earlier task)\b/i.test(t.text))
            problems.push(`task ${id}: refers to other text ("see above"); make it self-contained`);
        if (/\b(refactor the (whole|entire)|across the (repo|codebase)|every file)\b/i.test(t.text))
            problems.push(`task ${id}: repo-wide work; split it into one-file tasks`);
        if (tasks.some((x) => x.id === id))
            problems.push(`task ${id}: duplicate id`);
        tasks.push(t);
    }
    return { tasks, problems };
}
const SYSTEM = 'You are a code generator. Write complete files, never placeholders or "rest of file". No explanations. For every file output a line "FILE: <path>" followed by one fenced code block with the full content. Follow the rules and context given. You cannot run tools or see other files.';
// Build the full prompt for one task: rules, context excerpts, the task, the output contract.
function buildPrompt(t, root, standardsDir) {
    const notes = [];
    const parts = [SYSTEM];
    if (t.standards.length) {
        const found = [];
        for (const s of t.standards) {
            const f = standardsDir ? [path.join(standardsDir, s), path.join(standardsDir, s + '.md')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) : undefined;
            if (f)
                found.push(`### ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`);
            else
                found.push(`### ${s}\n(rule id only; apply it by its name)`);
        }
        parts.push('RULES\n' + found.join('\n\n'));
    }
    for (const c of t.context) {
        const f = path.resolve(root, c);
        if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
            notes.push(`context file not found: ${c}`);
            continue;
        }
        if (/(^|[\\/])(\.env[^\\/]*|CLAUDE\.md|AGENTS\.md|handover\.md)$|secret|\.pem$|\.key$/i.test(f)) {
            notes.push(`context file skipped (secret-looking or private): ${c}`);
            continue;
        }
        parts.push(`CONTEXT ${c.replace(/\\/g, '/')}\n\`\`\`\n${fs.readFileSync(f, 'utf8')}\n\`\`\``);
    }
    parts.push(`TASK ${t.id}: ${t.title}\n${t.text}\nTarget file(s): ${t.targets.join(', ')}`);
    const prompt = parts.join('\n\n');
    if (approxTokens(prompt) > exports.LIMITS.promptTokens)
        notes.push(`prompt is about ${approxTokens(prompt)} tokens, over the ${exports.LIMITS.promptTokens} cap: trim Context or split the task`);
    return { prompt, notes };
}
function estimate(prompts) {
    const gen = prompts.length * (exports.CAPS.num_predict / 2) / exports.LIMITS.tokPerSec / 60; // assume half the output cap on average
    const gpuMinutes = Math.ceil(exports.LIMITS.coldStartMin + gen + prompts.reduce((a, p) => a + approxTokens(p) / 1300 / 60, 0));
    return { minutes: gpuMinutes, gpuMinutes };
}
// "FILE: path" + fenced block pairs, from the model's answer. Paths are checked: relative, inside the staging folder.
function parseFiles(answer) {
    // A "FILE: path" line starts each file. The body is the fenced block after it, or, when the model skipped the fence (seen live), everything up to the next FILE line.
    const out = [];
    const head = /^[ \t]*\**FILE:[ \t]*`?([^\s`*]+)`?\**[ \t]*$/gim;
    const marks = [];
    let m;
    while ((m = head.exec(answer)))
        marks.push({ p: m[1].replace(/\\/g, '/'), start: m.index, end: m.index + m[0].length });
    marks.forEach((k, i) => {
        if (path.isAbsolute(k.p) || k.p.split('/').includes('..'))
            return;
        let body = answer.slice(k.end, i + 1 < marks.length ? marks[i + 1].start : answer.length).replace(/^\s*\n/, '');
        const fence = /^\s*```[\w+-]*[ \t]*\n([\s\S]*?)\n[ \t]*```/.exec(body);
        body = fence ? fence[1] : body.replace(/\n+\s*$/, '');
        if (body.trim())
            out.push({ path: k.p, content: body + '\n' });
    });
    return out;
}
// Cheap local gates on staged files: syntax where Node can tell, placeholders everywhere. Findings feed a retry, not a review.
function gateFile(file, content) {
    const f = [];
    if (/(rest of (the )?(file|code)|\.\.\. ?existing|add (more|the rest) here|TODO: implement|<!-- add more)/i.test(content))
        f.push('placeholder text instead of full content');
    if (/\.json$/i.test(file)) {
        try {
            JSON.parse(content);
        }
        catch (e) {
            f.push('invalid JSON: ' + e.message.slice(0, 80));
        }
    }
    if (/\.(c|m)?js$/i.test(file)) {
        const tmp = path.join(os.tmpdir(), `kaggle-gate-${crypto.randomBytes(4).toString('hex')}${/\.mjs$/i.test(file) ? '.mjs' : '.js'}`);
        fs.writeFileSync(tmp, content);
        const r = (0, node_child_process_1.spawnSync)(process.execPath, ['--check', tmp], { encoding: 'utf8' });
        fs.rmSync(tmp, { force: true });
        if (r.status !== 0)
            f.push('syntax error: ' + (r.stderr.split('\n').find((l) => /Error/.test(l)) || 'node --check failed').slice(0, 100));
    }
    if (/\.html?$/i.test(file) && !/<\/html>\s*$/i.test(content.trim()))
        f.push('HTML does not end with </html> (cut off?)');
    if (!content.trim())
        f.push('empty file');
    return f;
}
// ---- runner ----
function kaggleCommand(args, env = process.env) {
    if (env.KAGGLE_RUNNER)
        return { cmd: process.execPath, args: [env.KAGGLE_RUNNER, ...args] };
    const probe = (0, node_child_process_1.spawnSync)('kaggle', ['--version'], { encoding: 'utf8' });
    if (!probe.error)
        return { cmd: 'kaggle', args };
    return { cmd: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'kaggle', ...args] };
}
function kaggle(args, cfgDir) {
    const token = readToken();
    const { cmd, args: a } = kaggleCommand(args);
    const r = (0, node_child_process_1.spawnSync)(cmd, a, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, KAGGLE_API_TOKEN: token, KAGGLE_CONFIG_DIR: cfgDir } });
    if (r.error)
        return { ok: false, out: r.error.message };
    return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() };
}
// ---- state ----
function slugFor(root) {
    const name = path.basename(path.resolve(root)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'project';
    return `${name}-${crypto.createHash('sha1').update(path.resolve(root)).digest('hex').slice(0, 5)}`;
}
const stateDir = (root) => path.join(stateRoot(), slugFor(root));
function readLedger(root) { try {
    return fs.readFileSync(path.join(stateDir(root), 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
catch {
    return [];
} }
function writeLedger(root, rows) { fs.mkdirSync(stateDir(root), { recursive: true }); fs.writeFileSync(path.join(stateDir(root), 'ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); }
function weekMinutes(rows, now = Date.now()) {
    return rows.filter((r) => now - Date.parse(r.started) < 7 * 86400000).reduce((a, r) => a + (r.minutes ?? Math.max(0, (now - Date.parse(r.started)) / 60000)), 0);
}
function budgetCheck(rows, addMin, force) {
    const open = rows.find((r) => !r.finished);
    if (open && !force)
        return `a session is still open (${open.kernel}, started ${open.started}). Run "status", or "stop", or pass --force.`;
    const used = weekMinutes(rows);
    if (!force && used + addMin > exports.LIMITS.weekHours * 60 * exports.LIMITS.warnFraction)
        return `weekly GPU budget: ${Math.round(used)} min used + about ${addMin} planned is over ${Math.round(exports.LIMITS.weekHours * 60 * exports.LIMITS.warnFraction)} of ${exports.LIMITS.weekHours * 60} min (local ledger; the account page is the truth). Pass --force to go ahead.`;
    return '';
}
// ---- notebook ----
function buildNotebook(jobs, workerSrc) {
    const b64 = Buffer.from(JSON.stringify(jobs), 'utf8').toString('base64');
    const src = workerSrc.replace('__JOBS_B64__', b64).replace('__MODEL__', exports.MODEL).replace('__CAPS_JSON__', JSON.stringify(exports.CAPS).replace(/"/g, '\\"'));
    return JSON.stringify({ cells: [{ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: src.split(/(?<=\n)/) }], metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } }, nbformat: 4, nbformat_minor: 4 });
}
function kernelMetadata(user, slug) {
    return { id: `${user}/${slug}`, title: slug, code_file: 'worker.ipynb', language: 'python', kernel_type: 'notebook', is_private: true, enable_gpu: true, enable_internet: true, dataset_sources: [], competition_sources: [], kernel_sources: [], model_sources: [] };
}
const sleep = (s) => { if (s > 0)
    (0, node_child_process_1.spawnSync)(process.execPath, ['-e', `setTimeout(()=>{}, ${Math.round(s * 1000)})`]); };
const cliFiles = () => __dirname;
function workerSource() {
    const p = [path.join(cliFiles(), 'kaggle.worker.py'), path.join(cliFiles(), 'worker.py')].find((x) => fs.existsSync(x));
    if (!p)
        throw new Error('worker.py not found next to cli.js');
    return fs.readFileSync(p, 'utf8');
}
function planJobs(planFile, root, standardsDir) {
    const lint = parsePlan(fs.readFileSync(planFile, 'utf8'));
    const notes = [];
    const jobs = { tasks: lint.tasks.map((t) => { const b = buildPrompt(t, root, standardsDir); notes.push(...b.notes.map((n) => `task ${t.id}: ${n}`)); return { id: t.id, prompt: b.prompt }; }) };
    return { jobs, lint, notes, tasks: lint.tasks };
}
function stageResults(outDir, tasks, stage) {
    const rows = [];
    for (const t of tasks) {
        const f = path.join(outDir, 'out', t.id + '.txt');
        const row = { task: t.id, files: [], findings: [] };
        if (!fs.existsSync(f)) {
            row.findings.push('no answer came back');
            rows.push(row);
            continue;
        }
        const files = parseFiles(fs.readFileSync(f, 'utf8'));
        if (!files.length)
            row.findings.push('no "FILE: path" + fenced block pairs found in the answer');
        for (const x of files) {
            if (t.targets.length && !t.targets.some((tg) => tg.replace(/\\/g, '/') === x.path))
                row.findings.push(`wrote ${x.path}, which is not a Target`);
            const dest = path.join(stage, x.path);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, x.content);
            row.files.push(x.path);
            for (const g of gateFile(x.path, x.content))
                row.findings.push(`${x.path}: ${g}`);
        }
        for (const tg of t.targets)
            if (!row.files.includes(tg.replace(/\\/g, '/')))
                row.findings.push(`missing Target ${tg}`);
        rows.push(row);
    }
    return rows;
}
function report(rows, stage, results) {
    const bad = rows.filter((r) => r.findings.length);
    const lines = [`kaggle results: ${rows.length - bad.length} of ${rows.length} task(s) passed the local gates; staged in ${stage}`];
    if (results && results.elapsed_s)
        lines.push(`GPU session about ${Math.ceil(results.elapsed_s / 60)} min`);
    for (const r of bad)
        lines.push(`  FAIL ${r.task}: ${r.findings.join('; ')}`);
    for (const t of results?.tasks || [])
        if (t.truncated)
            lines.push(`  note ${t.id}: answer hit the output cap (${exports.CAPS.num_predict} tokens); split the task`);
    lines.push(bad.length ? 'Next: "retry" re-asks the failed tasks with these findings (2 rounds at most), then Claude fixes what is left. Copy staged files into the repo only after review.' : 'Next: review the diff, copy the staged files into the repo, run the project tests and the pre-commit check.');
    return lines.join('\n');
}
function main() {
    const a = process.argv.slice(2);
    const sub = a[0];
    const flag = (n) => a.includes(n);
    const val = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
    const root = process.cwd();
    const usage = 'usage: kaggle cli.js setup|plan <plan.md>|run <plan.md>|fetch|retry|status|stop|usage|review  (see the header of cli.js)';
    if (!sub || !['setup', 'plan', 'run', 'fetch', 'retry', 'status', 'stop', 'usage', 'review'].includes(sub)) {
        console.error(usage);
        process.exitCode = 2;
        return;
    }
    const cfgDir = path.join(stateRoot(), 'cfg');
    fs.mkdirSync(cfgDir, { recursive: true });
    const user = val('--user') || readConfig().username || process.env.KAGGLE_USERNAME || '';
    if (sub === 'setup') {
        const token = readToken();
        const v = kaggle(['--version'], cfgDir);
        console.log(`kaggle CLI: ${v.ok ? 'found' : 'NOT found. Install it: pip install kaggle'}`);
        console.log(`token: ${token ? 'found (' + token.length + ' chars)' : 'MISSING. Put KAGGLE_API_TOKEN=<token> in ' + path.join(home(), '.env') + ' (Kaggle, Settings, API)'}`);
        if (val('--user'))
            writeConfig({ ...readConfig(), username: val('--user') });
        console.log(`account name: ${user || 'not set. Run: setup --user <your kaggle username>'}`);
        console.log(`model ${exports.MODEL}, caps ${JSON.stringify(exports.CAPS)}; free quota is about ${exports.LIMITS.weekHours} GPU hours a week.`);
        if (!v.ok || !token || !user)
            process.exitCode = 3;
        return;
    }
    if (sub === 'usage') {
        const rows = readLedger(root);
        const used = weekMinutes(rows);
        console.log(`last 7 days: ${Math.round(used)} min of ${exports.LIMITS.weekHours * 60} (${Math.round((used / (exports.LIMITS.weekHours * 60)) * 100)}%), ${rows.length} job(s) in the local ledger. The Kaggle account page is the truth.`);
        return;
    }
    if (sub === 'status' || sub === 'stop') {
        const rows = readLedger(root);
        const open = rows.filter((r) => !r.finished);
        if (!open.length) {
            console.log('no open session in the local ledger');
            return;
        }
        const last = open[open.length - 1];
        if (sub === 'status') {
            const r = kaggle(['kernels', 'status', last.kernel], cfgDir);
            console.log(`${last.kernel}: ${r.out.split('\n').pop()}`);
            return;
        }
        const r = kaggle(['kernels', 'delete', last.kernel, '--yes'], cfgDir);
        last.finished = new Date().toISOString();
        last.status = r.ok ? 'stopped' : 'stop-failed';
        last.minutes = Math.ceil((Date.now() - Date.parse(last.started)) / 60000);
        writeLedger(root, rows);
        console.log(r.ok ? `stopped ${last.kernel} (the notebook is deleted; Kaggle has no cancel)` : `stop failed: ${r.out.slice(0, 200)}. Stop it on the Kaggle site.`);
        return;
    }
    if (sub === 'review') {
        const f = path.join(stateDir(root), 'last-report.txt');
        console.log(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'no report yet: run "run <plan.md>" first');
        return;
    }
    const planFile = a[1] && !a[1].startsWith('--') ? path.resolve(a[1]) : '';
    const standards = val('--standards');
    let planPath = planFile;
    const lastPlan = path.join(stateDir(root), 'last-plan.txt');
    if ((sub === 'fetch' || sub === 'retry') && !planPath) {
        try {
            planPath = fs.readFileSync(lastPlan, 'utf8').trim();
        }
        catch { /* none */ }
    }
    if (!planPath || !fs.existsSync(planPath)) {
        console.error(sub === 'plan' || sub === 'run' ? `error: pass a plan file. ${usage}` : 'error: no earlier run for this project. Run "run <plan.md>" first.');
        process.exitCode = sub === 'plan' || sub === 'run' ? 2 : 1;
        return;
    }
    const pj = planJobs(planPath, root, standards ? path.resolve(standards) : undefined);
    if (sub === 'plan') {
        const est = estimate(pj.jobs.tasks.map((t) => t.prompt));
        console.log(`kaggle plan: ${pj.tasks.length} task(s), about ${est.gpuMinutes} GPU min (${Math.round((est.gpuMinutes / (exports.LIMITS.weekHours * 60)) * 100)}% of a week)`);
        for (const p of [...pj.lint.problems, ...pj.notes])
            console.log('  ' + p);
        if (!pj.lint.problems.length)
            console.log('  schema OK. Next: run ' + path.basename(planPath));
        process.exitCode = pj.lint.problems.length ? 1 : 0;
        return;
    }
    if (sub === 'run' || sub === 'retry') {
        if (!user) {
            console.error('error: no Kaggle account name. Run: setup --user <your kaggle username>');
            process.exitCode = 3;
            return;
        }
        if (!readToken()) {
            console.error('error: no Kaggle token. Run: setup');
            process.exitCode = 3;
            return;
        }
        let jobs = pj.jobs;
        let tasks = pj.tasks;
        if (sub === 'run' && pj.lint.problems.length) {
            console.error('plan has problems; fix them first:\n  ' + pj.lint.problems.join('\n  '));
            process.exitCode = 1;
            return;
        }
        if (sub === 'retry') {
            let prev;
            try {
                prev = JSON.parse(fs.readFileSync(path.join(stateDir(root), 'last-fail.json'), 'utf8'));
            }
            catch {
                console.log('nothing to retry');
                return;
            }
            if (prev.round >= 2) {
                console.log('two rounds already used: route the rest to Claude (review)');
                return;
            }
            tasks = tasks.filter((t) => prev.failed.some((f) => f.id === t.id));
            jobs = { tasks: jobs.tasks.filter((j) => tasks.some((t) => t.id === j.id)).map((j) => ({ id: j.id, prompt: j.prompt + '\n\nYOUR PREVIOUS ANSWER FAILED THESE CHECKS. Fix them and output the complete file(s) again:\n- ' + (prev.failed.find((f) => f.id === j.id)?.findings.join('\n- ') || '') })) };
        }
        const est = estimate(jobs.tasks.map((t) => t.prompt));
        const rows = readLedger(root);
        const block = budgetCheck(rows, est.gpuMinutes, flag('--force'));
        if (block) {
            console.error('blocked: ' + block);
            process.exitCode = 3;
            return;
        }
        const slug = `adk-${slugFor(root)}`;
        const work = path.join(stateDir(root), 'push');
        fs.rmSync(work, { recursive: true, force: true });
        fs.mkdirSync(work, { recursive: true });
        fs.writeFileSync(path.join(work, 'worker.ipynb'), buildNotebook(jobs, workerSource()));
        fs.writeFileSync(path.join(work, 'kernel-metadata.json'), JSON.stringify(kernelMetadata(user, slug), null, 2));
        fs.writeFileSync(lastPlan, planPath);
        const push = kaggle(['kernels', 'push', '-p', work], cfgDir);
        if (!push.ok) {
            console.error('push failed: ' + push.out.slice(0, 300));
            process.exitCode = 1;
            return;
        }
        const row = { id: crypto.randomBytes(3).toString('hex'), kernel: `${user}/${slug}`, started: new Date().toISOString(), status: 'running', tasks: jobs.tasks.length };
        rows.push(row);
        writeLedger(root, rows);
        console.log(`pushed ${row.kernel} with ${jobs.tasks.length} task(s); about ${est.gpuMinutes} GPU min. https://www.kaggle.com/code/${row.kernel}`);
        if (flag('--no-wait')) {
            console.log('not waiting. Later: fetch');
            return;
        }
        const poll = Number(val('--poll') ?? 30);
        for (let i = 0; i < 400; i++) {
            const s = kaggle(['kernels', 'status', row.kernel], cfgDir).out;
            if (/COMPLETE/.test(s))
                break;
            if (/ERROR|CANCEL/.test(s)) {
                row.finished = new Date().toISOString();
                row.status = 'error';
                row.minutes = Math.ceil((Date.now() - Date.parse(row.started)) / 60000);
                writeLedger(root, rows);
                console.error('kernel ended with an error: see the Kaggle page. ' + s.split('\n').pop());
                process.exitCode = 1;
                return;
            }
            sleep(poll);
        }
    }
    // fetch (also the tail of run/retry)
    const rows = readLedger(root);
    const row = [...rows].reverse().find((r) => !r.finished) || rows[rows.length - 1];
    if (!row) {
        console.error('error: nothing in the ledger');
        process.exitCode = 1;
        return;
    }
    const runDir = path.join(stateDir(root), 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(runDir, { recursive: true });
    const o = kaggle(['kernels', 'output', row.kernel, '-p', runDir], cfgDir);
    if (!o.ok) {
        console.error('fetch failed (still running?): ' + o.out.slice(0, 200));
        process.exitCode = 1;
        return;
    }
    let results = null;
    try {
        results = JSON.parse(fs.readFileSync(path.join(runDir, 'results.json'), 'utf8'));
    }
    catch { /* no results */ }
    if (!row.finished) {
        row.finished = new Date().toISOString();
        row.status = 'done';
        row.minutes = Math.ceil(((results?.elapsed_s ?? 0) || (Date.now() - Date.parse(row.started)) / 1000) / 60);
        writeLedger(root, rows);
    }
    const stage = path.join(stateDir(root), 'staging');
    fs.mkdirSync(stage, { recursive: true });
    const ran = new Set((results?.tasks || []).map((t) => t.id));
    const rowsOut = stageResults(runDir, pj.tasks.filter((t) => !ran.size || ran.has(t.id)), stage);
    const text = report(rowsOut, stage, results);
    fs.writeFileSync(path.join(stateDir(root), 'last-report.txt'), text);
    let round = 0;
    try {
        round = JSON.parse(fs.readFileSync(path.join(stateDir(root), 'last-fail.json'), 'utf8')).round;
    }
    catch { /* first */ }
    const failed = rowsOut.filter((r) => r.findings.length).map((r) => ({ id: r.task, findings: r.findings }));
    fs.writeFileSync(path.join(stateDir(root), 'last-fail.json'), JSON.stringify({ round: sub === 'retry' ? round + 1 : sub === 'run' ? 0 : round, failed }));
    console.log(text);
}
if (require.main === module)
    main();
