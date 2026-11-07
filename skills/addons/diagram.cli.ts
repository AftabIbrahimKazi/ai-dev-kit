#!/usr/bin/env node
// Mechanical half of the diagram add-on: detects a project's stack or folder structure into a spec file, lays the
// spec out, checks it, and renders light and dark SVG plus a self-contained HTML page. Claude only writes or
// confirms the spec; this script does everything else. Plain Node, no dependencies, no network except `icons`.
// Adapted in idea from github.com/caru-ini/stack-diagram (MIT); layout, checks and detection are our own.
//
//   node cli.js detect [--structure] [--root D] [--out FILE] [--json] [--dry-run]
//                                         read manifests, Docker, CI and env names (or the folder tree with
//                                         --structure) and write a draft spec; prints the questions left open
//   node cli.js check <spec> [--json]     validate the spec and its layout; exit 1 on any error
//   node cli.js build <spec> [--out DIR] [--name N] [--icons DIR] [--tokens FILE] [--json] [--dry-run]
//                                         write N.light.svg, N.dark.svg and N.html; prints the README snippet
//   node cli.js icons <name>... [--dir D] download brand logos into the local cache (the only command that
//                                         uses the network); a missing logo falls back to a drawn glyph
// Exit codes: 0 done, 1 error, 2 bad usage. It writes only the files named above and never overwrites a spec
// that is newer than its own output without --force. It never commits, pushes or deletes.
import crypto = require('node:crypto');
import fs = require('node:fs');
import path = require('node:path');

type Kind = 'primary' | 'secondary' | 'deploy';
interface N { id: string; label: string; role?: string; icon?: string; glyph?: string; group?: string }
interface G { id: string; label: string; parent?: string }
interface E { from: string; to: string; label?: string; kind?: Kind; guess?: boolean }
interface Spec { title: string; description: string; mode?: string; fingerprint?: string; nodes: N[]; groups: G[]; edges: E[] }
interface Rect { x: number; y: number; w: number; h: number }
interface PNode extends N { layer: number; row: number; x: number; y: number; tile: Rect; text: Rect }
interface Band { group?: G; direct: PNode[]; kids: Band[]; y: number; level: number }
interface Laid { w: number; h: number; nodes: PNode[]; boxes: { g: G; r: Rect }[]; routes: { e: E; pts: [number, number][]; label?: Rect & { text: string } }[]; warnings: string[]; layers: number }

const NODE_W = 150, TILE = 52, NODE_H = 104, ROW = 138, GAP_X = 130, MARGIN = 48, HEAD = 84, GHEAD = 28, BAND_GAP = 30, LEGEND = 34;
const MAX_NODES = 24, MAX_LABEL = 36;

// ---------- spec checks ----------
export function validateSpec(s: any): string[] {
  const err: string[] = [];
  if (!s || typeof s !== 'object') return ['spec is not an object'];
  if (!s.title || typeof s.title !== 'string') err.push('title is missing (it names the diagram for screen readers)');
  if (!s.description || typeof s.description !== 'string') err.push('description is missing (one sentence of what the diagram shows, for screen readers)');
  if (!Array.isArray(s.nodes) || !s.nodes.length) return err.concat('nodes is empty');
  if (!Array.isArray(s.groups)) s.groups = [];
  if (!Array.isArray(s.edges)) s.edges = [];
  if (s.nodes.length > MAX_NODES) err.push(`${s.nodes.length} nodes; the limit is ${MAX_NODES}. Merge or drop the least important`);
  const ids = new Set<string>();
  for (const n of s.nodes) {
    if (!n.id || !n.label) { err.push('a node needs id and label'); continue; }
    if (ids.has(n.id)) err.push(`duplicate node id "${n.id}"`);
    ids.add(n.id);
    if (n.label.length > MAX_LABEL) err.push(`node "${n.id}": label is over ${MAX_LABEL} characters`);
  }
  const gids = new Map<string, G>();
  for (const g of s.groups) { if (!g.id || !g.label) err.push('a group needs id and label'); else if (gids.has(g.id) || ids.has(g.id)) err.push(`duplicate id "${g.id}"`); else gids.set(g.id, g); }
  for (const g of s.groups) {
    if (g.parent && !gids.has(g.parent)) err.push(`group "${g.id}": unknown parent "${g.parent}"`);
    else if (g.parent && gids.get(g.parent)!.parent) err.push(`group "${g.id}": nesting deeper than one level`);
  }
  for (const n of s.nodes) if (n.group && !gids.has(n.group)) err.push(`node "${n.id}": unknown group "${n.group}"`);
  for (const e of s.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) err.push(`edge ${e.from} to ${e.to}: unknown node`);
    else if (e.from === e.to) err.push(`edge ${e.from} to itself`);
    if (e.kind && !['primary', 'secondary', 'deploy'].includes(e.kind)) err.push(`edge ${e.from} to ${e.to}: kind must be primary, secondary or deploy`);
  }
  return err;
}

// ---------- layout ----------
function assignLayers(nodes: N[], edges: E[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => adj.get(e.from)!.push(e.to));
  const state = new Map<string, number>(), back = new Set<string>();
  const dfs = (u: string): void => {
    state.set(u, 1);
    for (const v of adj.get(u)!) { const st = state.get(v) || 0; if (st === 1) back.add(u + '>' + v); else if (st === 0) dfs(v); }
    state.set(u, 2);
  };
  nodes.forEach((n) => { if (!state.get(n.id)) dfs(n.id); });
  const flow = edges.filter((e) => e.kind !== 'deploy' && !back.has(e.from + '>' + e.to));
  const layer = new Map(nodes.map((n) => [n.id, 0] as [string, number]));
  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    for (const e of flow) { const l = layer.get(e.from)! + 1; if (l > layer.get(e.to)!) { layer.set(e.to, l); changed = true; } }
    if (!changed) break;
  }
  // A node that only has deploy edges out (CI) sits one column left of its first target.
  for (const n of nodes) {
    const touches = edges.filter((e) => e.from === n.id || e.to === n.id);
    if (touches.length && touches.every((e) => e.kind === 'deploy' && e.from === n.id)) {
      const t = Math.min(...touches.map((e) => layer.get(e.to)!));
      layer.set(n.id, t - 1);
    }
  }
  const low = Math.min(...layer.values());
  if (low < 0) for (const [k, v] of layer) layer.set(k, v - low);
  // Nodes with no edge at all spread over a few columns instead of one tall stack.
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const loose = nodes.filter((n) => !linked.has(n.id));
  const cols = Math.max(Math.max(0, ...[...layer.entries()].filter(([k]) => linked.has(k)).map(([, v]) => v)) + 1, Math.min(4, Math.ceil(loose.length / 4)));
  loose.forEach((n, i) => layer.set(n.id, i % cols));
  return layer;
}

