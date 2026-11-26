---
name: modern-web
description: Opt-in. Use to modernize a codebase or find legacy web patterns (jQuery modals, float layouts, old APIs). Load BEFORE listing or rewriting them.
---

# Modern Web — legacy-pattern scan from Chrome's guidance

**This is opt-in only, never part of any default install.** Models write old patterns because their training data is full of them. Chrome's `modern-web-guidance` package knows which patterns the platform now handles natively. This add-on runs its scanner and gives you a short table, not raw JSON.

## Learnings
Apply `learnings.md` if the `learnings-inject` mod supplied it (never search). At end, add one dated bullet only for a new, non-obvious lesson (a false positive that keeps returning, a scanner output change); merge, don't duplicate.

## First run (a person typing, no experience needed)
1. Check Node is installed and new enough: type `node -v` and press Enter. You need `v22` or higher. A lower number or "not recognised": install the current Node from nodejs.org, then open a new terminal.
2. Open a terminal in your project folder. In VS Code, use Terminal, New Terminal.
3. Type `/modern-web` in Claude Code, or `node <skill-root>/modern-web/cli.js` in a terminal, and press Enter. The first run downloads the scanner (about 9 MB) and takes up to a minute.
4. You see rows like `src/app.js:3  <guide>  <the old line>`. Each row is a candidate, not a verdict.
If you see "scan skipped", the line says why: Node too old, no network, or the scanner failed. Nothing is broken; fix the cause and run it again. Add `--dry-run` to see the command without downloading anything.

## The tool
`node <skill-root>/modern-web/cli.js [folder] [--changed] [--limit <n>] [--refresh] [--json] [--dry-run]`. Plain Node, no dependencies. It runs `npx modern-web-guidance@1.0.0 legacy-scan . --json` in the folder (pinned, never "latest"), drops vendor and minified files, caches the result for 24 hours, and prints the table.

## Rules
- **The scanner covers about 20% of the guidance** (the patterns it can detect by rule). No findings does not mean the code is modern.
- **Every row is a candidate.** Check its keepWhen note before editing: fallbacks, helpers used elsewhere and lookalikes are false positives. Never edit safe code to make the list shorter.
- **The kit's rules win.** A row marked `kit:` (modals, forms) follows the kit standard; native `<dialog>` only where it meets it.
- **Report first.** Modernize only when the user asked for it. Get the replacement with `npx modern-web-guidance@1.0.0 retrieve <guide>`, keep an existing library as a fallback where the guide says so, and run the project's tests.
- **Network and third-party code:** the first run downloads and runs a package from npm. The add-on names it, pins its version and never reads secrets. Offline, it skips quietly.

## Credit
modern-web-guidance is by the Chrome team (GoogleChrome/modern-web-guidance-src, Apache-2.0). The kit calls it at run time and copies nothing from it. See `CREDITS.md`.
