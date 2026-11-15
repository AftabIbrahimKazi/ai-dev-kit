#!/usr/bin/env node
// Goldfish plan review: reviewers that start with NO conversation, read only the plan and the files it names, and are
// told to find what the author cannot see. The method is the Elephant-Goldfish idea (Google, open source); the stage
// prompts below are this kit's own wording. Plain Node, no dependencies.
//
//   node goldfish.js prepare <plan.md> [--root <dir>]   write the bundle and the five stage prompts, print how to run them
//   node goldfish.js local   <plan.md> [--root <dir>] [--delay <seconds>]   run the stages on Gemini or Ollama (no Claude tokens)
//
// prepare: for the Claude path. It prints the dispatch text; Claude runs the stages inline, one after another (the kit's
//   agent-usage policy: no subagents unless the user asks). Same-context reviews are weaker than fresh-context ones; say so.
//   If the user asks for subagents, one FRESH subagent per stage (Read, Grep and Glob only, no CLAUDE.md, no conversation).
// local: the cheap path. The same prompts go to Gemini (if allowed), then Ollama, through plan-first/reviewer.js, and the
//   reports are written next to the bundle. Needs a reviewer other than "static" in .claude/state-audit.json.
// Files go to ~/.ai-dev-kit/goldfish/<plan>-<hash>/ (AI_DEV_KIT_HOME moves it), never into the project. Secret-looking files
//   and CLAUDE.md, AGENTS.md and handover notes are never put in the bundle.
// Exit codes: 0 done, 1 error, 2 bad usage, 3 blocked (no reviewer).
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import crypto = require('node:crypto');
import type * as ReviewerModule from './plan-first.reviewer';

function sibling<T>(installed: string, library: string): T {
  return require(path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library)) as T;
}
const rev = sibling<typeof ReviewerModule>('reviewer.js', 'plan-first.reviewer.js');

const MAX_FILES = 12;
const MAX_CHARS = 40000;
const NEVER = /(^|\/)(CLAUDE\.md|AGENTS\.md|handover(\.md|\/.*))$/i;
const STYLE = 'Reply in plain text, at most 12 lines, no greeting, no praise. One finding per line, starting with the plan line or step it concerns. If you find nothing, reply exactly: NOTHING FOUND.';

export interface Stage { id: number; name: string; usesBundle: boolean; needs: number[]; prompt: string }
export const STAGES: Stage[] = [
  { id: 1, name: 'zoom-out', usesBundle: true, needs: [], prompt: `You are a reviewer who has never seen this project or any conversation about it. Read the plan, then the referenced files. Zoom out: what is the plan trying to achieve, and does the whole plan serve it? Find missing assumptions, goals that conflict, steps that depend on something the plan never provides, and anything the plan assumes the reader already knows. ${STYLE}` },
  { id: 2, name: 'comprehension', usesBundle: false, needs: [], prompt: `You have only this plan, nothing else. First write two short paraphrases: what the feature is for, and what a builder must do, each in your own words. Then list every place where you could not paraphrase because the plan does not say (undefined terms, missing inputs and outputs, unnamed owners of a step). The test is whether the plan stands alone, not how detailed it is. ${STYLE}` },
  { id: 3, name: 'critic', usesBundle: true, needs: [], prompt: `You are three critics in one pass. Design critic: wrong or risky design choices and simpler alternatives. Structural critic: steps in the wrong order, steps that cannot be tested, missing error, empty and failure states, missing state transitions. Style critic: ambiguous words (should, usually, appropriate), numbers without units, two names for one thing. Prefix each line with DESIGN, STRUCTURE or STYLE. ${STYLE}` },
  { id: 4, name: 'zoom-out again', usesBundle: true, needs: [1, 2, 3], prompt: `You are the zoom-out reviewer again, now with the earlier reports. Focus on what the plan would still get wrong after those findings are fixed, and on any finding that, fixed naively, breaks another part of the plan. ${STYLE}` },
  { id: 5, name: 'implementation readiness', usesBundle: true, needs: [], prompt: `You are a builder about to start work with only this plan and the referenced files. List what blocks you from starting: a file or function the plan names that is not in the referenced files, a step with no clear done check, a decision left to you that changes other steps, a dependency not listed. ${STYLE}` },
];

export function slugOf(planFile: string): string {
  return path.basename(planFile).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
}