const hit = (a: Rect, b: Rect, pad = 0): boolean => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
const segRect = (p: [number, number], q: [number, number]): Rect => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) });

export function layout(spec: Spec): Laid {
  const warnings: string[] = [];
  const layers = assignLayers(spec.nodes, spec.edges);
  const L = Math.max(...layers.values()) + 1;
  const gmap = new Map(spec.groups.map((g) => [g.id, g] as [string, G]));
  const top = (gid?: string): G | undefined => { const g = gid ? gmap.get(gid) : undefined; return g && g.parent ? gmap.get(g.parent) : g; };
  const pn: PNode[] = spec.nodes.map((n) => ({ ...n, layer: layers.get(n.id)!, row: 0, x: 0, y: 0, tile: { x: 0, y: 0, w: TILE, h: TILE }, text: { x: 0, y: 0, w: NODE_W, h: NODE_H - TILE - 4 } }));
  const byId = new Map(pn.map((n) => [n.id, n]));
  // bands: one per top-level group in order of first member, plus one for ungrouped nodes
  const bands: Band[] = [], bandOf = new Map<string, Band>();
  const makeBand = (g?: G): Band => ({ group: g, direct: [], kids: [], y: 0, level: 0 });
  for (const n of pn) {
    const t = top(n.group) ; const key = t ? t.id : '';
    let b = bandOf.get(key);
    if (!b) { b = makeBand(t); bandOf.set(key, b); bands.push(b); }
    const sub = n.group && t && n.group !== t.id ? gmap.get(n.group)! : undefined;
    if (sub) {
      let k = b.kids.find((x) => x.group!.id === sub.id);
      if (!k) { k = makeBand(sub); b.kids.push(k); }
      k.direct.push(n);
    } else b.direct.push(n);
  }
  const rowsOf = (nodes: PNode[]): number => { const c = new Map<number, number>(); nodes.forEach((n) => c.set(n.layer, (c.get(n.layer) || 0) + 1)); return Math.max(0, ...c.values()); };
  const heightOf = (b: Band): number => {
    b.level = b.kids.length ? 1 : 0;
    return rowsOf(b.direct) * ROW + b.kids.reduce((s, k) => s + heightOf(k), 0) + (b.group ? GHEAD + 14 : 0);
  };
  const place = (b: Band, y: number): number => {
    b.y = y;
    let cy = y + (b.group ? GHEAD + 6 : 0);
    const used = new Map<number, number>();
    for (const n of b.direct) { const r = used.get(n.layer) || 0; used.set(n.layer, r + 1); n.row = r; }
    const setY = (): void => { for (const n of b.direct) n.y = cy + n.row * ROW + (ROW - NODE_H) / 2; };
    setY();
    const base = cy;
    const rows = rowsOf(b.direct);
    cy += rows * ROW;
    for (const k of b.kids) cy = place(k, cy);
    (b as any).reorder = (): void => {
      cy = base;
      for (let layer = 0; layer < L; layer++) {
        const col = b.direct.filter((n) => n.layer === layer);
        const key = (n: PNode): number => {
          const ys = spec.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => byId.get(e.from === n.id ? e.to : e.from)!).filter((m) => m.layer !== layer && m.y).map((m) => m.y);
          return ys.length ? ys.reduce((a, c) => a + c, 0) / ys.length : n.y;
        };
        col.sort((a, c) => key(a) - key(c)).forEach((n, i) => { n.row = i; });
      }
      setY();
    };
    return b.group ? cy + 14 : cy;
  };
  let y = HEAD;
  for (const b of bands) { heightOf(b); y = place(b, y) + BAND_GAP; }
  const all: Band[] = bands.flatMap((b) => [b, ...b.kids]);
  for (let pass = 0; pass < 3; pass++) all.forEach((b) => (b as any).reorder && (b as any).reorder());
  const bodyBottom = y - BAND_GAP;
  const usedKinds = new Set(spec.edges.map((e) => e.kind || 'primary'));
  const W = MARGIN * 2 + L * NODE_W + (L - 1) * GAP_X, H = bodyBottom + MARGIN + (usedKinds.size ? LEGEND : 0);
  const col = (l: number): number => MARGIN + l * (NODE_W + GAP_X);
  for (const n of pn) {
    n.x = col(n.layer);
    n.tile = { x: n.x + (NODE_W - TILE) / 2, y: n.y, w: TILE, h: TILE };
    n.text = { x: n.x, y: n.y + TILE + 4, w: NODE_W, h: NODE_H - TILE - 4 };
  }
  // group boxes
  const boxes: Laid['boxes'] = [];
  const boxOf = (b: Band): void => {
    if (b.group) {
      const mem = [...b.direct, ...b.kids.flatMap((k) => k.direct)];
      if (mem.length) {
        const lo = Math.min(...mem.map((n) => n.layer)), hi = Math.max(...mem.map((n) => n.layer)), pad = 22 + 16 * b.level;
        const bottom = Math.max(...mem.map((n) => n.y + NODE_H)) + 14;
        boxes.push({ g: b.group, r: { x: col(lo) - pad, y: b.y, w: col(hi) + NODE_W + pad - (col(lo) - pad), h: bottom - b.y } });
      }
    }
    b.kids.forEach(boxOf);
  };
  bands.forEach(boxOf);
  boxes.sort((a, c) => (a.g.parent ? 1 : 0) - (c.g.parent ? 1 : 0));
  for (const bx of boxes) for (const n of pn) {
    const inside = n.group === bx.g.id || (gmap.get(n.group || '')?.parent === bx.g.id);
    if (!inside && hit(bx.r, { x: n.x, y: n.y, w: NODE_W, h: NODE_H })) warnings.push(`group "${bx.g.label}" overlaps node "${n.label}"; give the node a group or move it`);
  }
  // routing
  const obstacles: Rect[] = pn.flatMap((n) => [n.tile, n.text]);
  const gapC = (g: number): number => g < 0 ? MARGIN / 2 : g >= L - 1 ? col(L - 1) + NODE_W + MARGIN / 2 : col(g) + NODE_W + GAP_X / 2;
  const gapW = (g: number): number => (g < 0 || g >= L - 1 ? MARGIN : GAP_X) - 26;
  const lanes = new Map<number, number>();
  const lane = (g: number): number => {
    const k = lanes.get(g) || 0; lanes.set(g, k + 1);
    const off = Math.ceil(k / 2) * 11 * (k % 2 ? 1 : -1);
    const lim = gapW(g) / 2;
    return gapC(g) + Math.max(-lim, Math.min(lim, off));
  };
  const clear = (pts: [number, number][]): boolean => {
    for (let i = 0; i + 1 < pts.length; i++) { const s = segRect(pts[i], pts[i + 1]); if (obstacles.some((o) => hit(s, o, -1))) return false; }
    return true;
  };
  const simplify = (pts: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of pts) { const q = out[out.length - 1]; if (q && q[0] === p[0] && q[1] === p[1]) continue; out.push(p); }
    for (let i = 1; i < out.length - 1;) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1); else i++;
    }
    return out;
  };
  const channels: number[] = [];
  for (let cy = HEAD - 16; cy <= H - 12; cy += 8) if (!obstacles.some((o) => hit({ x: 0, y: cy - 1, w: W, h: 2 }, o, 6))) channels.push(cy);
  const routes: Laid['routes'] = [];
  for (const e of spec.edges) {
    const a = byId.get(e.from)!, b = byId.get(e.to)!;
    const out: [number, number] = [a.tile.x + TILE, a.tile.y + TILE / 2], inn: [number, number] = [b.tile.x, b.tile.y + TILE / 2];
    let pts: [number, number][] | null = null;
    if (b.layer === a.layer + 1) {
      if (out[1] === inn[1]) pts = [out, inn];
      else { const lx = lane(a.layer); pts = simplify([out, [lx, out[1]], [lx, inn[1]], inn]); }
      if (!clear(pts)) pts = null;
    }
    if (!pts) {
      const l1 = lane(a.layer), l2 = lane(b.layer - 1), mid = (out[1] + inn[1]) / 2;
      for (const cy of [...channels].sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid))) {
        const cand = simplify([out, [l1, out[1]], [l1, cy], [l2, cy], [l2, inn[1]], inn]);
        if (clear(cand)) { pts = cand; break; }
      }
    }
    if (!pts) { warnings.push(`edge ${e.from} to ${e.to}: no clear route, drawn straight`); pts = [out, inn]; }
    routes.push({ e, pts });
  }
  // labels
  const placed: Rect[] = [];
  for (const r of routes) {
    if (!r.e.label) continue;
    const w = Math.round(r.e.label.length * 6.6 + 16), h = 20;
    const segs: { c: [number, number]; a: [number, number]; b: [number, number]; len: number; horiz: boolean }[] = [];
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const p = r.pts[i], q = r.pts[i + 1];
      segs.push({ c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], a: p, b: q, len: Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), horiz: p[1] === q[1] });
    }
    segs.sort((p, q) => (q.horiz ? 1 : 0) - (p.horiz ? 1 : 0) || q.len - p.len);
    let chosen: Rect | null = null;
    for (const s of segs) for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const cx = s.a[0] + (s.b[0] - s.a[0]) * t, cy = s.a[1] + (s.b[1] - s.a[1]) * t;
      const rc = { x: cx - w / 2, y: cy - h / 2, w, h };
      if (!chosen && !obstacles.some((o) => hit(rc, o, 2)) && !placed.some((o) => hit(rc, o, 2))) chosen = rc;
    }
    if (!chosen) { const s = segs[0]; chosen = { x: s.c[0] - w / 2, y: s.c[1] - h / 2, w, h }; warnings.push(`label "${r.e.label}" (${r.e.from} to ${r.e.to}) overlaps something; shorten it`); }
    placed.push(chosen);
    r.label = { ...chosen, text: r.e.label };
  }
  return { w: W, h: H, nodes: pn, boxes, routes, warnings, layers: L };
}

