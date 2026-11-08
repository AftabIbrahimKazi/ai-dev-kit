import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Viewport {
  width: number;
  height: number;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
  sessionId?: string;
}

interface CdpConnection {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>;
  onEvent: (handler: (message: CdpMessage) => void) => void;
  close: () => void;
}

interface SectionFit {
  id: string;
  content: number;
  room: number;
  left: number;
  right: number;
}

interface FitMeasurement {
  sections: SectionFit[];
  navLeft: number;
  navRight: number;
  h1Left: number;
  footerLeft: number;
  footerRight: number;
  hasHorizontalScroll: boolean;
}

interface ViewportResult {
  viewport: Viewport;
  problems: string[];
  summary: string;
}

const DEFAULT_URL = "http://localhost:3000";
const EDGE_TOLERANCE = 0.5;
const SCROLLBAR_HIDDEN_BELOW = 700;
const SETTLE_MS = 150;
const LAUNCH_TIMEOUT_MS = 15000;
const POLL_MS = 100;
const CLOSE_GRACE_MS = 2000;

const VIEWPORTS: readonly Viewport[] = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 480, height: 800 },
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1024, height: 1366 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const CHROME_CANDIDATES: readonly string[] = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const CLS_LIMIT = 0.001;

const CLS_SCRIPT = `window.__cls = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
}).observe({ type: "layout-shift", buffered: true });`;

const TAB_SHIFT_SCRIPT = `(async () => {
  const layout = () => JSON.stringify([
    Array.from(document.querySelectorAll("section h1, section h2")).map((h) => h.getBoundingClientRect().top),
    Array.from(document.querySelectorAll("section")).map((s) => s.getBoundingClientRect().height),
  ]);
  const before = layout();
  let moved = 0;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.click();
    await new Promise((done) => setTimeout(done, 50));
    if (layout() !== before) moved += 1;
  }
  return moved;
})()`;

const MEASURE_SCRIPT = `(() => {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:var(--size-chrome)";
  document.body.appendChild(probe);
  const room = window.innerHeight - probe.getBoundingClientRect().height;
  probe.remove();
  const px = (value) => parseFloat(value) || 0;
  const sections = Array.from(document.querySelectorAll("section")).map((section) => {
    const style = getComputedStyle(section);
    const rect = section.getBoundingClientRect();
    const kids = Array.from(section.children).filter((child) => child.getClientRects().length > 0);
    const first = kids[0];
    const last = kids[kids.length - 1];
    const top = first ? first.getBoundingClientRect().top - px(getComputedStyle(first).marginTop) : rect.top;
    const bottom = last ? last.getBoundingClientRect().bottom + px(getComputedStyle(last).marginBottom) : rect.top;
    return {
      id: section.id || "(no id)",
      content: bottom - top + px(style.paddingTop) + px(style.paddingBottom),
      room,
      left: rect.left + px(style.paddingLeft),
      right: rect.right - px(style.paddingRight),
    };
  });
  const nav = document.querySelector("header nav");
  const h1 = document.querySelector("h1");
  const plate = document.querySelector("footer > div");
  const navRect = nav ? nav.getBoundingClientRect() : { left: NaN, right: NaN };
  const plateRect = plate ? plate.getBoundingClientRect() : { left: NaN, right: NaN };
  return {
    sections,
    navLeft: navRect.left,
    navRight: navRect.right,
    h1Left: h1 ? h1.getBoundingClientRect().left : NaN,
    footerLeft: plateRect.left,
    footerRight: plateRect.right,
    hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()`;

function findChrome(): string {
  const override = process.env.CHROME_PATH;
  if (override && existsSync(override)) return override;
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  return found;
}

function waitMs(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function launchChrome(profileDir: string): Promise<{ process: ChildProcess; socketUrl: string }> {
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port, path] = (await readFile(portFile, "utf8")).trim().split("\n");
      if (port && path) return { process: chrome, socketUrl: `ws://127.0.0.1:${port}${path}` };
    }
    await waitMs(POLL_MS);
  }
  chrome.kill();
  throw new Error("Chrome did not expose a debugging port in time.");
}

function openCdpConnection(socketUrl: string): Promise<CdpConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (reason: Error) => void }>();
    const handlers: Array<(message: CdpMessage) => void> = [];
    let nextId = 0;

    socket.addEventListener("error", () => reject(new Error("DevTools socket failed to open.")));
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpMessage; // DevTools protocol frames are JSON objects
      if (message.id !== undefined) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter?.reject(new Error(message.error.message));
        else waiter?.resolve(message.result ?? {});
        return;
      }
      handlers.forEach((handler) => handler(message));
    });
    socket.addEventListener("open", () =>
      resolve({
        send: (method, params = {}, sessionId) =>
          new Promise((resolveSend, rejectSend) => {
            nextId += 1;
            pending.set(nextId, { resolve: resolveSend, reject: rejectSend });
            socket.send(JSON.stringify({ id: nextId, method, params, sessionId }));
          }),
        onEvent: (handler) => {
          handlers.push(handler);
        },
        close: () => socket.close(),
      }),
    );
  });
}

