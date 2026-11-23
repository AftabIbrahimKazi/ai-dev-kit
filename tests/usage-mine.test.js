const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { mineTranscript, isRetry, rank, readUsageLogs, render } = require('../skills/meta/usage-mine.js');
const MINE = path.join(__dirname, '../skills/meta/usage-mine.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'usage-mine-'));

const user = (text) => JSON.stringify({ type: 'user', sessionId: 's1', message: { role: 'user', content: text } });
const asst = (id, blocks, out = 10) => JSON.stringify({ type: 'assistant', sessionId: 's1', message: { id, role: 'assistant', content: blocks, usage: { input_tokens: 5, output_tokens: out, cache_creation_input_tokens: 100 } } });
const skill = (name) => ({ type: 'tool_use', id: 'x', name: 'Skill', input: { skill: name } });
const errRes = JSON.stringify({ type: 'user', sessionId: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content: 'boom' }] } });

const fixture = [
  user('please add a login form to the settings page'),
  asst('m1', [skill('pre-commit')]),
  errRes,
  asst('m1', [{ type: 'text', text: 'done' }]), // same message id: tokens counted once
  user('no that is wrong, the button is missing'),
  asst('m2', [{ type: 'text', text: 'fixed' }]),
  user('<task-notification>ignore me</task-notification>'),
].join('\n');

t('a negative reply after an assistant turn counts as a retry', () => {
  const s = mineTranscript(fixture, 'fx');
  assert.strictEqual(s.sid, 's1');
  assert.strictEqual(s.prompts, 2);
  assert.strictEqual(s.retries, 1);
  assert.deepStrictEqual(s.skills, ['pre-commit']);
  assert.deepStrictEqual(s.retryAfterLoad, ['pre-commit']);
});

t('tool errors counted; tokens deduped by message id', () => {
  const s = mineTranscript(fixture, 'fx');
  assert.strictEqual(s.toolErrors, 1);
  assert.strictEqual(s.tokens, (5 + 10 + 100) + (5 + 10 + 100));
});

t('a repeated prompt is a retry, an unrelated one is not', () => {
  assert.ok(isRetry('add a login form to the settings page please', 'please add a login form to the settings page'));
  assert.ok(!isRetry('now write the changelog entry for release', 'please add a login form to the settings page'));
  assert.ok(!isRetry('looks good, thanks', null));
});

t('a retry before any load does not blame the later skill', () => {
  const text = [user('do the thing now please'), asst('a', [{ type: 'text', text: 'ok' }]), user('no, wrong'), asst('b', [skill('debug-protocol')])].join('\n');
  const s = mineTranscript(text, 'fx');
  assert.strictEqual(s.retries, 1);
  assert.deepStrictEqual(s.retryAfterLoad, []);
});

t('a torn line is skipped', () => {
  const s = mineTranscript(fixture + '\n{"type":"user","mess', 'fx');
  assert.strictEqual(s.retries, 1);
});

t('rank orders by loads and merges feature-usage skills', () => {
  const a = mineTranscript(fixture, 'a');
  const b = { sid: 'z', prompts: 1, retries: 0, toolErrors: 0, tokens: 50, skills: [], retryAfterLoad: [] };
  const rows = rank([a, b], new Map([['z', ['pre-commit', 'ui-standards']]]));
  assert.strictEqual(rows[0].skill, 'pre-commit');
  assert.strictEqual(rows[0].loads, 2);
  assert.strictEqual(rows[0].retrySessions, 1);
  assert.strictEqual(rows[0].retryRate, 0.5);
  assert.ok(rows.some((r) => r.skill === 'ui-standards'));
});

t('readUsageLogs reads skill rows by session', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'proj'));
  fs.writeFileSync(path.join(d, 'proj', 'day-s1.jsonl'), JSON.stringify({ sid: 's1', kind: 'skill', name: 'perf-audit' }) + '\n' + JSON.stringify({ sid: 's1', kind: 'command', name: 'next' }) + '\n');
  assert.deepStrictEqual(readUsageLogs(d).get('s1'), ['perf-audit']);
  assert.strictEqual(readUsageLogs(path.join(d, 'missing')).size, 0);
});

t('CLI prints a table and never prints prompt text', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 's1.jsonl'), fixture);
  const r = spawnSync(process.execPath, [MINE, '--project', d, '--usage', path.join(d, 'none')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('| pre-commit | 1 | 1 | 100% |'));
  assert.ok(!r.stdout.includes('login form'));
});

t('render handles no skill loads', () => {
  assert.ok(render([], [], false).includes('No skill loads found'));
});