// ---------- render ----------
const LIGHT = { bg: '#f4f7fb', grid: '#e1e8f0', text: '#14202e', muted: '#566779', tile: '#ffffff', tileline: '#c7d2de', group: '#e8eef6', groupline: '#b6c4d4', accent: '#2563eb', edge: '#74869a', pill: '#ffffff' };
const DARK = { bg: '#0f1620', grid: '#18222f', text: '#e6edf5', muted: '#8fa0b3', tile: '#ffffff', tileline: '#3b4a5c', group: '#162030', groupline: '#2e3d50', accent: '#6ea1ff', edge: '#7f90a4', pill: '#0f1620' };
type Pal = typeof LIGHT;
const vars = (p: Pal): string => Object.entries(p).map(([k, v]) => `--dg-${k}:${v}`).join(';');

const GLYPH: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  web: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  app: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h8"/>',
  api: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cache: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z"/>',
  host: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z"/>',
  ci: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M8 5c7 0 8 3 8 5"/>',
  auth: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  storage: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  ai: '<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  monitor: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  proxy: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  tool: '<path d="m14 6 4 4-9 9H5v-4z"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wrap = (s: string): string[] => {
  const words = s.split(' '), lines: string[] = [''];
  for (const w of words) { const cur = lines[lines.length - 1]; if (cur && (cur + ' ' + w).length > 18) lines.push(w); else lines[lines.length - 1] = cur ? cur + ' ' + w : w; }
  return lines.slice(0, 2);
};

function iconHref(name: string | undefined, dirs: string[]): string | null {
  if (!name) return null;
  for (const d of dirs) for (const ext of ['svg', 'png', 'webp']) {
    const f = path.join(d, `${name}.${ext}`);
    if (fs.existsSync(f)) return `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${fs.readFileSync(f).toString('base64')}`;
  }
  return null;
}

