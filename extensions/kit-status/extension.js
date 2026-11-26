// AI Dev Kit status: a status-bar counter and a short flash when a kit feature is used. The Claude chat panel draws no
// mod UI, so this reads the usage log the feature-usage mod writes and draws it in VS Code itself. No model, no tokens.
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const lib = require('./lib');

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('kitStatus');
  const folder = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const project = () => (cfg().get('allProjects') ? '' : lib.slug(folder()));

  let tally = lib.createTally(project());
  const dir = lib.logDir();
  let offsets = lib.readNew(dir, {}, true).offsets; // rows already in the log are history: no flash for them
  let conf = lib.readConfig();

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  item.command = 'kitStatus.show';
  context.subscriptions.push(item);
  const draw = () => {
    item.text = lib.barText(tally, conf);
    item.tooltip = conf.track ? `AI Dev Kit: ${tally.features()} feature(s), ${tally.total()} use(s) this window. Click for the list.` : 'AI Dev Kit usage tracking is off (/kit-usage on).';
    item.show();
  };

  const poll = () => {
    conf = lib.readConfig();
    const r = lib.readNew(dir, offsets);
    offsets = r.offsets;
    if (!conf.track) { draw(); return; }
    for (const row of r.rows) {
      const hit = tally.add(row);
      if (!hit || !hit.first || !conf.notify) continue;
      const text = `kit: ${lib.labelOf(row)}`;
      if (cfg().get('popup')) vscode.window.showInformationMessage(text); else vscode.window.setStatusBarMessage('$(pulse) ' + text, 6000);
    }
    draw();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('kitStatus.show', async () => {
      const list = tally.list();
      if (!list.length) { vscode.window.showInformationMessage('AI Dev Kit: no feature used yet in this window.'); return; }
      await vscode.window.showQuickPick(list, { title: 'Kit features used in this window', placeHolder: 'name x uses' });
    }),
    vscode.commands.registerCommand('kitStatus.toggleNotices', () => {
      const file = path.join(lib.home(), 'usage', 'config.json');
      const next = { track: conf.track, notify: !conf.notify };
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n'); } catch (e) { vscode.window.showWarningMessage('AI Dev Kit: could not write ' + file + ' (' + e.message + ').'); return; }
      conf = next; draw();
      vscode.window.showInformationMessage(`AI Dev Kit notices ${next.notify ? 'on' : 'off'}.`);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { tally = lib.createTally(project()); draw(); }),
  );

  const timer = setInterval(poll, 1500);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  draw();
}

function deactivate() {}
module.exports = { activate, deactivate };