// ---- gaps found by `invariants probe` on usage-mine.js ----
// Regenerate the golden on purpose with UPDATE_GOLDEN=1 node tests/usage-mine.test.js, then read the diff.
const BS = String.fromCharCode(92), CRX = String.fromCharCode(13);
const asstM = (sid, id, blocks, usage = { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3 }) => JSON.stringify({ type: 'assistant', sessionId: sid, message: { id, role: 'assistant', content: blocks, usage } });
const userM = (sid, content, extra = {}) => JSON.stringify({ type: 'user', sessionId: sid, message: { role: 'user', content }, ...extra });
const useT = (name, input) => ({ type: 'tool_use', id: 'u-' + name, name, input });
const resT = (isErr) => ({ type: 'tool_result', tool_use_id: 'x', is_error: isErr, content: 'r' });

const SA = [
	userM('sa', 'add a settings page with a login form please'),
	asstM('sa', 'a1', [useT('Skill', { skill: 'plug:pre-commit' }), useT('Read', { file_path: '/p/.claude/skills/code-audit/SKILL.md' }),
		useT('Read', { file_path: 'C:' + BS + 'x' + BS + 'skills' + BS + 'ui' + BS + 'ui-design' + BS + 'SKILL.md' }), useT('Read', { file_path: '/p/notes.md' }), useT('Skill', { skill: 42 }), useT('Read', { file_path: 7 })]),
	userM('sa', [resT(true), resT(false), resT(true)]),
	asstM('sa', 'a1', [{ type: 'text', text: 'done' }]),
	userM('sa', [{ type: 'text', text: 'no' }, { type: 'text', text: 'that is wrong' }]),
	asstM('sa', 'a2', [useT('Skill', { skill: 'pre-commit' })], { input_tokens: 10, output_tokens: 20 }),
	userM('sa', [{ type: 'text', text: '' }]),
	userM('sa', 'a meta line that must not count', { isMeta: true }),
	userM('sa', '<system-reminder>ignore</system-reminder>'),
	'{ torn line',
	JSON.stringify({ type: 'assistant', sessionId: 'sa', isSidechain: true, message: { id: 'sc', role: 'assistant', content: [useT('Skill', { skill: 'sidechain-only' })], usage: { input_tokens: 999 } } }),
	userM('sa', 'add a settings page with a login form please now'),
].join('\n');
const SB = [userM('sb', 'write the release notes for this version'), asstM('sb', 'b1', [{ type: 'text', text: 'ok' }], { input_tokens: 100 }), userM('sb', 'thanks, now something else entirely')].join('\n');
const SC = [userM('sc', 'refactor the billing module carefully'), asstM('sc', 'c1', [useT('Skill', { skill: 'code-audit' }), useT('Skill', { skill: 'code-audit' })], { output_tokens: 50 }), userM('sc', 'still not working, try again')].join('\n');

t('golden: mineTranscript and rank over transcripts with every block shape', () => {
	const stats = [mineTranscript(SA, 'sa'), mineTranscript(SB, 'sb'), mineTranscript(SC, 'sc')];
	const rows = rank(stats, new Map([['sb', ['extra-skill', 'code-audit']], ['zz', ['ignored']]]));
	const out = JSON.stringify({ stats, rows }, null, 1) + '\n';
	const file = path.join(__dirname, 'fixtures', 'usage-mine', 'mine.json');
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out); return; }
	assert.ok(fs.existsSync(file), 'missing golden (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(out, fs.readFileSync(file, 'utf8').split(CRX).join(''));
});

t('overlap needs four words each side, and a repeat of a prompt counts only at 70% overlap', () => {
	const { overlap } = require('../skills/meta/usage-mine.js');
	assert.strictEqual(overlap('alpha bravo charlie', 'alpha bravo charlie'), 0);
	assert.strictEqual(overlap('alpha bravo charlie delta', 'alpha bravo charlie delta'), 1);
	assert.strictEqual(overlap('alpha bravo charlie delta', 'alpha bravo charlie delta echo foxtrot'), 1);
	assert.ok(isRetry('alpha bravo charlie delta echo foxtrot golf', 'alpha bravo charlie delta echo foxtrot hotel'));
	assert.ok(!isRetry('alpha bravo charlie delta echo foxtrot golf', 'alpha bravo charlie xray yankee zulu kilo'));
	assert.ok(!isRetry('alpha bravo charlie delta', null));
	assert.ok(isRetry('no that is wrong', null));
});

t('median of session tokens: odd, even and unsorted; ties order by loads, then retry rate, then name', () => {
	const st = (sid, tokens, skills, retryAfterLoad = []) => ({ sid, prompts: 1, retries: 0, toolErrors: 0, tokens, skills, retryAfterLoad });
	const med = (xs) => rank(xs.map((tk, i) => st('s' + i, tk, ['x'])))[0].medianTokens;
	assert.strictEqual(med([1000, 9, 50, 2000]), 525);
	assert.strictEqual(med([5, 6]), 6);
	assert.strictEqual(med([30, 10, 20]), 20);
	assert.strictEqual(med([9, 10, 100]), 10);
	assert.strictEqual(med([7]), 7);
	const rows = rank([st('1', 1, ['b', 'a', 'c']), st('2', 1, ['b', 'a', 'c'], ['c']), st('3', 1, ['d'])]);
	assert.deepStrictEqual(rows.map((r) => r.skill), ['c', 'a', 'b', 'd']);
});

