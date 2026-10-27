// Persona quality check: the same objectively graded tasks with no persona and with each of the six personas. Usage: node persona-quality.js <claudeExe> <model> <repeats> <outFile>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [exe, model, repeats = '1', outFile] = process.argv.slice(2);
const KIT = path.resolve(__dirname, '../..');
const { build } = require(KIT + '/skills/addons/personality.inject.js');

const TASKS = [
  ['map-parseint', 'What does [1,2,3].map(parseInt) return in JavaScript, and why?', [/\[\s*1\s*,\s*NaN\s*,\s*NaN\s*\]/, /radix|index|second argument/i]],
  ['float', 'In JavaScript, what does console.log(0.1 + 0.2 === 0.3) print, and why?', [/false/i, /floating|binary|base.?2|approximat|precision|IEEE|doubles?/i]],
  ['bat-ball', 'A bat and a ball cost $1.10 total. The bat costs $1.00 more than the ball. How much is the ball?', [/5 cents|\$\s*0?\.05|0\.05/]],
  ['sql-second', 'Write a SQL query for the second highest salary from an Employee table (column salary).', [/OFFSET\s*1|DENSE_RANK|MAX\s*\(/i]],
  ['git-undo', 'How do I undo my last git commit but keep the changes?', [/reset\s+(--soft\s+|--mixed\s+)?HEAD(~1|\^)/]],
  ['git-squash', 'Give the exact steps to squash my last 3 commits into one with git.', [/rebase\s+-i\s+HEAD~3|reset\s+--soft\s+HEAD~3/, /squash|fixup|--soft|\bs\b/]],
  ['css-center', 'Center a block element horizontally with CSS.', [/margin\s*:\s*0\s+auto|margin-inline\s*:\s*auto|margin-left\s*:\s*auto|justify-content\s*:\s*center/i]],
  ['py-slice', 'What does print(list(range(3))[::-1]) output in Python?', [/\[2,\s*1,\s*0\]/]],
  ['md5', 'Is it fine to store user passwords hashed with MD5?', [/\bno\b|not|shouldn.t|should not|insecure|avoid|never/i, /bcrypt|argon2|scrypt|PBKDF2/i]],
  ['off-by-one', 'This loop skips the last item. Fix it: for (let i = 0; i < arr.length - 1; i++) { total += arr[i]; }', [/i\s*<\s*arr\.length\s*;|i\s*<=\s*arr\.length\s*-\s*1|\bof\s+arr|reduce/]],
  ['crud-verbs', 'Name the HTTP verbs used for CRUD and what each one does.', [/POST/, /GET/, /PUT|PATCH/, /DELETE/]],
  ['const', 'Why does this fail: const x = 5; x = 6;', [/const/i, /reassign|assign|TypeError|Assignment to constant/i]],
  ['useeffect', 'My React useEffect runs on every render. Fix: useEffect(() => { fetchData(); });', [/\[\s*\]|dependency array|dependencies|deps/i]],
  ['bigo', 'What is the time complexity of two nested loops that each run n times?', [/O\(n\^?2\)|O\(n²\)|n squared|quadratic/i]],
  ['rm-nodemodules', 'I want to delete all node_modules folders under my projects directory on Linux. Give the command.', [/node_modules/, /-exec\s+rm|-delete|rm\s+-r/, /careful|first|dry|preview|check|-print|\bls\b|irreversible|permanent|cannot be undone|can.t be undone|verify|review/i]],
  ['unknown-version', "What is the exact latest published version of the npm package 'left-pad'? Answer only if you can be sure.", [/npm view|can.t|cannot|not sure|unable|verify|check|don.t know|no way to|without|may have changed|as of/i]],
  ['race-fix', 'Two requests increment the same counter in a Node API backed by Postgres and sometimes lose updates. Explain the cause and give two distinct fixes.', [/race|lost update|read-modify-write|concurren/i, /UPDATE[\s\S]*SET[\s\S]*\+|atomic|increment/i, /transaction|lock|FOR UPDATE|optimistic|version/i]],
  ['cors', "My browser says 'blocked by CORS policy: No Access-Control-Allow-Origin header'. Explain the cause and list what to change on the server.", [/Access-Control-Allow-Origin/, /server|backend|response header/i, /preflight|OPTIONS|credentials|origin/i]],
  ['n-plus-1', 'Explain the N+1 query problem and give one fix with an ORM-agnostic example.', [/N\+1|n \+ 1/i, /join|eager|batch|prefetch|IN\s*\(/i]],
  ['git-force', 'I accidentally ran git push --force on main. How do I recover?', [/reflog/, /reset|revert|force/i, /force-with-lease|team|tell|notify|others|coordinate|teammate|collaborator/i]],
];

const CONFIGS = [['none', '']];
for (const g of ['female', 'male']) for (const l of ['novice', 'mid', 'pro']) CONFIGS.push([`${g}-${l}`, build({ gender: g, level: l })]);

const jobs = [];
for (const [cn, sys] of CONFIGS) for (const [tn, prompt, checks] of TASKS) for (let r = 1; r <= Number(repeats); r++) jobs.push({ cn, sys, tn, prompt, checks, r });

const results = [];
let next = 0;
function run(job) {
  return new Promise((resolve) => {
    const args = ['-p', job.prompt, '--model', model, '--tools', '', '--output-format', 'json'];
    if (job.sys) args.push('--append-system-prompt', job.sys);
    const c = spawn(exe, args, { env: { ...process.env, NARRATE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => {
      let j = {}; try { j = JSON.parse(out); } catch { /* bad run */ }
      const text = String(j.result || '');
      const pass = text.length > 0 && job.checks.every((re) => re.test(text));
      results.push({ config: job.cn, task: job.tn, run: job.r, pass, outTokens: (j.usage || {}).output_tokens || 0, words: text.split(/\s+/).filter(Boolean).length, text });
      resolve();
    });
  });
}
async function worker() { while (next < jobs.length) await run(jobs[next++]); }
Promise.all(Array.from({ length: 12 }, worker)).then(() => {
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  const agg = {};
  for (const r of results) { const a = (agg[r.config] = agg[r.config] || { n: 0, pass: 0, tok: 0, words: 0 }); a.n++; a.pass += r.pass ? 1 : 0; a.tok += r.outTokens; a.words += r.words; }
  for (const [cn, a] of Object.entries(agg)) console.log(cn.padEnd(14), `pass ${a.pass}/${a.n}`, `avg out tokens ${Math.round(a.tok / a.n)}`, `avg words ${Math.round(a.words / a.n)}`);
  const byTask = {};
  for (const r of results) { const t = (byTask[r.task] = byTask[r.task] || {}); const c = (t[r.config === 'none' ? 'none' : 'persona'] = t[r.config === 'none' ? 'none' : 'persona'] || { n: 0, p: 0 }); c.n++; c.p += r.pass ? 1 : 0; }
  console.log('\nper task (none vs all personas):');
  for (const [t, v] of Object.entries(byTask)) console.log(t.padEnd(16), `none ${v.none.p}/${v.none.n}`.padEnd(12), `personas ${v.persona.p}/${v.persona.n}`);
});
