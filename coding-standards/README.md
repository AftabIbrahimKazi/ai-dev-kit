# Coding Standards

A universal, portable coding standards system for use with Claude Code and any AI assistant. Drop this folder into any project and follow the setup steps below — the AI will load and follow the standards automatically from that point forward, every session, without being told again.

---

## What This Folder Contains

| File / Folder | Purpose |
|---|---|
| `index.md` | Central entry point — how the system works, file-to-role mapping, links to all standards |
| `css-standards.md` | Global CSS laws |
| `css-standards/` | CSS rules per file role (token, layout, component, overlay, utility) |
| `html-standards.md` | Global HTML laws |
| `html-standards/` | HTML rules per file role (layout templates, pages, components) |
| `js-standards.md` | JavaScript only projects |
| `js-standards/` | JS file-role partials |
| `ts-standards.md` | TypeScript only projects |
| `ts-standards/` | TS file-role partials |
| `js-and-ts-standards.md` | Projects using JS and TS together |
| `js-and-ts-standards/` | Combined file-role partials |
| `git-standards.md` | Commit messages, branching, push rules |
| `versioning-standards.md` | Version format and changelog rules |
| `seo-standards.md` | SEO — titles, meta, structure, schema |
| `performance-standards.md` | Assets, scripts, CSS, Core Web Vitals |
| `accessibility-standards.md` | WCAG 2.1 AA — keyboard, ARIA, contrast, forms |
| `qa-standards.md` | Logic checks, security, branch gates, bug reporting |
| `ai-standards.md` | AI behaviour — hallucination detection, token efficiency |
| `frameworks/astro.md` | Astro-specific additions and overrides |
| `frameworks/astro/` | Astro file-role partials |
| `frameworks/bootstrap.md` | Bootstrap conflicts, violations, workarounds |
| `CLAUDE.example.md` | Template for your project's CLAUDE.md — see setup below |

---

## One-Time Setup

### Step 1 — Drop this folder into your project root

```
your-project/
└── coding-standards/    ← this folder
```

### Step 2 — Copy CLAUDE.example.md to your project root

```bash
cp coding-standards/CLAUDE.example.md CLAUDE.md
```

### Step 3 — Fill in your project values in CLAUDE.md

Open `CLAUDE.md` and update the **Project-Specific Context** table:

- Project name
- Framework (Astro, Next.js, none, etc.)
- CSS framework (Bootstrap, none, etc.)
- Script standard (JS only / TS only / JS + TS combined)
- CSS token prefix (e.g. `--ex-`)
- Selector signature (e.g. `ex-`)
- Token file path
- Global stylesheet path
- Entry script paths

Update the **Active Standards** table to enable or disable standards that apply to your project. Remove rows for standards that do not apply.

### Step 4 — Tell Claude once

In a new Claude Code session say:

```
Read CLAUDE.md
```

That is the only time you will ever need to say it. From this point forward every session loads the standards automatically.

---

## How It Works

```
New session starts
→ Claude Code auto-loads CLAUDE.md
→ CLAUDE.md instructs Claude to read coding-standards/index.md
→ index.md maps every file role to its standards chain
→ Claude loads the relevant standards before editing any file
→ Claude begins every response with [CX] to confirm context is active
→ Work begins under the full standards system
```

---

## Hallucination Detection

Every Claude response must begin with `[CX]`. This is the context-active signal defined in `ai-standards.md`.

**If `[CX]` is missing:**
1. Stop the response immediately
2. Discard it — do not use it
3. Update `handover.md` with the current project state
4. Start a new session

A response without `[CX]` means Claude has lost context and is operating without the standards loaded. Any code it produces in that state may break more than it fixes.

---

## Adding a New Framework

If your project uses a framework not already covered in `frameworks/`:

1. Create `frameworks/[framework-name].md`
2. Document which universal rules the framework overrides (use OVERRIDES notation)
3. Document any framework-specific additions
4. If the framework has a CSS layer, document known violations and workarounds
5. Add the file to the Active Standards table in `CLAUDE.md`
6. Add the file to the Standards Files table in `index.md`

---

## Updating the Standards

These standards are living documents. When a rule needs to change:

1. Edit the relevant file directly
2. Commit with type `docs:` following git standards
3. If the change affects `CLAUDE.md` update it too
4. Start a new session so Claude loads the updated rules

---

## Portability

This folder is fully self-contained and project-agnostic. The only project-specific information lives in `CLAUDE.md` at the project root — not inside this folder. Drop `coding-standards/` into any project, fill in a new `CLAUDE.md`, and the full standards system is active.