// Files the plan names that exist in the project, are not secrets, and are not the project's own instructions.
export function referencedFiles(root: string, plan: string): string[] {
  const found = new Set<string>();
  for (const m of plan.matchAll(/(?:^|[\s`(|:'"])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z]{1,6})(?=[\s`)|,;:'"]|$)/gm)) {
    const rel = m[1].replace(/^\.\//, '');
    if (found.size >= MAX_FILES || /^https?:/i.test(rel) || NEVER.test(rel) || rev.neverSend(rel)) continue;
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(path.resolve(root)) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    found.add(rel);
  }
  return [...found];
}

export interface Prepared { dir: string; bundle: string; planOnly: string; files: string[]; chars: number; stageFiles: string[] }

export function prepare(root: string, planFile: string, home = process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit')): Prepared {
  const abs = path.resolve(root, planFile);
  if (!fs.existsSync(abs)) throw new Error(`plan file ${planFile} does not exist`);
  const plan = fs.readFileSync(abs, 'utf8');
  const dir = path.join(home, 'goldfish', slugOf(planFile) + '-' + crypto.createHash('sha1').update(abs).digest('hex').slice(0, 6));
  fs.mkdirSync(dir, { recursive: true });
  const files = referencedFiles(root, plan);
  let chars = 0;
  const parts = ['# PLAN\n\n' + plan];
  const used: string[] = [];
  for (const f of files) {
    const body = fs.readFileSync(path.resolve(root, f), 'utf8');
    if (chars + body.length > MAX_CHARS) continue;
    chars += body.length;
    used.push(f);
    parts.push(`# REFERENCED FILE: ${f}\n\n${body}`);
  }
  const bundle = path.join(dir, 'bundle.md');
  const planOnly = path.join(dir, 'plan-only.md');
  fs.writeFileSync(bundle, parts.join('\n\n---\n\n'));
  fs.writeFileSync(planOnly, plan);
  const stageFiles = STAGES.map((s) => { const p = path.join(dir, `stage${s.id}-${s.name.replace(/\s+/g, '-')}.txt`); fs.writeFileSync(p, s.prompt + '\n'); return p; });
  return { dir, bundle, planOnly, files: used, chars, stageFiles };
}

export function dispatchText(p: Prepared): string {
  const lines = [
    `goldfish prepare: ${p.files.length} referenced file(s), ${p.chars} chars in ${p.bundle}`,
    'Run the stages YOURSELF, inline, one after another. Do NOT start subagents (agent-usage policy) unless the user asked for them in this request. For each stage: Read the prompt file, then follow it using only the listed material (plus earlier stage reports where marked). Keep each report to 12 lines or fewer and say in your summary that these were inline reviews, not fresh-context ones.',
    ...STAGES.map((s, i) => `  ${s.id}. ${s.name.padEnd(24)} prompt ${p.stageFiles[i]}  material ${s.usesBundle ? p.bundle : p.planOnly}${s.needs.length ? '  (after stages ' + s.needs.join(', ') + '; add their reports)' : ''}`),
    'Run stage 4 after stages 1-3. Take each report as written (12 lines or fewer), then YOU resolve the findings and decide: reviewers advise, they do not decide. Edit the plan, do not argue with a reviewer.',
  ];
  return lines.join('\n');
}

export async function runLocal(root: string, planFile: string, delayMs: number, env: NodeJS.ProcessEnv = process.env): Promise<{ reports: { stage: Stage; text: string; backend: string }[]; dir: string } | { blocked: string }> {
  const cfg = { ...rev.readConfig(root), timeoutMs: rev.readConfig(root).timeoutMs ?? 240000 }; // a CPU model needs minutes, not a hook's 25 s
  if (cfg.reviewer === 'static') return { blocked: 'No reviewer model is turned on for this project. Set "reviewer" to "ollama" or "auto" in .claude/state-audit.json, or run install-kit with --reviewer ollama. (The Claude path needs no setting: use goldfish prepare.)' };
  const p = prepare(root, planFile);
  const reports: { stage: Stage; text: string; backend: string }[] = [];
  const done = new Map<number, string>();
  for (const s of STAGES) {
    if (reports.length && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const material = fs.readFileSync(s.usesBundle ? p.bundle : p.planOnly, 'utf8');
    const earlier = s.needs.map((n) => `REPORT FROM STAGE ${n}:\n${done.get(n) || '(missing)'}`).join('\n\n');
    const r = await rev.generate(s.prompt, `${material}${earlier ? '\n\n' + earlier : ''}`, cfg, env);
    if (!('text' in r)) { if (!reports.length) return { blocked: `No model answered (${r.note}). Start Ollama, or set GEMINI_API_KEY in your shell.` }; reports.push({ stage: s, text: `(no answer: ${r.note})`, backend: 'none' }); continue; }
    const text = r.text.trim();
    done.set(s.id, text);
    fs.writeFileSync(path.join(p.dir, `report${s.id}.txt`), text + '\n');
    reports.push({ stage: s, text, backend: r.backend });
  }
  return { reports, dir: p.dir };
}

async function main(): Promise<void> {
  const a = process.argv.slice(2);
  const cmd = a[0];
  let root = process.cwd(), delay = 5;
  let plan = '';
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--root') root = path.resolve(a[++i] || '');
    else if (a[i] === '--delay') delay = Number(a[++i]);
    else if (a[i].startsWith('--')) { plan = ''; break; }
    else plan = plan || a[i];
  }
  if ((cmd !== 'prepare' && cmd !== 'local') || !plan || !Number.isFinite(delay)) { console.error('usage: goldfish.js prepare|local <plan.md> [--root <dir>] [--delay <seconds>]'); process.exitCode = 2; return; }
  try {
    if (cmd === 'prepare') { console.log(dispatchText(prepare(root, plan))); return; }
    const r = await runLocal(root, plan, delay * 1000);
    if ('blocked' in r) { console.log(r.blocked); process.exitCode = 3; return; }
    for (const x of r.reports) console.log(`stage ${x.stage.id} ${x.stage.name} (${x.backend}): ${/^NOTHING FOUND/i.test(x.text) ? 'nothing found' : x.text.split('\n').filter(Boolean).length + ' line(s)'}`);
    console.log(`reports in ${r.dir}`);
  } catch (e) { console.error('error: ' + (e as Error).message); process.exitCode = 1; }
}

if (require.main === module) void main();