t('golden: the CLI text, JSON, --days, --out and usage-log merge over a fake project', () => {
	const proj = tmp(); const usage = tmp();
	fs.writeFileSync(path.join(proj, 'sa.jsonl'), SA); fs.writeFileSync(path.join(proj, 'sb.jsonl'), SB); fs.writeFileSync(path.join(proj, 'sc.jsonl'), SC);
	fs.writeFileSync(path.join(proj, 'notes.txt'), 'not a transcript');
	const old = new Date(Date.now() - 100 * 86400000); fs.utimesSync(path.join(proj, 'sc.jsonl'), old, old);
	fs.mkdirSync(path.join(usage, '2026-11'), { recursive: true });
	fs.writeFileSync(path.join(usage, '2026-11', 'a.jsonl'), [JSON.stringify({ kind: 'skill', sid: 'sb', name: 'extra-skill' }), JSON.stringify({ kind: 'other', sid: 'sb', name: 'nope' }), '{ torn'].join('\n'));
	const run = (...a) => { const r = spawnSync(process.execPath, [MINE, ...a], { encoding: 'utf8' }); return '$ ' + a.map((x) => (x.startsWith(proj) || x.startsWith(usage) ? (x.startsWith(proj) ? '<proj>' : '<usage>') + x.slice(x.startsWith(proj) ? proj.length : usage.length) : x)).join(' ') + ' (exit ' + r.status + ')' + String.fromCharCode(10) + r.stdout.split(CRX).join('').split(proj).join('<proj>').split(usage).join('<usage>') + r.stderr.split(CRX).join(''); };
	const out = path.join(tmp(), 'sub', 'report.md');
	const text = [run('--project', proj, '--usage', usage), run('--project', proj, '--usage', usage, '--days', '30'), run('--project', proj, '--usage', usage, '--json'),
		run('--project', proj, '--usage', path.join(usage, 'missing')), run('--project', proj, '--usage', usage, '--out', out), run('--project', path.join(proj, 'nowhere'), '--usage', path.join(usage, 'missing'))].join(String.fromCharCode(10)) + String.fromCharCode(10);
	assert.ok(fs.readFileSync(out, 'utf8').includes('# Usage mine report'), 'the --out file holds the report');
	const file = path.join(__dirname, 'fixtures', 'usage-mine', 'cli.txt');
	const cleaned = text.split(path.dirname(out)).join('<out>').split(out).join('<out>');
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, cleaned); return; }
	assert.ok(fs.existsSync(file), 'missing golden (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(cleaned, fs.readFileSync(file, 'utf8').split(CRX).join(''));
});

t('malformed records never throw: null blocks, a Read with no input, a non-Read file path, a first line with no session id', () => {
	const asstLine = (blocks) => JSON.stringify({ type: 'assistant', message: { id: 'm', role: 'assistant', content: blocks } });
	const text = [asstLine([null, { type: 'text', text: 'x' }, { type: 'tool_use', name: 'Read' }, { type: 'tool_use', name: 'Write', input: { file_path: '/p/skills/ui/SKILL.md' } }, { type: 'tool_use', name: 'Skill' }]),
		JSON.stringify({ type: 'user', message: { role: 'user', content: [null, { type: 'tool_result', is_error: true }] } })].join('\n');
	let st;
	assert.doesNotThrow(() => { st = mineTranscript(text, 'hint'); });
	assert.strictEqual(st.sid, 'hint', 'no session id in the file keeps the file name');
	assert.deepStrictEqual(st.skills, []);
	assert.strictEqual(st.toolErrors, 1);
});

t('--days 0 and a negative --days mean no cutoff', () => {
	const proj = tmp(); fs.writeFileSync(path.join(proj, 'a.jsonl'), SA);
	const old = new Date(Date.now() - 400 * 86400000); fs.utimesSync(path.join(proj, 'a.jsonl'), old, old);
	const n = (...a) => JSON.parse(spawnSync(process.execPath, [MINE, '--project', proj, '--usage', path.join(proj, 'none'), '--json', ...a], { encoding: 'utf8' }).stdout).sessions;
	assert.strictEqual(n('--days', '0'), 1);
	assert.strictEqual(n('--days', '-5'), 1);
	assert.strictEqual(n('--days', '30'), 0);
	assert.strictEqual(n(), 1);
});
