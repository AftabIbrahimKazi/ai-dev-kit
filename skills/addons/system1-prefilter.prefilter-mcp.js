#!/usr/bin/env node
// stdio MCP server exposing the local Laya decision model as one tool: `prefilter`.
// Dependency-free. Needs its siblings laya-ctl.js (server lifecycle) and ladder.js (escalation thresholds)
// in the same folder; both ship with the system1-prefilter skill. Laya itself is installed once, globally
// (~/.ai-dev-kit/laya), by `node laya-ctl.js setup`.
const { spawnSync } = require("child_process");
const path = require("path");
const { resolveMCQ, fromLaya } = require("./ladder.js");

const base = `http://127.0.0.1:${process.env.LAYA_PORT || "8000"}`;
const MAX = 40;

const up = async () => { try { return (await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
async function ensureServer() {
  if (await up()) return;
  const r = spawnSync("node", [path.join(__dirname, "laya-ctl.js"), "start"], { encoding: "utf8", timeout: 240000, windowsHide: true });
  if (r.status !== 0 || !(await up())) throw new Error(`Laya is not available (${String(r.stderr || r.stdout || "not set up").trim().slice(0, 160)}). Run: node laya-ctl.js setup. Skip the prefilter and read the candidates yourself.`);
}

// Weaker models mis-shape the candidates map; accept {id: "desc"}, {id: {desc: ""}}, ["id", ...] and [{id|path|name, description|desc}].
function normalise(c) {
  const text = (v) => (typeof v === "string" ? v : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => (x === "" || x == null ? k : `${k}: ${typeof x === "string" ? x : JSON.stringify(x)}`)).join("; ") : String(v ?? ""));
  if (Array.isArray(c)) return Object.fromEntries(c.map((x, i) => typeof x === "string" ? [x, ""] : [String(x.id ?? x.path ?? x.name ?? x.file ?? `item${i}`), text(x.description ?? x.desc ?? x.summary ?? "")]));
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, text(v)]));
}

async function prefilter({ task, candidates: raw, mode = "pick_one" }) {
  if (!task || !raw || typeof raw !== "object") throw new Error("task (string) and candidates ({id: description}) are required");
  const candidates = normalise(raw);
  const ids = Object.keys(candidates);
  if (ids.length < 2) throw new Error("need at least 2 candidates; with 1 there is nothing to filter");
  if (ids.length > MAX) throw new Error(`at most ${MAX} candidates per call; split the list`);
  if (!["pick_one", "pick_many"].includes(mode)) throw new Error('mode must be "pick_one" or "pick_many"');
  await ensureServer();
  const taskText = String(task).slice(0, 4000);
  let mcq = {}; const yes = {};
  if (mode === "pick_one") {
    const questions = { pick: { type: "choice", instructions: "Which candidate is most relevant to the task?", criteria: Object.fromEntries(ids.map((id) => [id, String(candidates[id]).slice(0, 300)])) } };
    const r = await fetch(`${base}/v1/systemone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: { task: taskText }, questions }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`Laya HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    mcq = fromLaya(await r.json()).mcq;
  } else {
    // Laya reads the STATE for content, so each candidate goes into its own state; one batched call, one yes/no question.
    const states = ids.map((id) => `Task: ${taskText}. Candidate file: ${id} - ${String(candidates[id]).slice(0, 300)}`);
    const questions = { q: { type: "noul", instructions: "Does the candidate file need to be read or changed to complete the task?" } };
    const r = await fetch(`${base}/v1/systemone/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ states, questions }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`Laya HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const out = (await r.json()).results;
    ids.forEach((id, i) => { yes[id] = out[i].answers.q.noul; });
  }
  const NL = String.fromCharCode(10); const pct = (x) => `${Math.round(x * 100)}%`;
  const foot = "Prefilter only: Laya ships over-confident. Never use it for security, auth, payment or pass/fail decisions.";
  if (mode === "pick_one") {
    const ranked = Object.entries(mcq.pick.probabilities).sort((a, b) => b[1] - a[1]);
    const read = resolveMCQ(mcq.pick);
    return [`READ THESE FIRST (${read.length}): ${read.join(", ")}`, "Ranking: " + ranked.slice(0, 5).map(([id, p]) => `${id} ${pct(p)}`).join("; "),
      read.length > 1 ? "Top choice was below 90% confidence, so the runner-up(s) are included; read them before deciding." : "Top choice cleared 90%.", foot].join(NL);
  }
  // Laya's yes-probabilities are low in absolute terms even for the right file (0.3-0.75 measured), but the ranking is reliable,
  // so use relative thresholds: read >= max(0.25, half the top score); check 0.15 up to that; skip below 0.15.
  const top = Math.max(...Object.values(yes)); const cut = Math.max(0.25, top * 0.5);
  let toRead = ids.filter((id) => yes[id] >= cut).sort((x, y) => yes[y] - yes[x]);
  const bestGuess = toRead.length === 0;
  if (bestGuess) toRead = [ids.reduce((x, y) => (yes[y] > yes[x] ? y : x))];
  const toCheck = ids.filter((id) => !toRead.includes(id) && yes[id] >= 0.15).sort((x, y) => yes[y] - yes[x]);
  const skipped = ids.filter((id) => !toRead.includes(id) && !toCheck.includes(id));
  const fmt = (list) => list.map((id) => `${id} (${pct(yes[id])})`).join(", ") || "none";
  return [`READ (${toRead.length}): ${fmt(toRead)}${bestGuess ? "  [no candidate scored clearly; this is only the best guess]" : ""}`, `CHECK MANUALLY, borderline (${toCheck.length}): ${fmt(toCheck)}`, `SKIP as irrelevant (${skipped.length}): ${skipped.join(", ") || "none"}`, foot].join(NL);
}

const TOOL = { name: "prefilter", description: "Cheap local pre-filter (Laya, ~1 s, free) for narrowing candidates BEFORE reading them in full: which files/tests/skills are relevant to a task. pick_one = rank candidates for a single target; pick_many = yes/no per candidate when several may apply. Returns what to read and what to verify manually. Never use for security, auth, payment or pass/fail judgements.", inputSchema: { type: "object", properties: { task: { type: "string", description: "What you are trying to do, in a sentence or two" }, candidates: { type: "object", description: "Map of candidate id (e.g. file path) to a short description (a first line, a symbol list, a heading)", additionalProperties: { type: "string" } }, mode: { type: "string", enum: ["pick_one", "pick_many"], description: "default pick_one" } }, required: ["task", "candidates"] } };

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let buf = "";
process.stdin.on("data", async (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "prefilter", version: "1.0.0" } } });
    else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: [TOOL] } });
    else if (m.method === "tools/call") {
      try {
        if (m.params.name !== "prefilter") throw new Error("unknown tool");
        send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: await prefilter(m.params.arguments || {}) }] } });
      } catch (e) { send({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: String(e.message) }] } }); }
    } else if (m.id !== undefined && !m.method.startsWith("notifications/")) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
  }
});
process.stdin.on("end", () => process.exit(0));
