// Automatic half of skill-scope: archives every per-session-archivable skill, then restores the ones the
// stated task names. Run by the /next command and by the session hooks, so nobody has to remember it.
//
//   node skill-scope.auto.js apply  [--root <target>] [--keep a,b] [--add-only] [--quiet] [--dry-run] [--json] [task words...]
//   node skill-scope.auto.js status --root <target> [--json]
//
// apply: with no --task, every archivable skill is archived (the session-start default). With a task, a
// skill whose trigger words appear in it is restored; the rest are archived. --keep forces skills on.
// --add-only restores matches and archives nothing (the per-prompt hook, so a later vague message never
// archives what an earlier one loaded). --quiet prints only when a skill was restored (hook output enters
// the model's context, so silence is the default cost). The archivable set and the trigger words live in skill-scope.triggers.json, the single source.
// Moves skills only through install-kit.cli's archive/unarchive, so it never touches a folder the kit did
// not install. No network. Exit codes: 0 done, 1 error, 2 bad usage.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as MoveModule from './skill-scope.move';

// Installed, companions lose the skill prefix (move.js, triggers.json); in the library they keep it.
function sibling<T>(installed: string, library: string, load: (p: string) => T): T {
  const p = path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library);
  return load(p);
}
const { doArchive, doUnarchive, readManifest } = sibling('move.js', 'skill-scope.move.js', (p) => require(p) as typeof MoveModule);

// A skill maps to its trigger words, or to { triggers, locked }: when a project file in locked.files exists and
// contains locked.contains, locked.triggers replace the normal ones (a finished theme restores its design
// skill only on expansion words, not on every colour mention).
export interface Locked { files: string[]; contains: string; triggers: string[] }
export type Entry = string[] | { triggers: string[]; locked?: Locked };
export interface Triggers { skills: Record<string, Entry> }
export interface Plan { archive: string[]; restore: string[]; keep: string[]; loaded: string[] }

export function loadTriggers(file?: string): Triggers {
  return JSON.parse(fs.readFileSync(file ?? sibling('triggers.json', 'skill-scope.triggers.json', (p) => p), 'utf8')) as Triggers;
}

// 'word' is a whole word (plural s/es allowed); 'word*' is any word starting with it.
function triggerRegex(t: string): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.endsWith('*')
    ? new RegExp('(?<![a-z0-9])' + esc(t.slice(0, -1)), 'i')
    : new RegExp('(?<![a-z0-9])' + esc(t) + '(?:e?s)?(?![a-z0-9])', 'i');
}

function isLocked(l: Locked, root: string | undefined): boolean {
  if (!root) return false;
  return l.files.some((f) => {
    try { return fs.readFileSync(path.join(root, f), 'utf8').toLowerCase().includes(l.contains.toLowerCase()); } catch { return false; }
  });
}

function activeTriggers(e: Entry, root: string | undefined): string[] {
  if (Array.isArray(e)) return e;
  return e.locked && isLocked(e.locked, root) ? e.locked.triggers : e.triggers;
}

export function matchSkills(task: string, triggers: Triggers, root?: string): string[] {
  return Object.keys(triggers.skills).filter((name) => activeTriggers(triggers.skills[name], root).some((t) => triggerRegex(t).test(task)));
}

// Pure: decides what moves, given what is installed and archived right now.
export function plan(task: string, forced: string[], triggers: Triggers, installed: string[], archived: string[], root?: string): Plan {
  const wanted = new Set([...matchSkills(task, triggers, root), ...forced]);
  const set = Object.keys(triggers.skills);
  return {
    archive: set.filter((n) => installed.includes(n) && !wanted.has(n)),
    restore: set.filter((n) => archived.includes(n) && wanted.has(n)),
    keep: set.filter((n) => installed.includes(n) && wanted.has(n)),
    loaded: set.filter((n) => wanted.has(n) && (installed.includes(n) || archived.includes(n))),
  };
}

interface Args { cmd?: string; root?: string; task: string; keep: string[]; dryRun: boolean; json: boolean; addOnly: boolean; quiet: boolean }

function parseArgs(argv: string[]): Args | null {
  const a: Args = { task: '', keep: [], dryRun: false, json: false, addOnly: false, quiet: false };
  const [cmd, ...rest] = argv;
  if (cmd !== 'apply' && cmd !== 'status') return null;
  a.cmd = cmd;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--root') a.root = rest[++i];
    else if (f === '--task') a.task = rest[++i] ?? '';
    else if (f === '--keep') a.keep = (rest[++i] ?? '').split(',').filter(Boolean);
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--json') a.json = true;
    else if (f === '--add-only') a.addOnly = true;
    else if (f === '--quiet') a.quiet = true;
    else if (f.startsWith('--')) return null;
    else a.task = (a.task + ' ' + f).trim();
  }
  return a;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('usage: skill-scope.auto.js apply|status [--root <target>] [--keep a,b] [--add-only] [--quiet] [--dry-run] [--json] [task words...]');
    process.exitCode = 2;
    return;
  }
  let root = args.root;
  if (!root) {
    if (!fs.existsSync(path.join(process.cwd(), '.ai-dev-kit.json'))) {
      console.error('error: no --root and no .ai-dev-kit.json in the current folder. Pass --root <target project>.');
      process.exitCode = 1;
      return;
    }
    root = process.cwd();
    if (!args.quiet) console.error('assumed --root ' + root);
  }
  try {
    const manifest = readManifest(root);
    if (!manifest.tool) throw new Error('no install manifest at ' + path.join(root, '.ai-dev-kit.json') + ' -- run install-kit first');
    const p = plan(args.task, args.keep, loadTriggers(), Object.keys(manifest.skills), Object.keys(manifest.archived), root);
    if (args.addOnly) p.archive = [];
    if (args.cmd === 'apply' && !args.dryRun) {
      if (p.archive.length) doArchive({ root, skills: p.archive });
      if (p.restore.length) doUnarchive({ root, skills: p.restore });
    }
    if (args.quiet && !p.restore.length) return;
    if (args.json) console.log(JSON.stringify({ dryRun: args.dryRun, ...p }));
    else console.log((args.dryRun || args.cmd === 'status' ? 'would archive ' : 'archived ') + p.archive.length +
      (p.restore.length ? ', restored ' + p.restore.join(', ') + ' (read ' + p.restore.map((n) => manifest.skillRoot + '/' + n + '/SKILL.md').join(', ') + ' now)' : '') + (p.loaded.length ? '; active for this task: ' + p.loaded.join(', ') : '; none active'));
  } catch (e) {
    console.error('error: ' + (e as Error).message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
