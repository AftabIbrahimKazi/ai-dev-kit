// Role loadouts: a named job (frontend, devops, seo...) mapped to the skills, standards and commands it needs. Pure keyword
// matching, no model call, no network, so it costs zero tokens until its one line is attached to a prompt.
//
//   node skill-scope.role.js list
//   node skill-scope.role.js show <role>
//   node skill-scope.role.js resolve [--skills a,b] [--archived c] <prompt words...>
//   node skill-scope.role.js apply <role> [--only]   (you chose the role: restores its archived skills, then prints the line;
//                                                    --only also archives every other per-session skill, so just the role stays loaded)
//
// resolve prints one line when a role is named outright ("as a frontend dev", "role: seo", "/role devops") or inferred from the
// prompt (2 distinct signal words and a lead over the next role), and prints nothing otherwise. --skills limits the line to
// skills actually installed; --archived marks the archived ones. Exit codes: 0 done, 1 error, 2 bad usage.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface Role { label: string; aliases: string[]; signals: string[]; includes?: string[]; skills: string[]; standards: string[]; commands: string[] }
export interface RoleFile { roles: Record<string, Role> }
export interface Resolved { id: string; how: 'named' | 'inferred'; hits: string[] }
export interface Loadout { label: string; skills: string[]; standards: string[]; commands: string[] }

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 'word' is a whole word (plural s/es allowed), 'word*' any word starting with it, a phrase or dotted word a substring.
export function rx(t: string): RegExp {
  if (t.endsWith('*')) return new RegExp('(?<![a-z0-9])' + esc(t.slice(0, -1)), 'i');
  if (/[\s.:-]/.test(t)) return new RegExp('(?<![a-z0-9])' + esc(t) + '(?![a-z0-9])', 'i');
  return new RegExp('(?<![a-z0-9])' + esc(t) + '(?:e?s)?(?![a-z0-9])', 'i');
}

// An alias alone ("docs", "security") is common prose, so naming a role takes a frame around it.
function namedRx(alias: string): RegExp {
  const a = esc(alias).replace(/\\? /g, '\\s+');
  const before = '(?:role\\s*[:=]\\s*|/role\\s+|(?:as|you\\s+are|you\'re|act\\s+as|acting\\s+as|working\\s+as|be|wear)\\s+(?:an?\\s+|the\\s+)?)';
  const after = '\\s+(?:role|hat|session|mode|dev|developer|engineer|work|task|lane)';
  return new RegExp('(?<![a-z0-9])(?:' + before + a + '(?![a-z0-9])|' + a + after + '(?![a-z0-9]))', 'i');
}

export function loadRoles(file?: string): RoleFile {
  return JSON.parse(fs.readFileSync(file ?? path.join(__dirname, fs.existsSync(path.join(__dirname, 'roles.json')) ? 'roles.json' : 'skill-scope.roles.json'), 'utf8')) as RoleFile;
}

export function resolveRole(text: string, rf: RoleFile): Resolved | null {
  const ids = Object.keys(rf.roles);
  for (const id of ids) {
    if (rf.roles[id].aliases.some((a) => namedRx(a).test(text))) return { id, how: 'named', hits: [] };
  }
  const hits = (id: string): string[] => rf.roles[id].signals.filter((t) => rx(t).test(text));
  const scored = ids.map((id) => ({ id, h: hits(id) })).filter((s) => s.h.length).sort((a, b) => b.h.length - a.h.length);
  const by = (id: string): string[] => scored.find((s) => s.id === id)?.h ?? [];
  if (by('frontend').length >= 2 && by('backend').length >= 2 && rf.roles.fullstack) {
    return { id: 'fullstack', how: 'inferred', hits: [...by('frontend'), ...by('backend')] };
  }
  const [top, next] = scored;
  if (!top || top.h.length < 2 || (next && top.h.length - next.h.length < 1)) return null;
  return { id: top.id, how: 'inferred', hits: top.h };
}

