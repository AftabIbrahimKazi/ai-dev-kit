import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type ActorIndex = 0 | 1 | 2 | 3;
type Vec3 = [number, number, number];

interface RawNode {
  id: string;
  label: string;
  group: string;
  kind: "doc" | "script" | "mod" | "test";
  paths: string[];
  text: string;
  stem: string;
  keys: RegExp[];
}

const KIT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUT_FILE = fileURLToPath(new URL("../src/content/kit-graph.json", import.meta.url));
const SKIP = /(^tests\/fixtures\/|^findings\/data\/|package-lock|^LICENSE$|tsconfig\.json$|\.gitattributes|\.gitignore|\.aiignore|\.svg$|\.sh$|\.cjs$)/;
const EXCLUDED_ROOTS = /^(site|_sandbox)\//;
const HUB = /^(README\.md|CHANGELOG\.md|CREDITS\.md|CONTRIBUTING\.md|findings|skills\/README\.md|coding-standards\/README\.md|coding-standards\/index\.md)$/;
const GROUP_ORDER: readonly string[] = [
  "root", "standards", "partials", "frameworks", "script-partials", "qa", "skills-workflow", "skills-standards",
  "skills-commands", "skills-addons", "skills-meta", "skills-models", "skills-mcp", "skills-memory", "skills-libraries",
  "skills-stack", "mods", "extensions", "tests", "findings",
];
const ANCHOR_RADIUS = 70;
const GOLDEN_ANGLE = 2.399963;
const LAYOUT_STEPS = 360;
const LAYOUT_COOL = 0.7;
const LAYOUT_DAMPING = 0.8;
const LAYOUT_ANCHOR_PULL = 0.012;
const LAYOUT_REPULSION = 22;
const LAYOUT_REPULSION_RANGE_SQ = 900;
const LAYOUT_SPRING_OTHER = 0.012;
const LAYOUT_REST = 13;
const LAYOUT_JITTER = 14;
const SEED = 7;
const SEED_MULTIPLIER = 16807;
const SEED_MODULUS = 2147483647;
const COORD_PRECISION = 10;
const DEPTH_STRONG_STEM = 9;

const git = (): string[] =>
  execSync("git ls-files", { cwd: KIT_ROOT, maxBuffer: 1e8 })
    .toString()
    .trim()
    .split("\n")
    .filter((file) => !EXCLUDED_ROOTS.test(file));

