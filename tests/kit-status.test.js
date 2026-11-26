// Kit status extension: the log reader, the tally, and extension.js run against a stub vscode (flash, counter, notices).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const lib = require('../extensions/kit-status/lib.js');

let failed = 0;
const check = (name, ok, extra) => { if (ok) console.log('ok   ' + name); else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); } };
const row = (o) => JSON.stringify({ v: 1, t: new Date().toISOString(), sid: 's1', project: 'proj', kind: 'skill', name: 'code-audit', ...o }) + '\n';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- lib ----
  check('slug matches the mod rule', lib.slug('c:\\wamp64\\www\\My Projects\\ai\\ai-dev-kit') === 'c-wamp64-www-My-Projects-ai-ai-dev-kit' && lib.slug('') === 'project' && lib.slug('/' + 'x'.repeat(80)).length === 60);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-home-'));
  process.env.AI_DEV_KIT_HOME = home;
  const dir = lib.logDir();
  fs.mkdirSync(dir, { recursive: true });
  check('no config file: tracking and notices on', JSON.stringify(lib.readConfig(home)) === '{"track":true,"notify":true}');
  fs.mkdirSync(path.join(home, 'usage'), { recursive: true });
  fs.writeFileSync(path.join(home, 'usage', 'config.json'), '{"track":true,"notify":false}');
  check('explicit notify false wins', lib.readConfig(home).notify === false);
  fs.writeFileSync(path.join(home, 'usage', 'config.json'), '{ broken');
  check('broken config falls back to defaults', lib.readConfig(home).notify === true);
  fs.rmSync(path.join(home, 'usage', 'config.json'));

  check('parseRows skips blanks, garbage and half lines', lib.parseRows(row({}) + '\n{"kind":"x"\nnot json\n' + row({ name: 'b' }).trim()).length === 2);

  const f = path.join(dir, '2026-11-27-s1.jsonl');
  fs.writeFileSync(f, row({ name: 'old' }));
  let r = lib.readNew(dir, {}, true);
  check('skipExisting records ends and returns no rows', r.rows.length === 0 && r.offsets[f] > 0);
  const off0 = r.offsets;
  r = lib.readNew(dir, off0);
  check('nothing new, nothing returned', r.rows.length === 0);
  fs.appendFileSync(f, row({ name: 'new1' }) + '{"v":1,"name":"half"');
  r = lib.readNew(dir, off0);
  check('a new complete row is read, the half line waits', r.rows.length === 1 && r.rows[0].name === 'new1');
  fs.appendFileSync(f, ',"kind":"skill"}\n');
  r = lib.readNew(dir, r.offsets);
  check('the half line is read once it completes', r.rows.length === 1 && r.rows[0].name === 'half');
  fs.writeFileSync(f, '');
  r = lib.readNew(dir, r.offsets);
  check('a truncated file restarts without a crash', r.rows.length === 0);
  const again = lib.readNew(path.join(home, 'nope'), {});
  check('a missing log folder is an empty read', again.rows.length === 0);

  const t = lib.createTally('proj');
  const a = t.add({ sid: 's1', project: 'proj', kind: 'skill', name: 'x' });
  const b2 = t.add({ sid: 's1', project: 'proj', kind: 'skill', name: 'x' });
  const c = t.add({ sid: 's1', project: 'other', kind: 'skill', name: 'y' });
  const d = t.add({ sid: 's2', project: 'proj', kind: 'skill', name: 'x' });
  check('tally: first use per session flagged once, other project ignored', a.first && !b2.first && c === null && d.first && t.total() === 3 && t.features() === 1);
  check('tally list is sorted by uses', t.list()[0] === 'skill x x3');
  check('all-projects tally counts every folder', lib.createTally('').add({ sid: 's', project: 'z', kind: 'command', name: 'k' }) !== null);
  check('labels and bar text', lib.labelOf({ kind: 'script', name: 'a/b.js', detail: 'show' }) === 'script a/b.js show' && lib.barText(t, { track: false }).includes('off') && lib.barText(t, { track: true }).includes('kit: 1'));

  // ---- extension.js against a stub vscode ----
  const flashes = [], popups = [], infos = [];
  const settings = { popup: false, allProjects: false };
  const bar = { text: '', tooltip: '', command: '', shown: false, show() { this.shown = true; }, dispose() {} };
  const cmds = {};
  const vscodeStub = {
    StatusBarAlignment: { Right: 2 },
    window: {
      createStatusBarItem: () => bar,
      setStatusBarMessage: (m) => { flashes.push(m); },
      showInformationMessage: (m) => { infos.push(m); popups.push(m); return Promise.resolve(); },
      showWarningMessage: () => Promise.resolve(),
      showQuickPick: (l) => { cmds.picked = l; return Promise.resolve(); },
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: 'c:\\work\\proj' } }],
      getConfiguration: () => ({ get: (k) => settings[k] }),
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    },
    commands: { registerCommand: (id, fn) => { cmds[id] = fn; return { dispose() {} }; } },
  };
  const origLoad = Module._load;
  Module._load = function (req, ...rest) { return req === 'vscode' ? vscodeStub : origLoad.call(this, req, ...rest); };
  const ext = require('../extensions/kit-status/extension.js');
  Module._load = origLoad;

  const subs = [];
  fs.writeFileSync(f, row({ name: 'history', project: lib.slug('c:\\work\\proj') }));
  ext.activate({ subscriptions: subs });
  check('counter appears on activation, history not flashed', bar.shown && /kit: 0/.test(bar.text) && flashes.length === 0);

  const mine = lib.slug('c:\\work\\proj');
  fs.appendFileSync(f, row({ name: 'code-audit', project: mine }) + row({ name: 'code-audit', project: mine }) + row({ name: 'elsewhere', project: 'other' }));
  await wait(1900);
  check('first use flashes once; counter counts features', flashes.length === 1 && /skill code-audit/.test(flashes[0]) && /kit: 1/.test(bar.text), JSON.stringify({ flashes, text: bar.text }));
  check('other project is not counted', !/elsewhere/.test(JSON.stringify(flashes)));

  settings.popup = true;
  fs.appendFileSync(f, row({ name: 'second', project: mine }));
  await wait(1900);
  check('popup setting uses a notification instead', popups.length === 1 && /second/.test(popups[0]));
  settings.popup = false;

  await cmds['kitStatus.toggleNotices']();
  check('toggle writes notify false to the shared config', lib.readConfig(home).notify === false);
  flashes.length = 0;
  fs.appendFileSync(f, row({ name: 'quiet', project: mine }));
  await wait(1900);
  check('notices off: no flash, counter still counts', flashes.length === 0 && /kit: 3/.test(bar.text), bar.text);

  await cmds['kitStatus.show']();
  check('the list command offers the features used', Array.isArray(cmds.picked) && cmds.picked.length === 3);

  fs.writeFileSync(path.join(home, 'usage', 'config.json'), '{"track":false,"notify":true}');
  await wait(1900);
  check('tracking off shows the off state', /off/.test(bar.text));

  for (const s of subs) s.dispose();
  const probe = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensions', 'kit-status', 'package.json'), 'utf8'));
  check('package declares both commands', probe.contributes.commands.length === 2);
  if (failed) process.exit(1);
})();
