# Obscura fetch test (2026-11-27)

Scope: does the default (non-stealth) obscura v0.2.7 Windows build read pages cheaply and reliably? Fetched by the kit's own `install-kit.external.js fetch obscura` into a scratch home (`%TEMP%\obscura-scratch`), sha256 matched the pin, folder holds `obscura.exe`, `obscura-worker.exe` and two VC runtime DLLs. Command only, no server, no stealth options.

| Page | Kind | Raw HTML chars | `--dump text` chars, time | `--dump markdown` chars, time |
|---|---|---|---|---|
| example.com | static | 577 | 918, 0.14 s | 960, 0.12 s |
| en.wikipedia.org Headless_browser | static | 145,797 | 7,999, 5.4 s | 23,241, 3.6 s |
| nodejs.org/en/about | static | 304,223 | 4,439, 1.8 s | 8,236, 2.2 s |
| github.com repo page | JS-heavy | 468,437 | 22,383, 8.4 s | 46,395, 9.7 s |
| news.ycombinator.com | JS-heavy | 32,787 | 4,038, 2.4 s | 9,572, 2.5 s |

Result: 5 of 5 pages returned real content, exit 0.

- Text digests are 5% to 15% of raw HTML on big pages, a real size saving before any model sees them. Markdown keeps links and structure at 2 to 3 times the text size.
- Time is 1.7 to 9.7 s on real pages, not the README's self-reported 85 ms: that figure holds for tiny pages only (example.com 0.12 s). Each call includes page load and JS.
- GitHub's text starts with page chrome ("Skip to content You signed in with another tab...") so a rule-based strip is still needed before the digest reaches a model.

Not measured (so no verdict yet on these):
- token cost against Claude's WebSearch or the built-in browser (no scriptable way to count those from here);
- agreement with Playwright on pass/fail checks (Playwright is not installed here), speed, flake rate;
- login-gated and heavily client-rendered pages.

Next: wire the digest step (strip chrome, size cap, cache the full text outside the context) and run the fixed-query comparison when the web-search mod exists. Until then obscura stays an opt-in external, default off.