const readText = (file: string): string => {
  try {
    return readFileSync(join(KIT_ROOT, file), "utf8");
  } catch {
    return "";
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const kindOf = (file: string): RawNode["kind"] => {
  if (/^tests\//.test(file)) return "test";
  return /\.(ts|js|json|sh)$/.test(file) ? "script" : "doc";
};

const groupOf = (file: string): string => {
  if (/^coding-standards\/frameworks/.test(file)) return "frameworks";
  if (/^coding-standards\/qa/.test(file)) return "qa";
  if (/^coding-standards\/(js-and-ts|js|ts)-standards\//.test(file)) return "script-partials";
  if (/^coding-standards\/(css|html)-standards\//.test(file)) return "partials";
  if (/^coding-standards\//.test(file)) return "standards";
  if (/^skills\/([^/]+)\//.test(file)) return `skills-${file.split("/")[1]}`;
  if (/^tests\//.test(file)) return "tests";
  if (/^extensions\//.test(file)) return "extensions";
  return "root";
};

const actorOf = (node: RawNode): ActorIndex => {
  const USER_GROUPS = ["skills-commands", "root", "extensions"];
  if (USER_GROUPS.includes(node.group)) return 0;
  const isDoc = node.id.startsWith("coding-standards/README") || node.id.startsWith("coding-standards/CLAUDE.example");
  if (isDoc || node.id === "skills/README.md" || node.id === "skills/meta/install-kit.cli.ts") return 0;
  if (node.group === "mods" || /pre-merge-gate\.edit-check|session-budget\.compact|pre-commit\.check|laya-ctl/.test(node.id)) return 2;
  if (node.group === "tests" || node.group === "findings") return 3;
  return 1;
};

const collectNodes = (files: string[]): RawNode[] => {
  const nodes = new Map<string, RawNode>();
  const fileSet = new Set(files);
  const modDirs = new Set<string>();
  const add = (id: string, label: string, group: string, paths: string[], kind: RawNode["kind"]): void => {
    nodes.set(id, { id, label, group, kind, paths, text: paths.map(readText).join("\n"), stem: "", keys: [] });
  };
  const folded: ReadonlyArray<[RegExp, string, string, string]> = [
    [/^skills\/addons\/personality\.personas\//, "personas", "personality personas (6)", "skills-addons"],
    [/^skills\/models\/opencode\/opencode-all-models\.models\//, "ocmodels", "opencode model notes (10)", "skills-models"],
    [/^skills\/standards\/ux-theory\.topics\//, "uxtopics", "ux-theory topics (5)", "skills-standards"],
  ];
  for (const file of files) {
    if (SKIP.test(file)) continue;
    const mod = file.match(/^mods\/([^/]+)\//);
    if (mod && file !== "mods/.claude-plugin/marketplace.json") {
      const name = mod[1];
      if (!modDirs.has(name)) {
        modDirs.add(name);
        const own = files.filter((entry) => entry.startsWith(`mods/${name}/`) && !/tests\/|tsconfig/.test(entry));
        add(`mods/${name}`, name, "mods", own, "mod");
        const tests = files.filter((entry) => entry.startsWith(`mods/${name}/tests/`));
        if (tests.length > 0) add(`mods/${name}/tests`, `${name} tests`, "tests", tests, "test");
      }
      continue;
    }
    if (/^findings\//.test(file)) {
      if (!nodes.has("findings")) add("findings", "findings/", "findings", files.filter((entry) => entry.startsWith("findings/") && !/data\//.test(entry)), "doc");
      continue;
    }
    if (/\.js$/.test(file) && fileSet.has(file.replace(/\.js$/, ".ts"))) continue;
    const fold = folded.find(([pattern]) => pattern.test(file));
    if (fold) {
      if (!nodes.has(fold[1])) add(fold[1], fold[2], fold[3], files.filter((entry) => fold[0].test(entry)), "doc");
      continue;
    }
    add(file, file.split("/").pop() ?? file, groupOf(file), [file], kindOf(file));
  }
  return [...nodes.values()];
};

const buildKeys = (node: RawNode, stemCount: Map<string, number>): RegExp[] => {
  const keys: RegExp[] = [];
  if (node.kind === "mod") {
    keys.push(new RegExp(`mods/${escapeRegex(node.label)}(?![\\w-])`), new RegExp(`\`${escapeRegex(node.label)}\``));
    return keys;
  }
  if (node.kind === "test") return keys;
  const noExt = node.paths[0].replace(/\.(md|ts|js)$/, "");
  keys.push(new RegExp(`${escapeRegex(noExt)}\\.(md|ts|js)(?![\\w-])`));
  const segments = noExt.split("/");
  if (segments.length >= 2) keys.push(new RegExp(`(?<![\\w-])${escapeRegex(segments.slice(-2).join("/"))}(?![\\w-]|\\.\\w)`));
  const stem = node.stem;
  if (stemCount.get(stem) === 1 && !/^(index|README|decisions)$/.test(stem)) {
    const isStrong = /[-.]/.test(stem) && stem.length >= DEPTH_STRONG_STEM;
    if (node.group === "skills-commands") keys.push(new RegExp(`(?<![\\w/.-])/${escapeRegex(stem)}(?![\\w-])`));
    else if (isStrong) keys.push(new RegExp(`(?<![\\w.-])${escapeRegex(stem)}(?![\\w-]|\\.\\w)`));
    else if (node.kind === "doc" || node.kind === "script") keys.push(new RegExp(`\`${escapeRegex(stem)}\``));
  }
  return keys;
};

const collectEdges = (nodes: RawNode[]): Array<[number, number]> => {
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const edges = new Map<string, [number, number]>();
  const link = (from: string, to: string): void => {
    const a = index.get(from);
    const b = index.get(to);
    if (a === undefined || b === undefined || a === b) return;
    if (HUB.test(from)) return;
    edges.set(`${a}|${b}`, [a, b]);
  };
  const dirOf = (path: string): string => path.split("/").slice(0, -1).join("/");
  for (const from of nodes) {
    if (from.kind === "test" && from.id.endsWith("/tests")) link(from.id, from.id.replace("/tests", ""));
    for (const to of nodes) {
      if (from !== to && to.keys.some((key) => key.test(from.text))) link(from.id, to.id);
    }
    if (from.group.startsWith("skills-") && from.kind === "script") {
      const base = from.stem.split(".")[0];
      const doc = nodes.find((other) => other.group === from.group && other.stem === base && other.kind === "doc");
      if (doc) link(from.id, doc.id);
    }
  }
  const nested: ReadonlyArray<[string, string]> = [
    ["personas", "skills/addons/personality.md"],
    ["uxtopics", "skills/standards/ux-theory.md"],
    ["ocmodels", "skills/models/opencode/opencode-all-models.md"],
  ];
  for (const [child, parent] of nested) link(parent, child);
  for (const node of nodes) {
    if (node.kind !== "doc" && node.kind !== "script") continue;
    const dir = dirOf(node.paths[0]);
    const parent = nodes.find((other) => other !== node && other.kind === "doc" && (other.paths[0] === `${dir}.md` || other.paths[0] === `${dir}/index.md`));
    if (parent) link(parent.id, node.id);
  }
  for (const node of nodes.filter((entry) => entry.group === "tests" && entry.paths[0].startsWith("tests/"))) {
    const base = node.stem.replace(/\.test$/, "");
    const subject = nodes.find((other) => other.kind === "script" && other.stem === base) ?? nodes.find((other) => other.id === `mods/${base}`);
    if (subject) link(node.id, subject.id);
  }
  return [...edges.values()];
};

const anchorFor = (groupIndex: number): Vec3 => {
  const y = 1 - ((groupIndex + 0.5) / GROUP_ORDER.length) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = groupIndex * GOLDEN_ANGLE;
  return [Math.cos(theta) * radius * ANCHOR_RADIUS, y * ANCHOR_RADIUS, Math.sin(theta) * radius * ANCHOR_RADIUS];
};

const layoutNodes = (groups: string[], edges: Array<[number, number]>): Float32Array => {
  const count = groups.length;
  const positions = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  let seed = SEED;
  const random = (): number => {
    seed = (seed * SEED_MULTIPLIER) % SEED_MODULUS;
    return seed / SEED_MODULUS - 0.5;
  };
  const anchors = groups.map((group) => anchorFor(Math.max(0, GROUP_ORDER.indexOf(group))));
  for (let i = 0; i < count; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) positions[i * 3 + axis] = anchors[i][axis] + random() * LAYOUT_JITTER;
  }
  for (let step = 0; step < LAYOUT_STEPS; step += 1) {
    const cool = 1 - (step / LAYOUT_STEPS) * LAYOUT_COOL;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz + 0.5;
        if (distSq > LAYOUT_REPULSION_RANGE_SQ) continue;
        const push = LAYOUT_REPULSION / distSq / Math.sqrt(distSq);
        const parts: Vec3 = [dx * push, dy * push, dz * push];
        for (let axis = 0; axis < 3; axis += 1) {
          velocity[i * 3 + axis] += parts[axis];
          velocity[j * 3 + axis] -= parts[axis];
        }
      }
    }
    for (const [a, b] of edges) {
      const delta: Vec3 = [0, 1, 2].map((axis) => positions[b * 3 + axis] - positions[a * 3 + axis]) as Vec3; // map over three axes always yields three numbers
      const dist = Math.hypot(...delta) + 0.01;
      const force = (LAYOUT_SPRING_OTHER * (dist - LAYOUT_REST)) / dist;
      for (let axis = 0; axis < 3; axis += 1) {
        velocity[a * 3 + axis] += delta[axis] * force;
        velocity[b * 3 + axis] -= delta[axis] * force;
      }
    }
    for (let i = 0; i < count; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const at = i * 3 + axis;
        velocity[at] += (anchors[i][axis] - positions[at]) * LAYOUT_ANCHOR_PULL;
        velocity[at] *= LAYOUT_DAMPING;
        positions[at] += velocity[at] * cool;
      }
    }
  }
  return positions;
};

const main = (): void => {
  const nodes = collectNodes(git());
  const stemCount = new Map<string, number>();
  for (const node of nodes) {
    node.stem = node.label.replace(/\.(md|ts|js|json)$/, "").replace(/ tests$/, "");
    stemCount.set(node.stem, (stemCount.get(node.stem) ?? 0) + 1);
  }
  for (const node of nodes) node.keys = buildKeys(node, stemCount);
  const edges = collectEdges(nodes);
  const positions = layoutNodes(nodes.map((node) => node.group), edges);
  const round = (value: number): number => Math.round(value * COORD_PRECISION) / COORD_PRECISION;
  const graph = {
    groups: GROUP_ORDER,
    nodes: nodes.map((node, i) => [node.id, node.label, node.group, actorOf(node), round(positions[i * 3]), round(positions[i * 3 + 1]), round(positions[i * 3 + 2])]),
    edges,
  };
  writeFileSync(OUT_FILE, `${JSON.stringify(graph)}\n`);
};

main();
