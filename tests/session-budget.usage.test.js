const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'session-budget.usage.js');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const mkHome = () => tmp('usage home ');
const run = (home, ...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: home } });
const slug = (cwd) => cwd.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project';
const logRows = (home, project, rows) => {
  const d = path.join(home, '.ai-dev-kit', 'usage', 'log'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '2026-11-11-s1.jsonl'), rows.map((r) => JSON.stringify({ v: 1, sid: 's1', project, ...r })).join('\n') + '\n');
};
const project = () => {
  const d = tmp('usage proj ');
  fs.mkdirSync(path.join(d, '.claude', 'skills', 'code-audit'), { recursive: true });
  fs.mkdirSync(path.join(d, '.claude', 'skills', 'perf-audit'), { recursive: true });
  fs.mkdirSync(path.join(d, '.claude', 'skills', 'diagram'), { recursive: true });
  fs.writeFileSync(path.join(d, '.claude', 'skills', 'code-audit', 'audit.js'), '');
  fs.writeFileSync(path.join(d, '.claude', 'skills', 'perf-audit', 'weigh.js'), '');
  fs.writeFileSync(path.join(d, '.claude', 'skills', 'diagram', 'cli.js'), '');
  fs.mkdirSync(path.join(d, '.claude', 'commands'), { recursive: true });
  for (const c of ['audit', 'perf', 'recon']) fs.writeFileSync(path.join(d, '.claude', 'commands', c + '.md'), '');
  return d;
};

t('with no config file tracking is ON by default; off and on write the config and keep the notice setting', () => {
  const h = mkHome();
  assert.match(run(h, 'status').stdout, /tracking ON \(default, no config file yet\), notices OFF/);
  assert.match(run(h, 'off').stdout, /tracking OFF, notices OFF/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(h, '.ai-dev-kit', 'usage', 'config.json'), 'utf8')), { track: false, notify: false });
  run(h, 'notify', 'on');
  assert.match(run(h, 'on').stdout, /tracking ON, notices ON/);
  assert.strictEqual(JSON.parse(run(h, 'status', '--json').stdout).config.notify, true);
});

t('a damaged config falls back to the defaults instead of failing', () => {
  const h = mkHome(); fs.mkdirSync(path.join(h, '.ai-dev-kit', 'usage'), { recursive: true });
  fs.writeFileSync(path.join(h, '.ai-dev-kit', 'usage', 'config.json'), '{ not json');
  assert.match(run(h, 'status').stdout, /tracking ON \(default/);
});

t('report counts uses and sessions per feature, groups by kind, and names what was installed but never used', () => {
  const h = mkHome(), p = project();
  logRows(h, slug(p), [
    { t: '2026-11-11T10:00:00Z', kind: 'script', name: 'code-audit/audit.js', detail: 'run' },
    { t: '2026-11-11T10:05:00Z', kind: 'script', name: 'code-audit/audit.js', detail: 'run' },
    { t: '2026-11-11T10:06:00Z', kind: 'command', name: 'audit' },
    { t: '2026-11-11T10:07:00Z', kind: 'skill', name: 'diagram' },
  ]);
  const out = run(h, 'report', '--cwd', p).stdout;
  assert.match(out, /4 use\(s\) in 1 session\(s\)\. Tracking is ON \(default\)/);
  assert.match(out, /Scripts run \(1\):\n +2x +code-audit\/audit\.js +\[run x2\]/);
  assert.match(out, /Commands typed \(1\):\n +1x +audit/);
  assert.match(out, /Skills loaded \(1\):\n +1x +diagram/);
  assert.match(out, /skills: +perf-audit\n/, 'code-audit counts as used through its script, diagram through its load');
  assert.match(out, /commands: +perf, recon\n/);
  assert.match(out, /scripts: +diagram\/cli\.js, perf-audit\/weigh\.js\n/);
});

t('report is per project unless --all-projects, and --days drops old rows', () => {
  const h = mkHome(), p = project();
  logRows(h, slug(p), [{ t: '2020-01-01T00:00:00Z', kind: 'skill', name: 'old-one' }, { t: new Date().toISOString(), kind: 'skill', name: 'fresh' }]);
  fs.appendFileSync(path.join(h, '.ai-dev-kit', 'usage', 'log', '2026-11-11-s1.jsonl'), JSON.stringify({ v: 1, sid: 's2', project: 'other-project', t: new Date().toISOString(), kind: 'skill', name: 'elsewhere' }) + '\n');
  const all = JSON.parse(run(h, 'report', '--cwd', p, '--json').stdout);
  assert.deepStrictEqual(all.entries.map((e) => e.name).sort(), ['fresh', 'old-one']);
  assert.deepStrictEqual(JSON.parse(run(h, 'report', '--cwd', p, '--days', '30', '--json').stdout).entries.map((e) => e.name), ['fresh']);
  const every = JSON.parse(run(h, 'report', '--cwd', p, '--all-projects', '--json').stdout);
  assert.ok(every.entries.some((e) => e.name === 'elsewhere') && every.unused === null);
});

t('an empty log says so, and a damaged line is skipped', () => {
  const h = mkHome(), p = project();
  assert.match(run(h, 'report', '--cwd', p).stdout, /Nothing recorded yet/);
  run(h, 'off');
  assert.match(run(h, 'report', '--cwd', p).stdout, /Tracking is off, so nothing is being recorded/);
  const d = path.join(h, '.ai-dev-kit', 'usage', 'log'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'x.jsonl'), 'garbage\n' + JSON.stringify({ sid: 's', project: slug(p), t: '2026-11-11T00:00:00Z', kind: 'skill', name: 'ok' }) + '\n');
  assert.strictEqual(JSON.parse(run(h, 'report', '--cwd', p, '--json').stdout).rows, 1);
});

t('reset needs --yes, deletes only the log and keeps the config; bad usage exits 2', () => {
  const h = mkHome();
  logRows(h, 'p', [{ t: '2026-11-11T00:00:00Z', kind: 'skill', name: 'a' }]);
  run(h, 'off');
  const refuse = run(h, 'reset');
  assert.strictEqual(refuse.status, 2);
  assert.ok(fs.existsSync(path.join(h, '.ai-dev-kit', 'usage', 'log', '2026-11-11-s1.jsonl')));
  assert.match(run(h, 'reset', '--yes').stdout, /deleted 1 log file/);
  assert.ok(!fs.existsSync(path.join(h, '.ai-dev-kit', 'usage', 'log', '2026-11-11-s1.jsonl')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(h, '.ai-dev-kit', 'usage', 'config.json'), 'utf8')).track, false);
  for (const bad of [[], ['wat'], ['notify'], ['notify', 'maybe'], ['report', '--days', 'x']]) assert.strictEqual(run(h, ...bad).status, 2, bad.join(' '));
});
