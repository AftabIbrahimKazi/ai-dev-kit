const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');
const { findScript, nudged, modeOf, parsePersonas, buildTree, trayItems } = require('../extensions/narrate-buttons/lib.js');

const t = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const norm = (p) => p && p.split(path.sep).join('/');
const have = (set) => (p) => set.includes(norm(p));

(async () => {
  await t('findScript: explicit path wins, then workspace install, workspace kit checkout, then home install', () => {
    assert.strictEqual(norm(findScript('speak', '/x/s.js', ['/w'], '/h', have(['/x/s.js', '/w/.claude/skills/narrate/speak.js']))), '/x/s.js');
    assert.strictEqual(norm(findScript('speak', '', ['/w'], '/h', have(['/w/.claude/skills/narrate/speak.js', '/h/.claude/skills/narrate/speak.js']))), '/w/.claude/skills/narrate/speak.js');
    assert.strictEqual(norm(findScript('laya', '', ['/kit'], '/h', have(['/kit/skills/addons/system1-prefilter.laya-ctl.js']))), '/kit/skills/addons/system1-prefilter.laya-ctl.js');
    assert.strictEqual(norm(findScript('persona', '', ['/w'], '/h', have(['/h/.claude/skills/personality/inject.js']))), '/h/.claude/skills/personality/inject.js');
    assert.strictEqual(findScript('laya', '', ['/w'], '/h', () => false), null);
  });
  await t('nudged: steps, clamps and rounds like speak.js', () => {
    assert.strictEqual(nudged('volume', { volume: 95 }, 1), 100);
    assert.strictEqual(nudged('volume', {}, -1), 90);
    assert.strictEqual(nudged('speed', { speed: 1 }, 1), 1.1);
    assert.strictEqual(nudged('speed', { speed: 0.5 }, -1), 0.5);
    assert.strictEqual(nudged('pitch', { pitch: -12 }, -1), -12);
    assert.strictEqual(nudged('maxSeconds', {}, 1), 1140);
  });
  await t('modeOf: manual (play button) unless the config says auto', () => {
    assert.strictEqual(modeOf({}), 'manual'); assert.strictEqual(modeOf({ mode: 'auto' }), 'auto'); assert.strictEqual(modeOf({ mode: 'x' }), 'manual');
  });
  await t('parsePersonas reads --list output and drops those not installed', () => {
    const p = parsePersonas('female novice: Sam\nfemale mid: Ria (not installed)\nmale pro: Kit\ncustom: not installed');
    assert.deepStrictEqual(p.map((x) => [x.gender, x.level]), [['female', 'novice'], ['male', 'pro']]);
  });
  await t('buildTree: narration and persona groups; a waiting reply highlights Play; steppers carry the context value', () => {
    const tree = buildTree({ conf: { volume: 80, mode: 'auto', gender: 'male' }, muted: true, pending: true, persona: 'Sam' });
    assert.deepStrictEqual(tree.map((g) => g.id), ['narration', 'persona']);
    const n = Object.fromEntries(tree[0].children.map((c) => [c.id, c]));
    assert.strictEqual(n.play.highlight, true); assert.strictEqual(n.play.command, 'narrateButtons.play');
    assert.match(n.mode.description, /auto/); assert.strictEqual(n.mute.description, 'muted'); assert.strictEqual(n.voice.description, 'male');
    assert.strictEqual(n.volume.description, '80'); assert.strictEqual(n.volume.contextValue, 'stepper'); assert.strictEqual(n.speed.description, '1');
    assert.match(buildTree({ conf: {}, muted: false, pending: false })[0].children[2].description, /play button/);
  });
  await t('trayItems: grouped rows under separators; settings rows keep the tray open, actions close it; steppers have no command', () => {
    const rows = trayItems({ conf: { volume: 70 }, muted: false, pending: true, persona: 'Sam' });
    assert.deepStrictEqual(rows.filter((r) => r.separator).map((r) => r.label), ['Narration', 'Persona', 'More']);
    const by = Object.fromEntries(rows.filter((r) => !r.separator).map((r) => [r.id, r]));
    assert.strictEqual(by.play.keepOpen, false); assert.strictEqual(by.play.highlight, true);
    assert.strictEqual(by.mute.keepOpen, true); assert.strictEqual(by.mode.keepOpen, true);
    assert.strictEqual(by.persona.keepOpen, false);
    assert.strictEqual(by.volume.stepper, true); assert.strictEqual(by.volume.key, 'volume'); assert.strictEqual(by.volume.command, undefined);
    assert.strictEqual(by.panel.command, 'narrateButtons.openPanel');
  });
  await t('activate: registers every command, builds the tree, and a click runs the right script flags', async () => {
    const cmds = {}; const spawned = []; let treeProvider; let qp;
    class Emitter { constructor() { this.event = () => ({ dispose() {} }); } fire() {} }
    const bar = () => ({ show() {}, hide() {} });
    const vscode = {
      workspace: { getConfiguration: () => ({ get: (k) => (k === 'speakPath' ? process.execPath : 'node') }), workspaceFolders: [{ uri: { fsPath: path.join(__dirname, '..') } }] },
      window: { createStatusBarItem: bar, createOutputChannel: () => ({ clear() {}, appendLine() {}, show() {}, dispose() {} }), createTreeView: (id, o) => { treeProvider = o.treeDataProvider; return { dispose() {} }; }, showWarningMessage() {}, showQuickPick: async () => null, createQuickPick: () => { qp = { items: [], selectedItems: [], activeItems: [], onDidTriggerItemButton: (f) => { qp.button = f; }, onDidAccept: (f) => { qp.accept = f; }, onDidHide() {}, show() {}, hide() {}, dispose() {} }; return qp; }, setStatusBarMessage() {} },
      QuickPickItemKind: { Separator: -1 }, StatusBarAlignment: { Right: 2 }, ThemeColor: class {}, ThemeIcon: class {}, EventEmitter: Emitter,
      TreeItem: class { constructor(l, s) { this.label = l; this.collapsibleState = s; } }, TreeItemCollapsibleState: { None: 0, Expanded: 2 },
      commands: { registerCommand: (n, f) => { cmds[n] = f; return { dispose() {} }; }, executeCommand: (n) => cmds[n] && cmds[n]() },
    };
    const load = Module._load;
    Module._load = function (req, ...r) {
      if (req === 'vscode') return vscode;
      if (req === 'node:child_process') return { spawn: (cmd, args) => { spawned.push(args.slice(1)); const ee = () => ({ on() {} }); return { stdout: ee(), stderr: ee(), unref() {}, on: (e, f) => e === 'close' && setImmediate(() => f(0)) }; } };
      return load.call(this, req, ...r);
    };
    const subs = [];
    try {
      delete require.cache[require.resolve('../extensions/narrate-buttons/extension.js')];
      require('../extensions/narrate-buttons/extension.js').activate({ subscriptions: subs });
    } finally { Module._load = load; }
    const pkg = require('../extensions/narrate-buttons/package.json');
    for (const c of pkg.contributes.commands) assert.ok(cmds[c.command], 'not registered: ' + c.command);
    assert.deepStrictEqual(treeProvider.getChildren().map((g) => g.id), ['narration', 'persona']);
    assert.strictEqual(treeProvider.getTreeItem(treeProvider.getChildren()[0]).collapsibleState, 2);
    try {
      await new Promise((r) => setTimeout(r, 50)); // let the startup persona/Laya status calls finish
      spawned.length = 0;
      await cmds['narrateButtons.play'](); await cmds['narrateButtons.stop'](); await cmds['narrateButtons.toggleMode']();
      assert.deepStrictEqual(spawned.slice(0, 2), [['--play'], ['--stop']]);
      assert.strictEqual(spawned[2][0], '--mode');
      assert.ok(['auto', 'manual'].includes(spawned[2][1]));
      // the tray: opens as a quick pick, a stepper button nudges the setting, Enter on Play closes it and plays
      await cmds['narrateButtons.openTray']();
      assert.ok(qp.items.some((i) => i.kind === -1 && i.label === 'Narration'));
      const vol = qp.items.find((i) => i.rowId === 'volume');
      assert.strictEqual(vol.buttons.length, 2);
      spawned.length = 0;
      await qp.button({ item: vol, button: vol.buttons[1] });
      assert.deepStrictEqual(spawned[0].slice(0, 1), ['--volume']);
      spawned.length = 0;
      qp.selectedItems = [qp.items.find((i) => i.rowId === 'play')];
      await qp.accept();
      assert.deepStrictEqual(spawned[0], ['--play']);
    } finally { subs.forEach((s) => s.dispose && s.dispose()); } // stop the refresh timer even when an assertion fails
  });
})();
