---
name: web-digest
description: Opt-in. Use for a quick question about one public URL: Obscura fetches the page as text and the free router answers briefly, instead of Claude reading the whole page. Load BEFORE fetching a page that way.
---

# Web digest: one page, one question, a short answer

**Opt-in only, never part of a default install.** It needs two things on this machine: Obscura (the headless browser the kit can fetch with `install-kit install --external obscura`) and the free router running with its key in `~/.ai-dev-kit/.env`. Without either it says "skip" and Claude's own WebFetch does the job as usual.

## First run (a person typing, no experience needed)
1. Check what is ready: `node <skill-root>/web-digest/cli.js check`. It prints three lines: Obscura found or not, router key set or missing, router address.
2. Ask a question about one page: `node <skill-root>/web-digest/cli.js https://example.com "What is this page for?"`.
3. You get one line of JSON with a `result` field: the short answer. A line starting with `skip:` says why nothing was fetched (private address, Obscura missing, router down, empty page). Nothing is broken; Claude's own tool covers it.

## The tool
`node <skill-root>/web-digest/cli.js <url> <question...>` or `check`. Plain Node, no dependencies. Order of work, code first: public-URL check (loopback, private ranges, `.local` and bare hosts are refused), `obscura fetch <url> --dump text`, a code trim (blank lines, repeats, 24,000 character cap), then ONE router call (model `auto`, 120 words at most). Exit code 2 means "not done, let Claude's own tool run". A key is read, never printed.

## The mod (optional, makes it automatic)
`install-kit mods --root <project> --web-digest on` installs the `web-digest` mod at project scope. It answers a WebFetch call with this script's digest and falls through to Claude's own WebFetch on any failure, for a private URL, or for a read-on request (`offset`). `--web-digest off` removes it. The mod does nothing without this skill installed.

## Rules
- **Short answers only.** The router sees up to 24,000 characters of text and returns 120 words. For a full read of a long page, or a login page, use Claude's own fetch or the browser.
- **Never the stealth build.** Obscura is the default build only; the kit never uses its fingerprint-hiding options and never points this at a site that blocks bots.
- **Public pages only.** Anything on a private network stays with Claude's tool.
- **Measured, not assumed.** In the kit's own A/B (Haiku, three real pages, two runs each) total cost fell 33% with the mod and answers stayed correct 6 of 6; the saving comes from long pages (Wikipedia -55%), short pages are about equal, and wall time rose (about 26 s per question against 15 s). See `findings/2026-11-27-web-digest.md`.

## Credit
Obscura is by h4ckf0r0day (Apache-2.0); the kit fetches it at install time and never bundles it. See `CREDITS.md`.
