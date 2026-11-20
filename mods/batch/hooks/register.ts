import type { Register } from 'claude-code'

const TOOL = /^mcp__batch__run$/
const ALLOWED = new Set(['Read', 'Glob', 'Grep', 'Map'])
const MAX_OPS = 25
const MAX_OP_CHARS = 6000
const MAX_TOTAL_CHARS = 40000
const MAX_REGEX = 200
const MAX_LINE = 400
const SCAN = 200
const MAP_DEFAULT = 40
const MAP_MAX = 80

type Op = Record<string, unknown> & { tool?: unknown }

const COMMENT = /^\s*(\/\/(?![#@])|\/\*|\*)/
const SYMBOL = /^\s*(export\s+)?(default\s+)?(async\s+)?(function\*?|class|interface|type|enum|def|const|let)\s+\w+|^\s*(module\.)?exports\.\w+\s*=/
const HEADING = /^(#{1,6}\s|description:)/
const PREFIX = /^\s*\d+\t/

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n)}\n[truncated ${s.length - n} chars]` : s

const plain = (text: string) => text.split('\n').map((l) => l.replace(PREFIX, '').slice(0, MAX_LINE))

const headerBlock = (text: string, max: number) => {
  const lines = plain(text).slice(0, SCAN)
  let first: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!COMMENT.test(lines[i] ?? '')) continue
    const block: string[] = []
    while (i < lines.length && COMMENT.test(lines[i] ?? '')) block.push(lines[i++] ?? '')
    if (block.length >= 2) return block.slice(0, max).join('\n')
    if (first.length === 0) first = block
  }
  return first.length > 0 ? first.slice(0, max).join('\n') : `[no header comment in first ${SCAN} lines]`
}

const capped = (lines: string[], max: number) =>
  lines.length > max ? `${lines.slice(0, max).join('\n')}\n[+${lines.length - max} more lines]` : lines.join('\n')

const pick = (text: string, re: RegExp, max: number) => {
  const all = plain(text)
  const hit = all.filter((l) => re.test(l))
  return hit.length > 0 ? capped(hit, max) : `[none found in ${all.length} lines]`
}

const reduce = (text: string, only?: RegExp, maxLines?: number, count?: boolean) => {
  let lines = text.split('\n')
  const read = lines.length
  if (only) {
    lines = plain(text).filter((l) => only.test(l))
    if (lines.length === 0 && !count) {
      return `[no line matched in ${read} lines read; header follows]\n${headerBlock(text, 3)}`
    }
  }
  if (count) return String(lines.length)
  return maxLines !== undefined ? capped(lines, maxLines) : lines.join('\n')
}

const lineCount = (text: string) => {
  let last = '0'
  for (const m of text.matchAll(/^\s*(\d+)\t/gm)) last = m[1] ?? last
  return last
}

const purpose = (text: string, max: number) =>
  headerBlock(text, max)
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*+)\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 220)

export const register: Register = (on) => {
  const ledger = { calls: 0, ops: 0, rawChars: 0, returnedChars: 0 }
  let queue: Promise<unknown> = Promise.resolve()

  const statsLine = () => {
    const saved = ledger.rawChars > 0 ? Math.round((1 - ledger.returnedChars / ledger.rawChars) * 100) : 0
    return `batch: ${ledger.calls} calls, ${ledger.ops} ops, read ${ledger.rawChars} chars, returned ${ledger.returnedChars} chars (${saved}% kept out of context)`
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'batch-stats',
      description: 'Show what the batch tool kept out of context this session',
    })
    await $.tool.register({
      name: 'run',
      isDeferred: false,
      description:
        'Batch read-only lookups in one call. ops: up to 25 of {tool:"Read"|"Glob"|"Grep", ...its args}. Reducers run inside the tool, before you see the result: ' +
        'only:regex, maxLines:n, count:true; Read only: header:true (purpose comment), symbols:true (declarations), headings:true (md outline). ' +
        '{tool:"Map",path:"/abs/dir",pattern:"**/*.js"} returns path | lines | purpose for every match in one op. ' +
        'If only matches nothing you get the header. Use for 3+ lookups; use plain Read to edit.',
      inputSchema: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            maxItems: MAX_OPS,
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', enum: ['Read', 'Glob', 'Grep', 'Map'] },
                only: { type: 'string', maxLength: MAX_REGEX },
                maxLines: { type: 'integer', minimum: 1 },
                count: { type: 'boolean' },
                header: { type: 'boolean' },
                symbols: { type: 'boolean' },
                headings: { type: 'boolean' },
                maxFiles: { type: 'integer', minimum: 1, maximum: MAP_MAX },
              },
              required: ['tool'],
              additionalProperties: true,
            },
          },
        },
        required: ['ops'],
      },
    })
    return next(e)
  })

  on('command.run', { command: 'batch-stats' }, async () => ({ text: statsLine() }))

  on('tool.run', { tool: TOOL }, async ($, e) => {
    let raw = 0
    const ops = (e as unknown as { ops?: Op[] }).ops
    if (!Array.isArray(ops) || ops.length === 0) return { deny: 'batch: ops must be a non-empty array.' }
    if (ops.length > MAX_OPS) return { deny: `batch: at most ${MAX_OPS} ops per call.` }

    const bad = ops.find((o) => typeof o?.tool !== 'string' || !ALLOWED.has(o.tool))
    if (bad) return { deny: 'batch: read-only. Only Read, Glob, Grep, Map are allowed.' }

    const runMap = async (op: Op, i: number) => {
      const base = typeof op.path === 'string' ? op.path.replace(/[\\/]+$/, '') : ''
      const pattern = typeof op.pattern === 'string' ? op.pattern : ''
      if (!base || !pattern) return `#${i} Map REFUSED: needs path (absolute dir) and pattern.`
      const found = await $.tool.call({ tool: 'Glob', pattern, path: base } as never)
      if ('deny' in found && found.deny !== undefined) return `#${i} Map DENIED: ${found.deny}`
      const files = String(found.text ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^no files/i.test(l))
      const cap = Math.min(typeof op.maxFiles === 'number' ? op.maxFiles : MAP_DEFAULT, MAP_MAX)
      const rows = await Promise.all(
        files.slice(0, cap).map(async (f) => {
          try {
            const abs = /^([A-Za-z]:|[\\/])/.test(f) ? f : `${base}/${f}`
            const r = await $.tool.call({ tool: 'Read', file_path: abs } as never)
            const text = String(r.text ?? '')
            raw += text.length
            return `${f} | ${lineCount(text)} | ${purpose(text, typeof op.maxLines === 'number' ? op.maxLines : 2)}`
          } catch {
            return `${f} | ? | FAILED`
          }
        }),
      )
      const more = files.length > cap ? `\n[+${files.length - cap} more files]` : ''
      return `#${i} Map ${files.length} files\n${rows.join('\n')}${more}`
    }

    const runOp = async (op: Op, i: number) => {
      if (op.tool === 'Map') return runMap(op, i)
      const { only, maxLines, count, header, symbols, headings, ...args } = op as Op & {
        only?: unknown
        maxLines?: unknown
        count?: unknown
        header?: unknown
        symbols?: unknown
        headings?: unknown
      }
      const isRead = op.tool === 'Read'
      const isHeader = isRead && header === true
      let re: RegExp | undefined
      if (typeof only === 'string') {
        if (only.length > MAX_REGEX) return `#${i} ${op.tool} REFUSED: only regex over ${MAX_REGEX} chars.`
        re = new RegExp(only)
      }
      if (isHeader || (isRead && (symbols === true || headings === true))) {
        delete args.limit
        delete args.offset
      }
      const r = await $.tool.call(args as never)
      if ('deny' in r && r.deny !== undefined) return `#${i} ${op.tool} DENIED: ${r.deny}`
      const text = String(r.text ?? '')
      raw += text.length
      const cap = typeof maxLines === 'number' ? maxLines : undefined
      let shaped: string
      if (isHeader) shaped = headerBlock(text, cap ?? 6)
      else if (isRead && symbols === true) shaped = pick(text, SYMBOL, cap ?? 30)
      else if (isRead && headings === true) shaped = pick(text, HEADING, cap ?? 30)
      else shaped = reduce(text, re, cap, count === true)
      return `#${i} ${op.tool}${r.isError ? ' ERROR' : ''}\n${clip(shaped, MAX_OP_CHARS)}`
    }

    const parts = await Promise.all(
      ops.map(async (op, i) => {
        try {
          return await runOp(op, i)
        } catch (err) {
          return `#${i} ${String(op.tool)} FAILED: ${(err as Error).message}`
        }
      }),
    )

    const digest = clip(parts.join('\n\n'), MAX_TOTAL_CHARS)

    ledger.calls += 1
    ledger.ops += ops.length
    ledger.rawChars += raw
    ledger.returnedChars += digest.length
    const snapshot = { ...ledger }
    queue = queue.then(async () => {
      try {
        const sid = await $.session.id()
        const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
        if (!home) return
        await $.fs.write(
          `${home}/.ai-dev-kit/batch-ledger/${sid}.json`,
          JSON.stringify({ session: sid, updated: String(await $.clock.now()), ...snapshot }),
        )
      } catch {
        // a ledger problem must never touch the lookup
      }
    })

    return { result: digest, text: digest } as never
  }).catch(() => ({ deny: 'batch: failed, use separate Read/Glob/Grep calls.' }))
}
