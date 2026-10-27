// Runs realistic prompts through `claude -p` in the scratch project (no handover, fresh session each) and records which
// skills Claude calls and which files it reads first. Usage: node trigger.js <projDir> <claudeExe> <outFile> <runs>
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const [proj, exe, outFile, runs = '1'] = process.argv.slice(2);

const PROMPTS = [
  ['resolve-conflicts', 'I merged main into my branch and git says there are conflicts in three files. Sort them out.'],
  ['resolve-conflicts', 'rebase stopped halfway with merge conflicts, can you fix them? I only work on the frontend so keep out of the api folder'],
  ['responsive-check', 'The site has horizontal scrolling on phones. Can you check it at mobile and tablet widths?'],
  ['responsive-check', 'make sure this layout works from 320px to 1440px'],
  ['optimize-assets', 'The hero images are 4MB each. Shrink them and give me webp and avif versions.'],
  ['optimize-assets', 'convert my screenshots to jpg so they are cheaper to send you'],
  ['project-context', 'Set up a folder for the client brand docs and requirements for this project.'],
  ['coding-standards', 'Add a dark mode toggle button to the header in src/index.html with styles in main.css.'],
  ['debug-protocol', 'The build fails after my last change and I have no idea why.'],
  ['pre-commit', 'Commit what I have.'],
  ['(none)', 'What does git rebase do?'],
];

const results = [];
for (const [expected, prompt] of PROMPTS) {
  for (let i = 0; i < Number(runs); i++) {
    const t0 = Date.now();
    const r = spawnSync(exe, ['-p', prompt, '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--max-turns', '3', '--permission-mode', 'default'], { cwd: proj, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
    const skills = [];
    const reads = [];
    let cost = null;
    let text = '';
    for (const line of (r.stdout || '').split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'assistant') for (const c of (ev.message && ev.message.content) || []) {
        if (c.type !== 'tool_use') continue;
        if (c.name === 'Skill') skills.push((c.input && (c.input.skill || c.input.command || c.input.name)) || '?');
        else if (c.name === 'Read') reads.push(String((c.input && c.input.file_path) || '').split(/[\\/]/).slice(-2).join('/'));
      }
      if (ev.type === 'result') { cost = ev.total_cost_usd; text = String(ev.result || ''); }
    }
    results.push({ expected, prompt: prompt.slice(0, 60), run: i + 1, skills, reads: reads.slice(0, 4), hit: expected === '(none)' ? skills.length === 0 : skills.some((s) => s.includes(expected)) || (expected === 'coding-standards' && reads.some((r) => r.includes('index.md'))), cx: /^\[CX X7\]/.test(text.trim()), head: text.trim().slice(0, 24), cost, secs: Math.round((Date.now() - t0) / 1000), status: r.status, err: r.error ? String(r.error.message) : undefined });
    fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  }
}
console.log('done', results.length);
