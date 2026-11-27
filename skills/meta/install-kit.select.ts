// Arrow-key menus for the installer, on node built-ins only (raw mode + ANSI), like `npx create-next-app`:
// Up/Down move, Space ticks (multi), Enter or Right confirms, Left / Backspace / Esc goes back, q or Ctrl-C quits.
// The caller decides when to use it (both stdin and stdout are a TTY); anything else keeps the numbered prompts.
// Plain Node, no dependencies. The input and output are injected so a test can drive it with a fake terminal.

export type Key = 'up' | 'down' | 'left' | 'right' | 'enter' | 'space' | 'back' | 'quit' | 'all' | 'none' | 'home' | 'end';

// Turns one chunk of terminal input into keys. An unknown sequence is dropped, never mistaken for a pick.
export function parseKeys(chunk: string): Key[] {
  const out: Key[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    if (c === '\x1b') {
      const seq = chunk.slice(i, i + 3);
      if (seq === '\x1b[A') { out.push('up'); i += 2; }
      else if (seq === '\x1b[B') { out.push('down'); i += 2; }
      else if (seq === '\x1b[C') { out.push('right'); i += 2; }
      else if (seq === '\x1b[D') { out.push('left'); i += 2; }
      else if (seq === '\x1b[H') { out.push('home'); i += 2; }
      else if (seq === '\x1b[F') { out.push('end'); i += 2; }
      else if (chunk.length === 1) out.push('back'); // a lone Esc
      else i = chunk.length; // some other escape sequence: ignore the rest of the chunk
    } else if (c === '\r' || c === '\n') out.push('enter');
    else if (c === ' ') out.push('space');
    else if (c === '\x7f' || c === '\b') out.push('back');
    else if (c === '\x03' || c === 'q' || c === 'Q') out.push('quit');
    else if (c === 'a' || c === 'A') out.push('all');
    else if (c === 'n' || c === 'N') out.push('none');
    else if (c === 'k') out.push('up');
    else if (c === 'j') out.push('down');
  }
  return out;
}

export interface MenuItem { title: string; hint?: string }
export interface MenuSpec {
  header: string;          // "Step 3 of 9"
  question: string;
  items: MenuItem[];
  multi?: boolean;
  initial?: number[];      // pre-selected (ticked, for multi; the highlighted one for single)
  canBack: boolean;
  canRedo?: boolean;       // an earlier answer is remembered for this step, so Right replays it
}
export type MenuResult = { kind: 'pick'; picked: number[] } | { kind: 'back' };

export interface MenuIO {
  input: { on(ev: 'data', fn: (d: string | Buffer) => void): unknown; off?(ev: 'data', fn: (d: string | Buffer) => void): unknown; removeListener?(ev: 'data', fn: (d: string | Buffer) => void): unknown; setRawMode?(on: boolean): unknown; resume?(): unknown; pause?(): unknown; setEncoding?(e: string): unknown };
  output: { write(s: string): unknown; columns?: number; rows?: number };
  color: boolean;
}
export class QuitSignal extends Error {}

export const KEYS_HELP = 'Up/Down move  Enter pick  Left back  Right redo  q quit';
export const footerFor = (s: MenuSpec): string =>
  ['Up/Down move', s.multi ? 'Space tick' : '', s.multi ? 'a all, n none' : '', 'Enter confirm', s.canBack ? 'Left undo' : '', s.canRedo ? 'Right redo' : '', 'q quit'].filter(Boolean).join(' | ');

