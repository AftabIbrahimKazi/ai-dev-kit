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
