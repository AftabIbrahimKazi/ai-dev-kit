#!/usr/bin/env node
// Archive and restore for the skill-ablation skill (its Step 1 and the undo path). Moves the session-protocol file,
// the skill roots and the hooks block of the tool settings into a dated folder, with a manifest, so the bare run can
// be undone file for file. Never deletes; restore acts only on manifest entries. No network.
//
//   node archive.js archive [--root <project>] [--dry-run] [--json]       move to .ablation-archive/<date>/, write manifest
//   node archive.js restore [--root <project>] [--date YYYY-MM-DD] [--only name,name] [--dry-run] [--json]
//   node archive.js status  [--root <project>]                           archives present and what each holds
//
// What moves: CLAUDE.md, AGENTS.md, .claude/skills, .opencode/skills, .agents/skills, .claude/commands, the "hooks" key
// of .claude/settings.json (the rest of the file stays). restore --only takes archived skill names or the words
// session, commands, hooks. Exit codes: 0 done, 1 error, 2 bad usage, 3 nothing to archive or restore.
import fs = require('node:fs');
import path = require('node:path');

export const ARCHIVE_DIR = '.ablation-archive';
const SESSION_FILES = ['CLAUDE.md', 'AGENTS.md'];
const SKILL_ROOTS = ['.claude/skills', '.opencode/skills', '.agents/skills'];
const COMMAND_DIRS = ['.claude/commands'];
const SETTINGS = '.claude/settings.json';

export interface Manifest { date: string; moved: { from: string; to: string; kind: 'session' | 'skills' | 'commands'; skills?: string[] }[]; hooks?: { file: string; value: unknown } }

const norm = (p: string): string => p.split(path.sep).join('/');
const today = (): string => new Date().toISOString().slice(0, 10);

function listSkills(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
}

export function archive(root: string, dryRun = false, date = today()): Manifest {
  const dest = path.join(root, ARCHIVE_DIR, date);
  if (fs.existsSync(dest)) throw new Error('archive ' + norm(path.relative(root, dest)) + ' already exists; restore it or pick another day');
  const m: Manifest = { date, moved: [] };
  const plan = (rel: string, kind: Manifest['moved'][0]['kind']): void => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const entry: Manifest['moved'][0] = { from: rel, to: norm(path.join(date, rel)), kind };
    if (kind === 'skills') entry.skills = listSkills(abs);
    m.moved.push(entry);
  };
  for (const f of SESSION_FILES) plan(f, 'session');
  for (const d of SKILL_ROOTS) plan(d, 'skills');
  for (const d of COMMAND_DIRS) plan(d, 'commands');
  const settingsAbs = path.join(root, SETTINGS);
  let settings: Record<string, unknown> | null = null;
  if (fs.existsSync(settingsAbs)) {
    try { settings = JSON.parse(fs.readFileSync(settingsAbs, 'utf8')); } catch { throw new Error(SETTINGS + ' is not valid JSON; fix it before archiving'); }
    if (settings && settings.hooks && Object.keys(settings.hooks as object).length) m.hooks = { file: SETTINGS, value: settings.hooks };
  }
  if (!m.moved.length && !m.hooks) { const e = new Error('nothing to archive under ' + root); (e as Error & { code: number }).code = 3; throw e; }
  if (dryRun) return m;
  fs.mkdirSync(dest, { recursive: true });
  for (const mv of m.moved) {
    const to = path.join(root, ARCHIVE_DIR, mv.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(path.join(root, mv.from), to);
  }
  if (m.hooks && settings) {
    delete settings.hooks;
    fs.writeFileSync(settingsAbs, JSON.stringify(settings, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const gi = path.join(root, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!giText.split(/\r?\n/).includes(ARCHIVE_DIR + '/')) fs.writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + ARCHIVE_DIR + '/\n');
  return m;
}

function hasFiles(dir: string, except: string): boolean {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (hasFiles(path.join(dir, e.name), '')) return true; }
    else if (e.name !== except) return true;
  }
  return false;
}

export function archives(root: string): string[] {
  const dir = path.join(root, ARCHIVE_DIR);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'manifest.json'))).sort() : [];
}

