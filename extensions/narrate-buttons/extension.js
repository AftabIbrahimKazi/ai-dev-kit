// Kit control panel for VS Code: a sidebar view and status-bar buttons. Every click runs a kit script (`node speak.js --mute`,
// `node inject.js --set ...`, ...), the same CLIs the slash commands and hooks use, so
// nothing depends on key capture. Narration plays on a Play button by default (like claude.ai); "auto" speaks every reply.
const vscode = require('vscode');
const { spawn } = require('node:child_process');
const { findScript, readConf, readLast, isMuted, nudged, modeOf, parsePersonas, buildTree, trayItems, LIMITS } = require('./lib');

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('narrateButtons');
  const roots = () => (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
  const cwd = () => roots()[0] || process.cwd();

  // Runs `node <script> args` and resolves with its output; never rejects.
  const exec = (name, args = [], opts = {}) => new Promise((resolve) => {
    const script = findScript(name, name === 'speak' ? cfg().get('speakPath') : '', roots());
    if (!script) { vscode.window.showWarningMessage(`AI Dev Kit: the ${name} script was not found. Install that add-on (install-kit) or open the kit folder.`); return resolve({ ok: false, text: '' }); }
    let text = '';
    const child = spawn(cfg().get('nodePath') || 'node', [script, ...args], { cwd: cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { text += d; }); child.stderr.on('data', (d) => { text += d; });
    child.on('error', (e) => { vscode.window.showWarningMessage('AI Dev Kit: could not run node (' + e.message + ').'); resolve({ ok: false, text: '' }); });
    child.on('close', (code) => resolve({ ok: code === 0, text: text.trim() }));
    if (opts.detach) { child.unref(); resolve({ ok: true, text: '' }); }
  });

  // --- state shown in the panel and the status bar ---
  let extra = { persona: '' };
  const state = () => { const last = readLast(); return { conf: readConf(), muted: isMuted(), pending: !!last.pending, ...extra }; };
  const changed = new vscode.EventEmitter();
  async function refreshExtra() {
    const p = await exec('persona', ['--status']);
    extra = { persona: p.ok ? p.text.replace(/^personality:\s*/, '') : 'not installed' };
    refresh();
  }

  // One footer button opens the tray; `footer: "tray+play"` adds a separate Play button next to it.
  const tray = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  tray.command = 'narrateButtons.openTray'; tray.show(); context.subscriptions.push(tray);
  const play = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  play.command = 'narrateButtons.play'; context.subscriptions.push(play);

  function refresh() {
    const s = state();
    const pending = s.pending;
    tray.text = pending ? '$(play) Reply ready' : s.muted ? '$(mute) Kit' : '$(unmute) Kit';
    tray.backgroundColor = pending ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    tray.tooltip = pending ? 'AI Dev Kit: a new reply is waiting. Open the tray, then Play.' : 'AI Dev Kit controls';
    if (cfg().get('footer') === 'tray+play') { play.text = '$(play)'; play.tooltip = 'Narrate: play the latest reply'; play.backgroundColor = pending ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined; play.show(); } else play.hide();
    changed.fire();
  }
  // a reply arrives or a setting changes outside VS Code: poll the two small state files
  const timer = setInterval(refresh, 2000); context.subscriptions.push({ dispose: () => clearInterval(timer) });
  refresh(); refreshExtra();

  // The Stop hook runs whichever speak.js settings.json names; an old copy has no manual mode and speaks every reply.
  (function checkHook() {
    try {
      const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
      const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
      const cmds = ((s.hooks && s.hooks.Stop) || []).flatMap((g) => g.hooks || []).map((h) => h.command || '');
      const m = cmds.map((c) => /"([^"]*speak\.js)"|(\S*speak\.js)/.exec(c)).find(Boolean);
      const script = m && (m[1] || m[2]);
      if (!script) return;
      const out = require('node:child_process').spawn(cfg().get('nodePath') || 'node', [script, '--status'], { windowsHide: true });
      let text = ''; out.stdout.on('data', (d) => { text += d; });
      out.on('close', () => { if (!/\bmode\b/.test(text)) vscode.window.showWarningMessage(`AI Dev Kit: the Stop hook runs an outdated narrate script (${script}), so "When to speak" is ignored. Point the hook at the current speak.js in ~/.claude/settings.json.`); });
      out.on('error', () => {});
    } catch { /* no settings or no hook: nothing to check */ }
  })();

  // --- the sidebar tree ---
  const provider = {
    onDidChangeTreeData: changed.event,
    getTreeItem(el) {
      const item = new vscode.TreeItem(el.label, el.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.description = el.description; item.id = el.id; item.contextValue = el.contextValue;
      item.iconPath = new vscode.ThemeIcon(el.icon || 'circle-small');
      if (el.command) item.command = { command: el.command, title: el.label };
      return item;
    },
    getChildren(el) { return el ? el.children : buildTree(state()); },
  };
  context.subscriptions.push(vscode.window.createTreeView('aiDevKit.controls', { treeDataProvider: provider }));

  const step = async (key, dir) => {
    const v = nudged(key, readConf(), dir);
    await exec('speak', [`--${key}`, String(v)]);
    if (key !== 'maxSeconds') await exec('speak', ['--say', `${key} ${v}`]); // spoken back so the change is audible
    refresh();
  };

  const reg = (name, fn) => context.subscriptions.push(vscode.commands.registerCommand(name, fn));
  const speak = (...a) => async () => { await exec('speak', a); refresh(); };
  reg('narrateButtons.play', speak('--play'));
  reg('narrateButtons.stop', speak('--stop'));
  reg('narrateButtons.toggleMute', async () => { await exec('speak', [isMuted() ? '--unmute' : '--mute']); refresh(); });
  reg('narrateButtons.toggleMode', async () => { const m = modeOf(readConf()) === 'auto' ? 'manual' : 'auto'; await exec('speak', ['--mode', m]); vscode.window.setStatusBarMessage(`Narration: ${m === 'auto' ? 'speaks every reply' : 'play button'}`, 3000); refresh(); });
  reg('narrateButtons.switchVoice', async () => { await exec('speak', ['--voice', readConf().gender === 'male' ? 'female' : 'male']); refresh(); });
  reg('narrateButtons.stepUp', (el) => el && LIMITS[el.key] && step(el.key, 1));
  reg('narrateButtons.stepDown', (el) => el && LIMITS[el.key] && step(el.key, -1));
  reg('narrateButtons.pickPersona', async () => {
    const list = await exec('persona', ['--list']);
    if (!list.ok) return;
    const picks = [...parsePersonas(list.text).map((p) => ({ label: p.label, args: ['--set', p.gender, p.level] })), { label: 'Custom persona', args: ['--set', 'custom'] }, { label: 'Off', args: ['--off'] }];
    const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Persona for new sessions' });
    if (pick) { const r = await exec('persona', pick.args); vscode.window.setStatusBarMessage(r.text, 4000); refreshExtra(); }
  });
  reg('narrateButtons.refresh', refreshExtra);
  // the tray: a quick-pick list of every control; settings rows keep it open and refresh in place
  reg('narrateButtons.openTray', () => {
    const qp = vscode.window.createQuickPick();
    qp.placeholder = 'AI Dev Kit controls'; qp.matchOnDescription = true;
    let rows = [];
    const load = () => {
      rows = trayItems(state());
      qp.items = rows.map((r) => r.separator ? { label: r.label, kind: vscode.QuickPickItemKind.Separator }
        : { label: `$(${r.icon || 'circle-small'}) ${r.label}`, description: r.description, rowId: r.id, buttons: r.stepper ? [{ iconPath: new vscode.ThemeIcon('remove'), tooltip: 'Decrease' }, { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Increase' }] : undefined });
    };
    const rowOf = (item) => rows.find((r) => r.id === item.rowId);
    load();
    qp.onDidTriggerItemButton(async (e) => { const r = rowOf(e.item); if (r && r.key) { await step(r.key, e.button.tooltip === 'Increase' ? 1 : -1); load(); } });
    qp.onDidAccept(async () => {
      const r = qp.selectedItems[0] && rowOf(qp.selectedItems[0]);
      if (!r) return;
      if (r.stepper) { await step(r.key, 1); load(); return; } // Enter on a stepper nudges up; -/+ buttons do either way
      if (!r.keepOpen) qp.hide();
      await vscode.commands.executeCommand(r.command);
      if (r.keepOpen) { load(); qp.activeItems = qp.items.filter((i) => i.rowId === r.id); }
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  });
  reg('narrateButtons.openPanel', () => vscode.commands.executeCommand('workbench.view.extension.aiDevKit'));
}

module.exports = { activate, deactivate() {} };