export function renderSvg(spec: Spec, lay: Laid, opts: { pal?: Pal; dirs: string[]; standalone: boolean; id: string }): string {
  const o: string[] = [];
  const kinds = new Set(spec.edges.map((e) => e.kind || 'primary'));
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" class="dg-svg" viewBox="0 0 ${lay.w} ${lay.h}" width="${lay.w}" height="${lay.h}" role="img" aria-labelledby="${opts.id}-t ${opts.id}-d" font-family="system-ui,-apple-system,'Segoe UI',sans-serif">`);
  o.push(`<title id="${opts.id}-t">${esc(spec.title)}</title><desc id="${opts.id}-d">${esc(spec.description)}</desc>`);
  if (opts.standalone && opts.pal) o.push(`<style>svg.dg-svg{${vars(opts.pal)}}</style>`);
  o.push('<defs><pattern id="' + opts.id + '-g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--dg-grid)" stroke-width="1"/></pattern>');
  for (const [k, c] of [['primary', 'var(--dg-accent)'], ['secondary', 'var(--dg-edge)'], ['deploy', 'var(--dg-edge)']] as [string, string][]) o.push(`<marker id="${opts.id}-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 1 10 5 0 9z" fill="${c}"/></marker>`);
  o.push('</defs>');
  o.push(`<rect width="${lay.w}" height="${lay.h}" fill="var(--dg-bg)"/><rect width="${lay.w}" height="${lay.h}" fill="url(#${opts.id}-g)"/>`);
  o.push(`<text x="${MARGIN}" y="40" font-size="20" font-weight="700" fill="var(--dg-text)">${esc(spec.title)}</text>`);
  o.push(`<text x="${MARGIN}" y="62" font-size="13" fill="var(--dg-muted)">${esc(spec.description.length > 130 ? spec.description.slice(0, 127) + '...' : spec.description)}</text>`);
  for (const b of lay.boxes) {
    o.push(`<rect x="${b.r.x}" y="${b.r.y}" width="${b.r.w}" height="${b.r.h}" rx="12" fill="var(--dg-group)" stroke="var(--dg-groupline)" stroke-width="1.5"/>`);
    o.push(`<text x="${b.r.x + 14}" y="${b.r.y + 19}" font-size="12" font-weight="600" fill="var(--dg-muted)">${esc(b.g.label)}</text>`);
  }
  for (const r of lay.routes) {
    const k = r.e.kind || 'primary';
    const d = r.pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const col = k === 'primary' ? 'var(--dg-accent)' : 'var(--dg-edge)';
    o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${k === 'primary' ? 2 : 1.5}"${k === 'deploy' ? ' stroke-dasharray="6 5"' : ''} stroke-linejoin="round" marker-end="url(#${opts.id}-${k})"/>`);
  }
  for (const r of lay.routes) if (r.label) {
    o.push(`<rect x="${r.label.x}" y="${r.label.y}" width="${r.label.w}" height="${r.label.h}" rx="5" fill="var(--dg-pill)" stroke="var(--dg-groupline)"/>`);
    o.push(`<text x="${r.label.x + r.label.w / 2}" y="${r.label.y + 14}" font-size="11" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" fill="var(--dg-text)">${esc(r.label.text)}</text>`);
  }
  for (const n of lay.nodes) {
    const t = n.tile;
    o.push(`<rect x="${t.x}" y="${t.y}" width="${TILE}" height="${TILE}" rx="12" fill="var(--dg-tile)" stroke="var(--dg-tileline)" stroke-width="1.5"/>`);
    const href = iconHref(n.icon, opts.dirs);
    if (href) o.push(`<image href="${href}" x="${t.x + 9}" y="${t.y + 9}" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>`);
    else if (GLYPH[n.glyph || n.role || '']) o.push(`<g transform="translate(${t.x + 12} ${t.y + 12}) scale(1.1667)" fill="none" stroke="#3b4a5c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[n.glyph || n.role || '']}</g>`);
    else o.push(`<text x="${t.x + TILE / 2}" y="${t.y + 33}" font-size="17" font-weight="700" text-anchor="middle" fill="#2563eb">${esc(n.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())}</text>`);
    const lines = wrap(n.label);
    lines.forEach((ln, i) => o.push(`<text x="${n.x + NODE_W / 2}" y="${t.y + TILE + 18 + i * 15}" font-size="13" font-weight="600" text-anchor="middle" fill="var(--dg-text)">${esc(ln)}</text>`));
    if (n.role) o.push(`<text x="${n.x + NODE_W / 2}" y="${t.y + TILE + 18 + lines.length * 15}" font-size="11" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" fill="var(--dg-muted)">${esc(n.role.length > 24 ? n.role.slice(0, 23) + '…' : n.role)}</text>`);
  }
  if (kinds.size) {
    let lx = MARGIN; const ly = lay.h - 22;
    for (const [k, txt] of [['primary', 'main flow'], ['secondary', 'internal link'], ['deploy', 'build / deploy']] as [Kind, string][]) if (kinds.has(k)) {
      o.push(`<path d="M${lx} ${ly} h32" stroke="${k === 'primary' ? 'var(--dg-accent)' : 'var(--dg-edge)'}" stroke-width="${k === 'primary' ? 2 : 1.5}"${k === 'deploy' ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#${opts.id}-${k})"/>`);
      o.push(`<text x="${lx + 40}" y="${ly + 4}" font-size="11" fill="var(--dg-muted)">${txt}</text>`);
      lx += 40 + txt.length * 6.5 + 28;
    }
  }
  o.push('</svg>');
  return o.join('\n');
}

export function renderHtml(spec: Spec, lay: Laid, dirs: string[], pals: { light: Pal; dark: Pal }): string {
  const svg = renderSvg(spec, lay, { dirs, standalone: false, id: 'dg' });
  const list = spec.edges.map((e) => {
    const f = spec.nodes.find((n) => n.id === e.from)!.label, t = spec.nodes.find((n) => n.id === e.to)!.label;
    return `\t\t<li>${esc(f)} to ${esc(t)}${e.label ? ` (${esc(e.label)})` : ''}</li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
<style>
/* Generated by the diagram add-on. State is the data-theme value (always present); map --dg-* to project tokens with --tokens. */
.dg { ${vars(pals.light)}; margin: 0; }
@media (prefers-color-scheme: dark) { .dg[data-theme="system"] { ${vars(pals.dark)}; } }
.dg[data-theme="light"] { ${vars(pals.light)}; }
.dg[data-theme="dark"] { ${vars(pals.dark)}; }
.dg-svg { display: block; width: 100%; height: auto; }
body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
details { margin-top: 12px; }
</style>
</head>
<body>
<figure class="dg" data-theme="system">
${svg}
<figcaption>${esc(spec.description)}</figcaption>
</figure>
<details>
	<summary>Connections as text</summary>
	<ul>
${list}
	</ul>
</details>
</body>
</html>
`;
}

// ---------- detect ----------
interface Tech { label: string; role: string; icon: string }
const DEP: [string, Tech][] = [
  ['next', { label: 'Next.js', role: 'app', icon: 'nextjs' }], ['nuxt', { label: 'Nuxt', role: 'app', icon: 'nuxt' }],
  ['@sveltejs/kit', { label: 'SvelteKit', role: 'app', icon: 'svelte' }], ['@remix-run/react', { label: 'Remix', role: 'app', icon: 'remix' }],
  ['astro', { label: 'Astro', role: 'web', icon: 'astro' }], ['react', { label: 'React', role: 'web', icon: 'react' }],
  ['vue', { label: 'Vue', role: 'web', icon: 'vue' }], ['svelte', { label: 'Svelte', role: 'web', icon: 'svelte' }], ['@angular/core', { label: 'Angular', role: 'web', icon: 'angular' }],
  ['hono', { label: 'Hono', role: 'api', icon: 'hono' }], ['express', { label: 'Express', role: 'api', icon: 'express' }],
  ['fastify', { label: 'Fastify', role: 'api', icon: 'fastify' }], ['@nestjs/core', { label: 'NestJS', role: 'api', icon: 'nestjs' }],
  ['laravel/framework', { label: 'Laravel', role: 'app', icon: 'laravel' }], ['django', { label: 'Django', role: 'app', icon: 'django' }],
  ['flask', { label: 'Flask', role: 'api', icon: 'flask' }], ['fastapi', { label: 'FastAPI', role: 'api', icon: 'fastapi' }],
  ['rails', { label: 'Rails', role: 'app', icon: 'rails' }], ['github.com/gin-gonic/gin', { label: 'Gin', role: 'api', icon: 'go' }],
  ['pg', { label: 'PostgreSQL', role: 'db', icon: 'postgresql' }], ['postgres', { label: 'PostgreSQL', role: 'db', icon: 'postgresql' }],
  ['psycopg2', { label: 'PostgreSQL', role: 'db', icon: 'postgresql' }], ['asyncpg', { label: 'PostgreSQL', role: 'db', icon: 'postgresql' }],
  ['@neondatabase/serverless', { label: 'Neon', role: 'db', icon: 'neon' }], ['mysql2', { label: 'MySQL', role: 'db', icon: 'mysql' }],
  ['mongoose', { label: 'MongoDB', role: 'db', icon: 'mongodb' }], ['mongodb', { label: 'MongoDB', role: 'db', icon: 'mongodb' }], ['pymongo', { label: 'MongoDB', role: 'db', icon: 'mongodb' }],
  ['better-sqlite3', { label: 'SQLite', role: 'db', icon: 'sqlite' }], ['sqlite3', { label: 'SQLite', role: 'db', icon: 'sqlite' }],
  ['@supabase/supabase-js', { label: 'Supabase', role: 'db', icon: 'supabase' }], ['firebase', { label: 'Firebase', role: 'db', icon: 'firebase' }],
  ['redis', { label: 'Redis', role: 'cache', icon: 'redis' }], ['ioredis', { label: 'Redis', role: 'cache', icon: 'redis' }], ['@upstash/redis', { label: 'Upstash Redis', role: 'cache', icon: 'upstash' }],
  ['@clerk/nextjs', { label: 'Clerk', role: 'auth', icon: 'clerk' }], ['@clerk/clerk-react', { label: 'Clerk', role: 'auth', icon: 'clerk' }],
  ['next-auth', { label: 'Auth.js', role: 'auth', icon: 'authjs' }], ['better-auth', { label: 'Better Auth', role: 'auth', icon: 'better-auth' }],
  ['stripe', { label: 'Stripe', role: 'payments', icon: 'stripe' }], ['@aws-sdk/client-s3', { label: 'Amazon S3', role: 'storage', icon: 's3' }],
  ['cloudinary', { label: 'Cloudinary', role: 'storage', icon: 'cloudinary' }], ['openai', { label: 'OpenAI', role: 'ai', icon: 'openai' }],
  ['@anthropic-ai/sdk', { label: 'Claude', role: 'ai', icon: 'claude' }], ['resend', { label: 'Resend', role: 'email', icon: 'resend' }],
  ['nodemailer', { label: 'Email (SMTP)', role: 'email', icon: 'mail' }], ['@sendgrid/mail', { label: 'SendGrid', role: 'email', icon: 'sendgrid' }],
  ['@sentry/node', { label: 'Sentry', role: 'monitor', icon: 'sentry' }], ['@sentry/react', { label: 'Sentry', role: 'monitor', icon: 'sentry' }], ['@sentry/nextjs', { label: 'Sentry', role: 'monitor', icon: 'sentry' }],
  ['bullmq', { label: 'BullMQ', role: 'queue', icon: 'bullmq' }], ['inngest', { label: 'Inngest', role: 'queue', icon: 'inngest' }],
  ['vite', { label: 'Vite', role: 'tool', icon: 'vite' }], ['vitest', { label: 'Vitest', role: 'tool', icon: 'vitest' }], ['jest', { label: 'Jest', role: 'tool', icon: 'jest' }],
  ['@playwright/test', { label: 'Playwright', role: 'tool', icon: 'playwright' }], ['eslint', { label: 'ESLint', role: 'tool', icon: 'eslint' }],
  ['typescript', { label: 'TypeScript', role: 'tool', icon: 'typescript' }], ['tailwindcss', { label: 'Tailwind CSS', role: 'tool', icon: 'tailwindcss' }],
  ['turbo', { label: 'Turborepo', role: 'tool', icon: 'turborepo' }], ['@biomejs/biome', { label: 'Biome', role: 'tool', icon: 'biome' }],
];
const FILE: [string, string, Tech][] = [
  ['vercel.json', 'Vercel', { label: 'Vercel', role: 'host', icon: 'vercel' }], ['.vercel', 'Vercel', { label: 'Vercel', role: 'host', icon: 'vercel' }],
  ['netlify.toml', 'Netlify', { label: 'Netlify', role: 'host', icon: 'netlify' }], ['wrangler.toml', 'Cloudflare', { label: 'Cloudflare', role: 'host', icon: 'cloudflare' }],
  ['wrangler.jsonc', 'Cloudflare', { label: 'Cloudflare', role: 'host', icon: 'cloudflare' }], ['fly.toml', 'Fly.io', { label: 'Fly.io', role: 'host', icon: 'fly' }],
  ['firebase.json', 'Firebase', { label: 'Firebase Hosting', role: 'host', icon: 'firebase' }], ['render.yaml', 'Render', { label: 'Render', role: 'host', icon: 'render' }],
  ['railway.json', 'Railway', { label: 'Railway', role: 'host', icon: 'railway' }], ['Dockerfile', 'Docker', { label: 'Docker', role: 'host', icon: 'docker' }],
];
const IMAGE: [RegExp, Tech][] = [
  [/postgres/, { label: 'PostgreSQL', role: 'db', icon: 'postgresql' }], [/mysql|mariadb/, { label: 'MySQL', role: 'db', icon: 'mysql' }],
  [/mongo/, { label: 'MongoDB', role: 'db', icon: 'mongodb' }], [/redis/, { label: 'Redis', role: 'cache', icon: 'redis' }], [/memcached/, { label: 'Memcached', role: 'cache', icon: 'memcached' }],
  [/rabbitmq/, { label: 'RabbitMQ', role: 'queue', icon: 'rabbitmq' }], [/kafka/, { label: 'Kafka', role: 'queue', icon: 'kafka' }],
  [/nginx/, { label: 'Nginx', role: 'proxy', icon: 'nginx' }], [/traefik/, { label: 'Traefik', role: 'proxy', icon: 'traefik' }], [/caddy/, { label: 'Caddy', role: 'proxy', icon: 'caddy' }],
  [/minio/, { label: 'MinIO', role: 'storage', icon: 'minio' }], [/mailhog|mailpit/, { label: 'Mail catcher', role: 'email', icon: 'mail' }],
  [/elasticsearch|opensearch/, { label: 'Search', role: 'db', icon: 'elasticsearch' }],
];
const ENV: [RegExp, Tech][] = [
  [/^STRIPE_/, { label: 'Stripe', role: 'payments', icon: 'stripe' }], [/^CLERK_/, { label: 'Clerk', role: 'auth', icon: 'clerk' }],
  [/^SUPABASE_/, { label: 'Supabase', role: 'db', icon: 'supabase' }], [/^OPENAI_/, { label: 'OpenAI', role: 'ai', icon: 'openai' }],
  [/^ANTHROPIC_/, { label: 'Claude', role: 'ai', icon: 'claude' }], [/^SENTRY_/, { label: 'Sentry', role: 'monitor', icon: 'sentry' }],
  [/^REDIS_/, { label: 'Redis', role: 'cache', icon: 'redis' }], [/^(AWS_S3|S3_)/, { label: 'Amazon S3', role: 'storage', icon: 's3' }],
  [/^RESEND_/, { label: 'Resend', role: 'email', icon: 'resend' }], [/^SENDGRID_/, { label: 'SendGrid', role: 'email', icon: 'sendgrid' }],
];
const EDGE_LABEL: Record<string, string> = { db: 'queries', cache: 'cache', auth: 'sessions', payments: 'checkout', storage: 'files', ai: 'prompts', email: 'email', queue: 'jobs', monitor: 'errors' };
const KEEP_ORDER = ['app', 'web', 'api', 'db', 'cache', 'auth', 'payments', 'storage', 'ai', 'queue', 'email', 'proxy', 'host', 'ci', 'monitor', 'tool'];

const readText = (root: string, rel: string): string | null => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function collectDeps(root: string): Set<string> {
  const d = new Set<string>();
  const pj = readText(root, 'package.json');
  if (pj) { try { const j = JSON.parse(pj); for (const k of ['dependencies', 'devDependencies']) Object.keys(j[k] || {}).forEach((x) => d.add(x)); } catch { /* unreadable manifest: skip */ } }
  const cj = readText(root, 'composer.json');
  if (cj) { try { const j = JSON.parse(cj); Object.keys(j.require || {}).forEach((x) => d.add(x)); } catch { /* skip */ } }
  for (const f of ['requirements.txt', 'pyproject.toml']) { const t = readText(root, f); if (t) for (const m of t.matchAll(/^\s*["']?([A-Za-z0-9_.-]+)/gm)) d.add(m[1].toLowerCase()); }
  const gm = readText(root, 'go.mod'); if (gm) for (const m of gm.matchAll(/^\s*(?:require\s+)?([\w.\/-]+\.[\w.\/-]+)\s+v/gm)) d.add(m[1]);
  const gf = readText(root, 'Gemfile'); if (gf) for (const m of gf.matchAll(/gem\s+['"]([\w-]+)['"]/g)) d.add(m[1]);
  return d;
}

function fingerprint(root: string, extra: string): string {
  const names = ['package.json', 'composer.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Gemfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'Dockerfile', 'vercel.json', 'netlify.toml', 'wrangler.toml', 'wrangler.jsonc', 'fly.toml', '.env.example'];
  const h = crypto.createHash('sha1');
  for (const n of names) { const t = readText(root, n); if (t !== null) h.update(n + '\0' + t); }
  try { fs.readdirSync(path.join(root, '.github', 'workflows')).sort().forEach((f) => h.update('wf:' + f)); } catch { /* none */ }
  h.update(extra);
  return h.digest('hex').slice(0, 16);
}

export function detectStack(root: string): { spec: Spec; open: string[] } {
  const open: string[] = [];
  const found = new Map<string, Tech>();
  const add = (t: Tech): void => { if (!found.has(t.label)) found.set(t.label, t); };
  const deps = collectDeps(root);
  for (const [k, t] of DEP) if (deps.has(k)) add(t);
  if (found.has('Next.js') || found.has('Nuxt') || found.has('SvelteKit') || found.has('Remix')) for (const l of ['React', 'Vue', 'Svelte']) found.delete(l);
  let hostLabel = '';
  for (const [f, , t] of FILE) if (fs.existsSync(path.join(root, f)) && !(hostLabel && t.label === 'Docker')) { if (!hostLabel || hostLabel === 'Docker') hostLabel = t.label; add(t); }
  if (hostLabel && hostLabel !== 'Docker') found.delete('Docker');
  let ci = '';
  try { if (fs.readdirSync(path.join(root, '.github', 'workflows')).some((f) => /\.ya?ml$/.test(f))) ci = 'GitHub Actions'; } catch { /* none */ }
  if (!ci && fs.existsSync(path.join(root, '.gitlab-ci.yml'))) ci = 'GitLab CI';
  if (ci) add({ label: ci, role: 'ci', icon: slug(ci) === 'github-actions' ? 'github-actions' : 'gitlab' });
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yaml']) {
    const t = readText(root, f); if (!t) continue;
    for (const m of t.matchAll(/image:\s*["']?([^\s"']+)/g)) for (const [re, tech] of IMAGE) if (re.test(m[1].toLowerCase())) { add(tech); break; }
  }
  const env = readText(root, '.env.example') || '';
  for (const line of env.split(/\r?\n/)) { const k = line.split('=')[0].trim(); if (k) for (const [re, t] of ENV) if (re.test(k)) add(t); }
  let techs = [...found.values()];
  if (!techs.length) return { spec: { title: '', description: '', nodes: [], groups: [], edges: [] }, open: ['nothing recognised in the manifests, Docker, CI or env files; write the spec by hand'] };
  techs.sort((a, b) => KEEP_ORDER.indexOf(a.role) - KEEP_ORDER.indexOf(b.role));
  const tools = techs.filter((t) => t.role === 'tool');
  techs = techs.filter((t) => t.role !== 'tool').concat(tools.slice(0, 4));
  if (techs.length > MAX_NODES - 1) { techs = techs.slice(0, MAX_NODES - 1); open.push('more technologies were found than fit; the least central were left out'); }
  const nodes: N[] = [], groups: G[] = [], edges: E[] = [];
  const idOf = new Map<Tech, string>();
  const hostGroup = hostLabel && hostLabel !== 'Docker' ? 'host' : '';
  if (hostGroup) groups.push({ id: 'host', label: hostLabel });
  const hasWeb = techs.some((t) => t.role === 'web'), hasApi = techs.some((t) => t.role === 'api'), hasApp = techs.some((t) => t.role === 'app');
  const front = hasWeb || hasApp || hasApi;
  if (front) nodes.push({ id: 'user', label: 'User', role: 'user' });
  let toolsGroup = false;
  for (const t of techs) {
    const id = slug(t.label) || 'node' + nodes.length;
    idOf.set(t, id);
    const n: N = { id, label: t.label, role: t.role, icon: t.icon };
    if (hostGroup && ['app', 'web', 'api'].includes(t.role)) n.group = 'host';
    if (t.role === 'tool') { n.group = 'tooling'; toolsGroup = true; }
    if (t.role === 'host') continue;
    nodes.push(n);
  }
  if (toolsGroup) groups.push({ id: 'tooling', label: 'Tooling' });
  const first = (role: string): N | undefined => nodes.find((n) => n.role === role);
  const backend = first('api') || first('app') || first('web');
  const proxy = first('proxy');
  const web = first('web'), api = first('api'), app = first('app');
  if (front) {
    const entry = proxy || app || web || api!;
    edges.push({ from: 'user', to: entry.id, label: 'HTTPS', kind: 'primary', guess: true });
    if (proxy) for (const t of [app, web, api]) if (t) { edges.push({ from: proxy.id, to: t.id, label: 'proxy', kind: 'primary', guess: true }); break; }
    if (web && api && !app) edges.push({ from: web.id, to: api.id, label: 'API calls', kind: 'primary', guess: true });
  }
  if (backend) for (const n of nodes) if (EDGE_LABEL[n.role || ''] && n.id !== backend.id) edges.push({ from: n.role === 'auth' && web && !api && !app ? web.id : backend.id, to: n.id, label: EDGE_LABEL[n.role!], kind: n.role === 'monitor' ? 'secondary' : 'primary', guess: true });
  const ciNode = first('ci');
  if (ciNode && backend) edges.push({ from: ciNode.id, to: backend.id, label: 'deploy', kind: 'deploy', guess: true });
  if (ciNode) for (const n of nodes.filter((x) => x.role === 'tool')) edges.push({ from: ciNode.id, to: n.id, label: 'runs', kind: 'deploy', guess: true });
  const guessed = edges.length;
  if (guessed) open.push(`${guessed} edge(s) are inferred from roles (guess: true); confirm or fix them in the spec`);
  const names = nodes.filter((n) => n.icon).map((n) => n.icon!);
  open.push(`brand logos: run "icons ${names.join(' ')}" once to cache them; until then a drawn glyph is used`);
  const spec: Spec = {
    title: 'Architecture of ' + path.basename(path.resolve(root)),
    description: 'How the main parts of ' + path.basename(path.resolve(root)) + ' connect: ' + nodes.slice(0, 5).map((n) => n.label).join(', ') + (nodes.length > 5 ? ' and more.' : '.'),
    mode: 'stack', fingerprint: fingerprint(root, ''), nodes, groups, edges,
  };
  return { spec, open };
}

const SRC_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|php)$/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.astro', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', '.claude', '.cache', 'out', 'target']);

export function detectStructure(root: string): { spec: Spec; open: string[] } {
  const open: string[] = [];
  const base = fs.existsSync(path.join(root, 'src')) && fs.statSync(path.join(root, 'src')).isDirectory() ? 'src' : '';
  const listDirs = (rel: string): string[] => { try { return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).filter((d) => d.isDirectory() && !SKIP.has(d.name) && !ignored.has(d.name) && !d.name.startsWith('.') && !d.name.startsWith('_')).map((d) => d.name); } catch { return []; } };
  const ignored = new Set((readText(root, '.gitignore') || '').split(/\r?\n/).map((l) => l.trim().replace(/^\/|\/$/g, '')).filter((l) => l && !/[*?!#\[]/.test(l) && !l.includes('/')));
  const dirs = new Map<string, string>();
  for (const d of listDirs(base)) dirs.set(d, path.join(base, d));
  if (base) for (const d of listDirs('')) if (d !== 'src' && !dirs.has(d)) dirs.set(d, d);
  const files = new Map<string, string[]>();
  let scanned = 0;
  const walk = (rel: string, owner: string): void => {
    let ents: fs.Dirent[] = [];
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (scanned > 3000) return;
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(r, owner); }
      else if (SRC_EXT.test(e.name)) { scanned++; (files.get(owner) || files.set(owner, []).get(owner)!).push(r); }
    }
  };
  for (const [name, rel] of dirs) walk(rel, name);
  const count = new Map([...dirs.keys()].map((k) => [k, (files.get(k) || []).length] as [string, number]));
  let keep = [...dirs.keys()].filter((k) => count.get(k)! > 0).sort((a, b) => count.get(b)! - count.get(a)!);
  if (keep.length > 16) { open.push(`${keep.length} folders hold code; the 16 largest are shown`); keep = keep.slice(0, 16); }
  if (!keep.length) return { spec: { title: '', description: '', nodes: [], groups: [], edges: [] }, open: ['no source folders found'] };
  const weights = new Map<string, number>();
  for (const [from, list] of files) {
    if (!keep.includes(from)) continue;
    for (const f of list) {
      const t = readText(root, f); if (!t || t.length > 200000) continue;
      const dir = path.dirname(f);
      for (const m of t.matchAll(/(?:from\s+|import\s+|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]|^\s*(?:from|import)\s+(\w+)/gm)) {
        let target = '';
        if (m[1]) { const abs = path.normalize(path.join(dir, m[1])); const parts = abs.split(path.sep); const rel = base && parts[0] === base ? parts[1] : parts[0]; target = rel; }
        else if (m[2] && keep.includes(m[2])) target = m[2];
        if (target && target !== from && keep.includes(target)) { const k = from + '>' + target; weights.set(k, (weights.get(k) || 0) + 1); }
      }
    }
  }
  const nodes: N[] = keep.map((k) => ({ id: slug(k), label: k + '/', role: `${count.get(k)} source files`, glyph: 'folder' }));
  const edges: E[] = [...weights].map(([k, w]) => { const [a, b] = k.split('>'); return { from: slug(a), to: slug(b), label: `${w} import${w > 1 ? 's' : ''}`, kind: 'secondary' as Kind, guess: false }; });
  open.push('edges are counted from relative imports; dynamic or aliased imports are not seen');
  const name = path.basename(path.resolve(root));
  return {
    spec: { title: 'Structure of ' + name, description: `Source folders of ${name} and the imports between them.`, mode: 'structure', fingerprint: fingerprint(root, keep.join(',')), nodes, groups: [], edges },
    open,
  };
}

// ---------- icons (network) ----------
async function fetchText(url: string): Promise<string | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.text() : null; } catch { return null; }
}
async function getIcon(name: string): Promise<string | null> {
  const svgl = await fetchText('https://api.svgl.app?search=' + encodeURIComponent(name));
  if (svgl) {
    try {
      const list = JSON.parse(svgl) as { title: string; route: string | { light: string; dark: string } }[];
      const hitI = list.find((i) => slug(i.title) === slug(name)) || list[0];
      if (hitI) { const route = typeof hitI.route === 'string' ? hitI.route : hitI.route.light; const t = await fetchText(route); if (t && t.includes('<svg')) return t; }
    } catch { /* fall through to the next source */ }
  }
  for (const url of [`https://raw.githubusercontent.com/devicons/devicon/master/icons/${name}/${name}-original.svg`, `https://cdn.jsdelivr.net/gh/gilbarbara/logos/logos/${name}-icon.svg`, `https://cdn.jsdelivr.net/gh/gilbarbara/logos/logos/${name}.svg`]) {
    const t = await fetchText(url); if (t && t.includes('<svg')) return t;
  }
  return null;
}

// ---------- CLI ----------
function parse(argv: string[]): { _: string[]; f: Record<string, string | true> } {
  const _: string[] = [], f: Record<string, string | true> = {};
  const withValue = new Set(['root', 'out', 'name', 'icons', 'tokens', 'dir']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (withValue.has(k) && i + 1 < argv.length) f[k] = argv[++i]; else f[k] = true; } else _.push(a);
  }
  return { _, f };
}
const USAGE = 'usage: diagram.cli <detect [--structure] | check <spec> | build <spec> | icons <name>...> [--root D] [--out PATH] [--name N] [--icons DIR] [--tokens FILE] [--dir D] [--json] [--dry-run] [--force]';
const say = (s: string): void => { process.stdout.write(s + '\n'); };
const fail = (s: string, code = 1): void => { process.stderr.write(s + '\n'); process.exitCode = code; };
const iconDirs = (cwd: string, extra?: string | true): string[] => [typeof extra === 'string' ? path.resolve(cwd, extra) : '', path.join(cwd, '.diagram', 'icons')].filter(Boolean);

function loadSpec(file: string): Spec | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`cannot read spec "${file}": ${(e as Error).message}. Run "detect" to create one, or check the JSON.`); return null; }
}

async function main(): Promise<void> {
  const { _, f } = parse(process.argv.slice(2));
  const cmd = _[0], cwd = process.cwd(), json = !!f.json, dry = !!f['dry-run'];
  if (!cmd || !['detect', 'check', 'build', 'icons'].includes(cmd)) { fail(USAGE, 2); return; }
  if (cmd === 'detect') {
    const root = path.resolve(cwd, typeof f.root === 'string' ? f.root : '.');
    if (!f.root) say(`(assumed project root: ${root})`);
    const { spec, open } = f.structure ? detectStructure(root) : detectStack(root);
    if (!spec.nodes.length) { fail(open[0], 1); return; }
    const out = path.resolve(root, typeof f.out === 'string' ? f.out : path.join('diagram', `${spec.mode}.spec.json`));
    if (json) { say(JSON.stringify({ out, spec, open })); return; }
    if (dry) say(`would write ${out}`);
    else if (fs.existsSync(out) && !f.force) { fail(`${out} already exists; pass --force to replace it, or --out for another file.`); return; }
    else { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(spec, null, '\t') + '\n'); say(`wrote ${out}`); }
    say(`${spec.nodes.length} nodes, ${spec.groups.length} groups, ${spec.edges.length} edges. Open questions:`);
    open.forEach((o) => say('- ' + o));
    return;
  }
  if (cmd === 'icons') {
    const names = _.slice(1);
    if (!names.length) { fail(USAGE, 2); return; }
    const dir = path.resolve(cwd, typeof f.dir === 'string' ? f.dir : path.join('.diagram', 'icons'));
    say(`Downloading ${names.length} logo(s) from svgl, devicon and gilbarbara into ${dir}. Logos stay unmodified; their marks belong to their owners.`);
    if (dry) { names.forEach((n) => say(`would fetch ${n}`)); return; }
    fs.mkdirSync(dir, { recursive: true });
    for (const n of names) {
      const target = path.join(dir, `${slug(n)}.svg`);
      if (fs.existsSync(target) && !f.force) { say(`kept  ${n} (already cached)`); continue; }
      const svg = await getIcon(slug(n));
      if (svg) { fs.writeFileSync(target, svg); say(`ok    ${n}`); } else say(`miss  ${n} (a drawn glyph is used instead)`);
    }
    return;
  }
  const specFile = _[1];
  if (!specFile) { fail(USAGE, 2); return; }
  const spec = loadSpec(path.resolve(cwd, specFile));
  if (!spec) return;
  const errs = validateSpec(spec);
  if (errs.length) { if (json) say(JSON.stringify({ ok: false, errors: errs })); else { fail('spec has errors:\n- ' + errs.join('\n- ')); } process.exitCode = 1; return; }
  const lay = layout(spec);
  const guessed = spec.edges.filter((e) => e.guess).length;
  const warns = lay.warnings.concat(guessed ? [`${guessed} edge(s) are still marked guess:true; confirm them, then set guess to false`] : []);
  if (cmd === 'check') {
    if (json) say(JSON.stringify({ ok: true, nodes: spec.nodes.length, edges: spec.edges.length, size: [lay.w, lay.h], warnings: warns }));
    else { say(`ok: ${spec.nodes.length} nodes, ${spec.edges.length} edges, ${lay.layers} columns, ${lay.w}x${lay.h}`); warns.forEach((w) => say('warning: ' + w)); }
    return;
  }
  let light = { ...LIGHT }, dark = { ...DARK };
  if (typeof f.tokens === 'string') {
    try { const t = JSON.parse(fs.readFileSync(path.resolve(cwd, f.tokens), 'utf8')); light = { ...light, ...(t.light || {}) }; dark = { ...dark, ...(t.dark || {}) }; } catch (e) { fail(`cannot read tokens file: ${(e as Error).message}`); return; }
  }
  const dirs = iconDirs(cwd, f.icons);
  const name = typeof f.name === 'string' ? f.name : slug(path.basename(specFile).replace(/\.spec\.json$|\.json$/, '')) || 'diagram';
  const outDir = path.resolve(cwd, typeof f.out === 'string' ? f.out : path.dirname(path.resolve(cwd, specFile)));
  const files: [string, string][] = [
    [`${name}.light.svg`, renderSvg(spec, lay, { pal: light, dirs, standalone: true, id: 'dg' }) + '\n'],
    [`${name}.dark.svg`, renderSvg(spec, lay, { pal: dark, dirs, standalone: true, id: 'dg' }) + '\n'],
    [`${name}.html`, renderHtml(spec, lay, dirs, { light, dark })],
  ];
  const missing = [...new Set(spec.nodes.filter((n) => n.icon && !iconHref(n.icon, dirs) && !GLYPH[n.glyph || n.role || '']).map((n) => n.label))];
  if (!dry) { fs.mkdirSync(outDir, { recursive: true }); for (const [fn, body] of files) fs.writeFileSync(path.join(outDir, fn), body); }
  const rel = path.relative(cwd, outDir).split(path.sep).join('/') || '.';
  const snippet = `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${rel}/${name}.dark.svg">\n  <img src="${rel}/${name}.light.svg" alt="${esc(spec.description)}">\n</picture>`;
  if (json) { say(JSON.stringify({ ok: true, dryRun: dry, outDir, files: files.map((x) => x[0]), warnings: warns, snippet })); return; }
  say(`${dry ? 'would write' : 'wrote'} ${files.map((x) => x[0]).join(', ')} in ${outDir}`);
  warns.forEach((w) => say('warning: ' + w));
  if (missing.length) say(`note: no cached logo for ${missing.join(', ')}; run "icons" once or a monogram is shown`);
  say('README snippet:\n' + snippet);
}

if (require.main === module) main().catch((e) => fail(`diagram failed: ${(e as Error).message}`));
