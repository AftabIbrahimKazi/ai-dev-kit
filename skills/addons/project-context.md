---
name: project-context
description: Opt-in add-on. Use whenever the user asks to set up project docs (requirements, brand, design), or a project-context/ folder exists. Load this BEFORE reading it.
---

# Project Context — Private Project Docs, Indexed for Few Tokens

**This is opt-in only, never part of any default install.** Some projects, mostly office work, come with requirements, brand and taste notes, assets, feature lists and Figma links. This add-on keeps them in one gitignored folder, `project-context/`, and gives each sub-folder an `INDEX.md` so the agent finds a fact without reading the raw files.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (an index layout that saved reads, or a file type that was misread). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## The tool
`node <skill-root>/project-context/scan.js <command>` (plain Node). It does the mechanical work so the agent reads only what changed.

| Command | Does |
|---|---|
| `detect` | Guesses the project type, lists existing doc candidates, and shows recommended folders. |
| `init [--folders a,b] [--copy]` | Without `--folders`: prints the setup options. With it: creates the folders, a root index and the `.gitignore` entry. `--copy` copies matching existing docs in; originals stay. |
| `status` | Folders, file counts, current or stale, gitignore state, and a leak check for tracked files. |
| `changed [folder]` | New, modified and deleted files since the last analysis. Without a folder: the stale folders. |
| `stamp <folder>` | Records the folder as analyzed. Run it after writing `INDEX.md`. |
| `root` | Rebuilds the folder table in `project-context/INDEX.md`. |
| `add <folder> <file>...` | Copies files into a folder. |

## Setup (user asks for the feature)
1. Run `init` with no folders. Show the detected type, the existing material and the three options, and ask which one:
   - **A. Auto-detect:** folders come from the docs the project already has. Best for established projects.
   - **B. Recommended:** the common set for this project type (web, backend, mobile, generic): requirements, taste, design (Figma), assets, features, and so on.
   - **C. Other:** the user names more folders, on their own or added to A or B.
2. Ask whether to copy existing docs in (`--copy`). Never move or delete a user's file.
3. Run `init --folders <list>`. Tell the user to drop docs into the folders, then run `/ctx analyze`.
4. Ask to add one line to the session-protocol file (`CLAUDE.md` or `AGENTS.md`): "If `project-context/INDEX.md` exists, read it before work that depends on requirements, brand, design or assets." A skill description may not fire on its own; this line makes every session check.

## Analyze (user asks, or after files change)
1. Run `changed [folder]`. Read only `NEW` and `MODIFIED` files, by kind:
   - Text and PDF: read. Text over 200 KB: headings and the first 2 KB.
   - Images: view only those the task needs; otherwise list by name.
   - Office, design and media files: list them, and ask before opening.
   - Figma: no connector needed. The user exports frames from Figma as SVG with "Outline text" unchecked (colors, fonts, text; outlined text is not readable) and PNG (reference) into a folder; `node <skill-root>/project-context/figma.js <folder> [--link <url>] [--write]` measures them and drafts `design/figma.md` in code, so no tokens go on reading exports. Open a PNG only for a layout question.
2. Update the folder's `INDEX.md`: add or change rows for those files, remove rows for `DELETED` ones, keep the rest. Layout, at most 60 lines:
   `# <folder>`, `Purpose: <one line>`, `Updated: <date>`, a **Files** table (File, What it is, Open when), a **Key facts** table (Fact, Source file), and **Gaps and conflicts**.
3. Facts come from the files, each with its source. Do not infer. Where two docs disagree, list both under conflicts and do not pick one.
4. Run `stamp <folder>`, then report one line per folder.

## Using it in a session
1. At session start, if `project-context/` exists, read only `project-context/INDEX.md`.
2. For a task, open the relevant folder's `INDEX.md` and answer from its Key facts. Open a raw file only when the index says to, or when exact wording, numbers or tokens are needed.
3. Never read all folders. Run `status` when the index may be old; if a folder is stale, say so and offer `/ctx analyze` before relying on it.
4. The agent edits `INDEX.md` files only. Never edit the user's docs. When a decision is settled during development, propose one line for the user's decisions folder and wait for approval.

## Privacy rules
1. The folder is gitignored and `pre-commit` blocks any staged file under it.
2. Never put its content in a commit, PR, issue, published page, document connector, web search or subagent prompt unless the user says so for that content.
3. If a file holds credentials, say "credentials present in <file>". Never print them.
4. These docs may not follow the kit's standards. Do not rewrite them or flag their style. If a doc conflicts with a coding standard, the standard governs the code; flag the conflict.

## Failure mode this prevents
Re-reading a pile of raw documents every session, answering from a stale summary, picking one side of two contradicting docs, or private client material ending up in a commit or a published page.