function describeLogEntry(message: CdpMessage): string | null {
  const params = message.params ?? {};
  if (message.method === "Runtime.exceptionThrown") {
    const details = params.exceptionDetails as { text?: string } | undefined; // CDP exceptionThrown payload
    return `exception: ${details?.text ?? "unknown"}`;
  }
  if (message.method === "Log.entryAdded") {
    const entry = params.entry as { level?: string; text?: string } | undefined; // CDP Log.entryAdded payload
    return entry?.level === "error" ? `log: ${entry.text ?? "unknown"}` : null;
  }
  if (message.method === "Runtime.consoleAPICalled" && params.type === "error") return "console.error call";
  return null;
}

function checkMeasurement(measurement: FitMeasurement): string[] {
  const problems: string[] = [];
  const lefts = [measurement.navLeft, measurement.h1Left, measurement.footerLeft, ...measurement.sections.map((s) => s.left)];
  const rights = [measurement.navRight, measurement.footerRight, ...measurement.sections.map((s) => s.right)];
  measurement.sections.forEach((section) => {
    if (section.content > section.room + EDGE_TOLERANCE) {
      problems.push(`${section.id} content ${section.content.toFixed(0)} > room ${section.room.toFixed(0)}`);
    }
  });
  if (Math.max(...lefts) - Math.min(...lefts) > EDGE_TOLERANCE) problems.push(`left edges differ: ${lefts.map((v) => v.toFixed(1)).join(" / ")}`);
  if (Math.max(...rights) - Math.min(...rights) > EDGE_TOLERANCE) problems.push(`right edges differ: ${rights.map((v) => v.toFixed(1)).join(" / ")}`);
  if (measurement.hasHorizontalScroll) problems.push("horizontal scroll");
  return problems;
}

async function checkViewport(connection: CdpConnection, sessionId: string, url: string, viewport: Viewport): Promise<ViewportResult> {
  const logged: string[] = [];
  const loaded = new Promise<void>((resolve) => {
    connection.onEvent((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === "Page.loadEventFired") resolve();
      const entry = describeLogEntry(message);
      if (entry) logged.push(entry);
    });
  });
  await connection.send(
    "Emulation.setDeviceMetricsOverride",
    { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await connection.send("Emulation.setScrollbarsHidden", { hidden: viewport.width < SCROLLBAR_HIDDEN_BELOW }, sessionId);
  await connection.send("Page.navigate", { url }, sessionId);
  await loaded;
  await connection.send(
    "Runtime.evaluate",
    { expression: `document.fonts.ready.then(() => new Promise((done) => setTimeout(done, ${SETTLE_MS})))`, awaitPromise: true },
    sessionId,
  );
  const evaluated = await connection.send("Runtime.evaluate", { expression: MEASURE_SCRIPT, returnByValue: true }, sessionId);
  const measurement = (evaluated.result as { value: FitMeasurement }).value; // shape defined by MEASURE_SCRIPT
  const clsResult = await connection.send("Runtime.evaluate", { expression: "window.__cls", returnByValue: true }, sessionId);
  const cls = (clsResult.result as { value: number }).value; // number set by CLS_SCRIPT
  const movedResult = await connection.send(
    "Runtime.evaluate",
    { expression: TAB_SHIFT_SCRIPT, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  const tabMoves = (movedResult.result as { value: number }).value; // count returned by TAB_SHIFT_SCRIPT
  const shiftProblems: string[] = [];
  if (cls > CLS_LIMIT) shiftProblems.push(`layout shift on load: cls ${cls.toFixed(4)}`);
  if (tabMoves > 0) shiftProblems.push(`tab switch moved layout (${tabMoves} tab(s))`);
  const problems = [...checkMeasurement(measurement), ...shiftProblems, ...logged];
  const worst = measurement.sections.reduce((a, b) => (b.content / b.room > a.content / a.room ? b : a));
  const summary = `content ${worst.content.toFixed(0)}/${worst.room.toFixed(0)}  left ${measurement.navLeft.toFixed(1)}  cls ${cls.toFixed(3)}  errors ${logged.length}`;
  return { viewport, problems, summary };
}

async function runFitCheck(url: string): Promise<boolean> {
  const profileDir = await mkdtemp(join(tmpdir(), "fit-check-"));
  const { process: chrome, socketUrl } = await launchChrome(profileDir);
  const connection = await openCdpConnection(socketUrl);
  let isAllFit = true;
  try {
    const created = await connection.send("Target.createTarget", { url: "about:blank" });
    const attached = await connection.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId as string; // returned by Target.attachToTarget
    await Promise.all(["Page.enable", "Runtime.enable", "Log.enable"].map((method) => connection.send(method, {}, sessionId)));
    await connection.send("Page.addScriptToEvaluateOnNewDocument", { source: CLS_SCRIPT }, sessionId);
    for (const viewport of VIEWPORTS) {
      const result = await checkViewport(connection, sessionId, url, viewport);
      const label = `${viewport.width}x${viewport.height}`.padEnd(10);
      process.stdout.write(`${label}${result.problems.length === 0 ? "OK    " : "FAIL  "}${result.summary}\n`);
      result.problems.forEach((problem) => process.stdout.write(`          - ${problem}\n`));
      if (result.problems.length > 0) isAllFit = false;
    }
  } finally {
    await connection.send("Browser.close").catch(() => undefined);
    connection.close();
    await waitMs(CLOSE_GRACE_MS);
    chrome.kill();
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return isAllFit;
}

runFitCheck(process.argv[2] ?? DEFAULT_URL)
  .then((isAllFit) => {
    process.stdout.write(isAllFit ? "ALL FIT\n" : "NOT ALL FIT\n");
    process.exitCode = isAllFit ? 0 : 1;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