export function restore(root: string, opt: { date?: string; only?: string[]; dryRun?: boolean }): { restored: string[]; kept: string[]; date: string } {
  const list = archives(root);
  if (!list.length) { const e = new Error('no archive under ' + norm(path.join(root, ARCHIVE_DIR))); (e as Error & { code: number }).code = 3; throw e; }
  const date = opt.date ?? list[list.length - 1];
  const dest = path.join(root, ARCHIVE_DIR, date);
  if (!fs.existsSync(path.join(dest, 'manifest.json'))) throw new Error('no manifest in ' + norm(path.relative(root, dest)));
  const m: Manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  const only = opt.only ? new Set(opt.only) : null;
  const restored: string[] = [], kept: string[] = [];
  const wants = (kind: string): boolean => !only || only.has(kind);
  const move = (from: string, to: string): void => {
    if (fs.existsSync(to)) throw new Error(norm(path.relative(root, to)) + ' already exists; remove it or restore --only something else');
    if (!opt.dryRun) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(from, to); }
  };
  for (const mv of m.moved) {
    const from = path.join(root, ARCHIVE_DIR, mv.to), to = path.join(root, mv.from);
    if (!fs.existsSync(from)) { kept.push(mv.from + ' (missing from archive)'); continue; }
    if (mv.kind === 'skills' && only) {
      const names = (mv.skills || listSkills(from)).filter((s) => only.has(s));
      for (const s of names) { move(path.join(from, s), path.join(to, s)); restored.push(mv.from + '/' + s); }
      const rest = (mv.skills || []).filter((s) => !only.has(s));
      if (rest.length) kept.push(mv.from + ': ' + rest.join(', '));
      continue;
    }
    if (!wants(mv.kind)) { kept.push(mv.from); continue; }
    move(from, to);
    restored.push(mv.from);
  }
  if (m.hooks) {
    if (wants('hooks')) {
      const sAbs = path.join(root, m.hooks.file);
      const s = fs.existsSync(sAbs) ? JSON.parse(fs.readFileSync(sAbs, 'utf8')) : {};
      if (s.hooks && Object.keys(s.hooks).length) kept.push('hooks (settings already has a hooks block)');
      else { s.hooks = m.hooks.value; if (!opt.dryRun) { fs.mkdirSync(path.dirname(sAbs), { recursive: true }); fs.writeFileSync(sAbs, JSON.stringify(s, null, 2) + '\n'); } restored.push('hooks in ' + m.hooks.file); }
    } else kept.push('hooks');
  }
  if (!opt.dryRun && !only) {
    if (!hasFiles(dest, 'manifest.json')) fs.rmSync(dest, { recursive: true, force: true });
  }
  return { restored, kept, date };
}

function renderManifest(m: Manifest, dry: boolean, root: string): string {
  const L: string[] = [dry ? `would archive to ${ARCHIVE_DIR}/${m.date}/:` : `archived to ${ARCHIVE_DIR}/${m.date}/ (gitignored):`];
  for (const mv of m.moved) L.push(`  ${mv.from}${mv.skills ? ` (${mv.skills.length} skills: ${mv.skills.join(', ')})` : ''}`);
  if (m.hooks) L.push(`  hooks block of ${m.hooks.file} (${Object.keys(m.hooks.value as object).join(', ')})`);
  L.push(`undo: node archive.js restore --root "${root}"`);
  L.push('Start the next session bare. Log every stumble; restore only on 3+ repeats.');
  return L.join('\n');
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const a: { root: string; date?: string; only?: string[]; dryRun: boolean; json: boolean } = { root: process.cwd(), dryRun: false, json: false };
  let ok = cmd === 'archive' || cmd === 'restore' || cmd === 'status';
  for (let i = 0; i < rest.length && ok; i++) {
    const f = rest[i];
    if (f === '--root') a.root = path.resolve(rest[++i] ?? '');
    else if (f === '--date') { a.date = rest[++i]; if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '')) ok = false; }
    else if (f === '--only') a.only = (rest[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--json') a.json = true;
    else ok = false;
  }
  if (!ok) { console.error('usage: archive.js archive|restore|status [--root <project>] [--date YYYY-MM-DD] [--only a,b] [--dry-run] [--json]'); process.exitCode = 2; return; }
  try {
    if (cmd === 'status') {
      const list = archives(a.root);
      if (a.json) { console.log(JSON.stringify(list.map((d) => JSON.parse(fs.readFileSync(path.join(a.root, ARCHIVE_DIR, d, 'manifest.json'), 'utf8'))))); return; }
      if (!list.length) { console.log('no ablation archive'); return; }
      for (const d of list) { const m: Manifest = JSON.parse(fs.readFileSync(path.join(a.root, ARCHIVE_DIR, d, 'manifest.json'), 'utf8')); console.log(`${d}: ${m.moved.map((x) => x.from + (x.skills ? ` (${x.skills.length})` : '')).join(', ')}${m.hooks ? ', hooks' : ''}`); }
      return;
    }
    if (cmd === 'archive') { const m = archive(a.root, a.dryRun); console.log(a.json ? JSON.stringify(m) : renderManifest(m, a.dryRun, a.root)); return; }
    const r = restore(a.root, a);
    if (a.json) { console.log(JSON.stringify(r)); return; }
    const v = a.dryRun ? 'would restore' : 'restored';
    console.log(`${v} from ${ARCHIVE_DIR}/${r.date}: ${r.restored.join(', ') || 'nothing'}`);
    if (r.kept.length) console.log('still archived: ' + r.kept.join('; '));
  } catch (e) {
    const err = e as Error & { code?: number };
    console.error('error: ' + err.message);
    process.exitCode = err.code === 3 ? 3 : 1;
  }
}

if (require.main === module) main();