// Shows the menu and resolves on Enter/Right (a pick), Left/Backspace/Esc (back) or rejects with QuitSignal.
export function runMenu(io: MenuIO, spec: MenuSpec): Promise<MenuResult> {
  const bold = (s: string): string => (io.color ? `\x1b[1m${s}\x1b[22m` : s);
  const dim = (s: string): string => (io.color ? `\x1b[2m${s}\x1b[22m` : s);
  const cyan = (s: string): string => (io.color ? `\x1b[36m${s}\x1b[39m` : s);
  const n = spec.items.length;
  const ticked = new Set<number>(spec.multi ? spec.initial ?? [] : []);
  let cursor = spec.multi ? 0 : Math.min(Math.max(spec.initial?.[0] ?? 0, 0), n - 1);
  let drawn = 0;

  const visible = (s: string): number => s.replace(/\[[0-9;]*m/g, '').length;
  function fit(s: string, cols: number): string { // never wider than the terminal, so a line never wraps and the redraw count stays true
    if (!cols || visible(s) <= cols) return s;
    let out = '', w = 0;
    for (let i = 0; i < s.length && w < cols - 1; i++) {
      const m = /^\[[0-9;]*m/.exec(s.slice(i));
      if (m) { out += m[0]; i += m[0].length - 1; } else { out += s[i]; w++; }
    }
    return out + (io.color ? '[0m' : '') + '…';
  }
  function lines(): string[] {
    const cols = io.output.columns ?? 0;
    const rows = io.output.rows ?? 0;
    const room = rows ? Math.max(3, rows - 5) : n; // header, question, footer, two scroll hints, prompt line
    const start = n <= room ? 0 : Math.min(Math.max(cursor - Math.floor(room / 2), 0), n - room);
    const end = Math.min(n, start + room);
    const out = [dim(spec.header), bold(spec.question)];
    if (start > 0) out.push(dim(`  ... ${start} more above`));
    for (let i = start; i < end; i++) {
      const it = spec.items[i];
      const mark = spec.multi ? (ticked.has(i) ? '[x]' : '[ ]') : i === cursor ? '(*)' : '( )';
      out.push(`${i === cursor ? cyan('>') : ' '} ${mark} ${it.title}${it.hint ? ' ' + dim('- ' + it.hint) : ''}`);
    }
    if (end < n) out.push(dim(`  ... ${n - end} more below`));
    out.push(dim(footerFor(spec)));
    return out.map((l) => fit(l, cols));
  }
  function draw(first: boolean): void {
    const l = lines();
    if (!first && drawn) {
      // Clear exactly the number of lines we previously drew, plus handle potential terminal wrapping
      for (let i = 0; i < drawn; i++) {
        io.output.write('\x1b[2K\x1b[1A'); // clear line + move up
      }
    }
    io.output.write(l.join('\n') + '\n');
    drawn = l.length;
  }

  return new Promise((resolve, reject) => {
    const done = (r: MenuResult | Error): void => {
      (io.input.off ?? io.input.removeListener)?.call(io.input, 'data', onData);
      io.input.setRawMode?.(false);
      io.input.pause?.();
      if (r instanceof Error) reject(r); else resolve(r);
    };
    const onData = (d: string | Buffer): void => {
      for (const k of parseKeys(typeof d === 'string' ? d : d.toString('utf8'))) {
        if (k === 'up') cursor = (cursor + n - 1) % n;
        else if (k === 'down') cursor = (cursor + 1) % n;
        else if (k === 'home') cursor = 0;
        else if (k === 'end') cursor = n - 1;
        else if (k === 'space' && spec.multi) { if (ticked.has(cursor)) ticked.delete(cursor); else ticked.add(cursor); }
        else if (k === 'all' && spec.multi) spec.items.forEach((_, i) => ticked.add(i));
        else if (k === 'none' && spec.multi) ticked.clear();
        else if ((k === 'left' || k === 'back') && spec.canBack) return done({ kind: 'back' });
        else if (k === 'enter' || (k === 'right' && spec.canRedo)) { // Right replays only an answer given before
          return done({ kind: 'pick', picked: spec.multi ? [...ticked].sort((a, b) => a - b) : [cursor] });
        } else if (k === 'quit') return done(new QuitSignal('quit'));
      }
      draw(false);
    };
    io.input.setEncoding?.('utf8');
    io.input.setRawMode?.(true);
    io.input.resume?.();
    io.input.on('data', onData);
    draw(true);
  });
}