// The role's own lists plus those of every role it includes, deduplicated, own entries first.
export function loadout(id: string, rf: RoleFile, seen: Set<string> = new Set()): Loadout {
  const r = rf.roles[id];
  const out: Loadout = { label: r.label, skills: [...r.skills], standards: [...r.standards], commands: [...r.commands] };
  seen.add(id);
  for (const inc of r.includes ?? []) {
    if (seen.has(inc) || !rf.roles[inc]) continue;
    const l = loadout(inc, rf, seen);
    out.skills.push(...l.skills); out.standards.push(...l.standards); out.commands.push(...l.commands);
  }
  out.skills = [...new Set(out.skills)]; out.standards = [...new Set(out.standards)]; out.commands = [...new Set(out.commands)];
  return out;
}

// One line, or null. installed (when given) drops skills the project does not have; archived ones are marked with the command.
export function line(res: Resolved, rf: RoleFile, installed?: string[], archived: string[] = []): string {
  const l = loadout(res.id, rf);
  const have = (s: string): boolean => !installed || installed.includes(s) || archived.includes(s);
  const skills = l.skills.filter(have);
  const active = skills.filter((s) => !archived.includes(s));
  const arch = skills.filter((s) => archived.includes(s));
  const parts = [`role ${l.label} (${res.how === 'named' ? 'named by you' : 'inferred from: ' + res.hits.slice(0, 4).join(', ')})`];
  if (active.length) parts.push('skills: ' + active.join(', '));
  if (arch.length) parts.push('archived, run /unarchive <name> if needed: ' + arch.join(', '));
  if (l.standards.length) parts.push('read standards: ' + l.standards.map((s) => 'coding-standards/' + s).join(', '));
  if (l.commands.length) parts.push('commands: ' + l.commands.join(' '));
  return 'role-loadout (a suggestion, load only what the task needs): ' + parts.join('; ') + '.';
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    const rf = loadRoles();
    if (cmd === 'list') {
      for (const [id, r] of Object.entries(rf.roles)) console.log(`${id.padEnd(14)} ${r.label}${r.includes ? ' (= ' + r.includes.join(' + ') + ')' : ''}: ${loadout(id, rf).skills.join(', ') || '-'}`);
      return 0;
    }
    if (cmd === 'show') {
      const id = rest[0];
      if (!id || !rf.roles[id]) { console.error('error: unknown role "' + (id ?? '') + '". Run: node skill-scope/role.js list'); return 2; }
      console.log(JSON.stringify({ id, ...loadout(id, rf) }, null, 2));
      return 0;
    }
    if (cmd === 'resolve') {
      let installed: string[] | undefined; let archived: string[] = []; const words: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--skills') installed = (rest[++i] ?? '').split(',').filter(Boolean);
        else if (rest[i] === '--archived') archived = (rest[++i] ?? '').split(',').filter(Boolean);
        else words.push(rest[i]);
      }
      const res = resolveRole(words.join(' '), rf);
      if (res) console.log(line(res, rf, installed, archived));
      return 0;
    }
    if (cmd === 'apply') {
      const id = rest.find((x) => !x.startsWith('--'));
      const only = rest.includes('--only');
      if (!id || !rf.roles[id]) { console.error('error: unknown role "' + (id ?? '') + '". Run: node skill-scope/role.js list'); return 2; }
      const l = loadout(id, rf);
      const auto = path.join(__dirname, fs.existsSync(path.join(__dirname, 'auto.js')) ? 'auto.js' : 'skill-scope.auto.js');
      const r = spawnSync(process.execPath, [auto, 'apply', ...(only ? [] : ['--add-only']), '--quiet', '--keep', l.skills.join(',')], { encoding: 'utf8' });
      if (r.status !== 0) { console.error('error: restoring skills failed: ' + String(r.stderr || r.stdout).trim()); return 1; }
      if (String(r.stdout).trim()) console.log(String(r.stdout).trim());
      console.log(line({ id, how: 'named', hits: [] }, rf));
      return 0;
    }
    console.error('usage: role.js list | show <role> | apply <role> [--only] | resolve [--skills a,b] [--archived c] <prompt words...>');
    return 2;
  } catch (e) {
    console.error('error: ' + (e instanceof Error ? e.message : String(e)));
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
