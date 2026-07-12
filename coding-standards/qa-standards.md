# QA Standards

These standards define what must be verified before any work is considered done. QA is not a separate phase — it is part of every change. Claude is responsible for code-level QA. The developer is responsible for browser-level visual and interaction verification.

---

## Responsibilities

| Check | Responsible |
|---|---|
| Standards compliance | Claude |
| Logic errors and edge cases | Claude |
| Security vulnerabilities | Claude |
| State and data attribute coverage | Claude |
| Cross-file impact assessment | Claude |
| Accessibility and SEO compliance | Claude |
| Visual correctness in browser | Developer |
| Interaction feel and UX | Developer |
| Device and browser testing | Developer |

---

## RULE QA-01 — Definition of done

A task is only marked complete when all of the following are true:

- Code follows all active coding standards with no violations
- All affected states are handled (open, closed, disabled, loading, error, empty)
- No adjacent file or feature is broken by the change
- No security vulnerability is introduced
- No accessibility regression is introduced
- The developer has been informed of any decision made during implementation that requires their review

If any item is uncertain, Claude must flag it explicitly rather than marking the task done.

---

## RULE QA-02 — Claude performs a QA pass before reporting work complete

Before reporting any task as complete Claude must perform a self-directed QA pass covering:

1. Standards compliance check
2. Logic and error check
3. Security check
4. State coverage check
5. Cross-file impact check
6. Accessibility and SEO check

If issues are found during the pass, they must be fixed before the task is reported complete. If an issue cannot be fixed without developer input, it must be flagged with severity level before closing.

---

## Branch Promotion Gates

---

## RULE QA-03 — dev → test promotion checklist

Before code moves from `dev` to `test` the following must be verified:

- All coding standards are followed across every changed file
- No commented-out code, console.logs, or debug artifacts remain
- All data attribute states are defined and handled in CSS
- All event listeners have a corresponding cleanup path
- No hardcoded values that should be tokens
- No `!important` anywhere in changed CSS
- No inline styles anywhere in changed markup
- Version number has been bumped
- npm and GitHub versions are in sync
- Commit messages follow git standards

---

## RULE QA-04 — test → beta promotion checklist

Before code moves from `test` to `beta` the following must be verified:

- All items from the dev → test checklist pass
- Developer has completed browser visual check
- All interactive states work correctly in the browser
- No console errors in browser developer tools
- No network request failures
- Accessibility landmarks and heading structure are correct
- All images have alt text
- Page title and meta description are present and correct

---

## RULE QA-05 — beta → main promotion checklist

Before code moves from `beta` to `main` the following must be verified:

- All items from the test → beta checklist pass
- Full security check has been completed on all changed files
- No known vulnerabilities in any added or updated dependencies
- Performance check completed — no new render-blocking resources introduced
- Core Web Vitals targets are still met
- All package exceptions are documented with the standard comment block
- Owner has reviewed and approved the pull request

---

## Logic and Error Checks

---

## RULE QA-06 — All code paths must be traced

For every function and method Claude writes or modifies, all code paths must be traced:

- The happy path — correct input, expected output
- The error path — what happens when input is missing, null, wrong type, or out of range
- The edge path — empty arrays, zero values, maximum values, simultaneous state changes

Any path that leads to an unhandled state must be fixed.

---

## RULE QA-07 — All async operations have error handling

Every `async` function, `Promise`, `fetch`, or dynamic import must have explicit error handling. Silent failures are not acceptable.

---

## RULE QA-08 — All DOM queries are null-checked

Every `document.querySelector` and `getElementById` result must be checked for null before use. Assuming an element exists is not acceptable.

```js
// Wrong
const el = document.querySelector('#ex-modal-js');
el.dataset.state = 'open';

// Right
const el = document.querySelector('#ex-modal-js');
if (!el) return;
el.dataset.state = 'open';
```

---

## RULE QA-09 — State transitions are complete and non-destructive

For every data attribute that controls state, all possible values must be defined in CSS and all transitions between them must be accounted for. No transition may leave the element in an undefined visual state.

---

## Security Checks

---

## RULE QA-10 — No user input is rendered as HTML without sanitisation

Any value that originates from user input, a URL parameter, localStorage, an API response, or any external source must never be inserted into the DOM via `innerHTML`, `outerHTML`, `document.write`, or `insertAdjacentHTML` without sanitisation. This prevents XSS attacks.

```js
// Wrong — XSS vulnerability
element.innerHTML = userInput;
element.innerHTML = searchParams.get('query');

// Right — text content only, no HTML parsing
element.textContent = userInput;

// Right — if HTML is genuinely needed, sanitise first
element.innerHTML = DOMPurify.sanitize(userInput);
```

---

## RULE QA-11 — No secrets or credentials in source code

API keys, tokens, passwords, private URLs, and any other credentials must never appear in source code, HTML, JavaScript, CSS, or any committed file. They belong in environment variables only and must be listed in `.gitignore`.

If Claude encounters a secret in the code it must flag it immediately and block the task until it is removed.

---

## RULE QA-12 — No use of eval() or Function()

`eval()`, `new Function()`, and `setTimeout`/`setInterval` with string arguments are banned. They execute arbitrary code and create XSS vectors.

```js
// Wrong
eval(userCode);
new Function('return ' + expression)();
setTimeout('doSomething()', 1000);

// Right
setTimeout(doSomething, 1000);
```

---

## RULE QA-13 — innerHTML is never used for dynamic content

`innerHTML` must not be used to insert dynamic content. Use `textContent` for text, or create elements programmatically with `createElement` and `appendChild`.

```js
// Wrong
container.innerHTML = `<div class="ex-card">${title}</div>`;

// Right
const card = document.createElement('div');
card.className = 'ex-card';
const heading = document.createElement('h2');
heading.textContent = title;
card.appendChild(heading);
container.appendChild(card);
```

---

## RULE QA-14 — No sensitive data in localStorage or sessionStorage

Sensitive data (tokens, user IDs, personal information, session data) must not be stored in `localStorage` or `sessionStorage`. These are accessible to any JavaScript on the page and to XSS attacks. Use secure, httpOnly cookies via the server for sensitive session data.

---

## RULE QA-15 — All external URLs are validated before use

Any URL constructed from user input, URL parameters, or external data must be validated before use in `fetch`, `XMLHttpRequest`, `src`, `href`, or `action` attributes. Open redirect and SSRF vulnerabilities must be prevented.

```js
// Wrong — URL from user input used directly
const url = searchParams.get('redirect');
window.location.href = url;

// Right — validate against an allowed list
const ALLOWED_PATHS = ['/sol', '/mercury', '/venus'];
const path = searchParams.get('redirect');
if (ALLOWED_PATHS.includes(path)) {
  window.location.href = path;
}
```

---

## RULE QA-16 — Third-party scripts are loaded from trusted sources only

No third-party script may be loaded from an unverified or user-controlled URL. All external scripts must use Subresource Integrity (SRI) hashes where possible.

```html
<!-- Wrong — no integrity check -->
<script src="https://cdn.example.com/lib.js"></script>

<!-- Right — SRI hash verified -->
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-[hash]"
  crossorigin="anonymous">
</script>
```

---

## RULE QA-17 — No prototype pollution vectors

Code must not merge or assign untrusted objects onto existing objects in ways that could pollute the prototype chain. Avoid `Object.assign`, spread operators, or deep merge functions on untrusted input without validation.

```js
// Wrong — untrusted input merged onto config
Object.assign(config, userSuppliedObject);

// Right — validate and whitelist known keys only
const safeConfig = {
  theme: ALLOWED_THEMES.includes(userInput.theme) ? userInput.theme : 'light',
};
```

---

## RULE QA-18 — Content Security Policy is respected

All dynamically injected content, scripts, and styles must be compatible with the project's Content Security Policy. No `unsafe-inline` or `unsafe-eval` may be introduced. If a change requires relaxing the CSP, it must be flagged for developer review before proceeding.

---

## RULE QA-19 — Sensitive operations are not exposed in client-side code

Authentication logic, authorisation checks, payment processing, and any security-critical operation must never be implemented in client-side JavaScript. Client-side code is fully visible to the user — it must only handle UI concerns.

---

## RULE QA-20 — Dependency vulnerabilities are flagged before use

Before integrating any new npm package Claude must flag:
- Whether the package has known published vulnerabilities
- Whether the package injects styles or scripts that violate coding standards
- Whether the package accesses sensitive browser APIs (clipboard, camera, geolocation, etc.) beyond its stated purpose

The developer decides whether to proceed. This is flagged — not blocked automatically.

---

## RULE QA-21 — No clickjacking exposure

Pages must include an `X-Frame-Options` or `frame-ancestors` CSP directive to prevent the page being embedded in an iframe on a malicious site.

```html
<!-- Via meta tag where headers are not available -->
<meta http-equiv="X-Frame-Options" content="DENY">
```

---

## RULE QA-22 — Form inputs are validated on both sides

All form input validation that exists on the client side must be treated as a UX convenience only — never as a security control. Claude must flag any form that relies solely on client-side validation for security-critical fields.

---

## Bug Reporting Format

---

## RULE QA-23 — Bugs are reported with a standard format

When Claude identifies a bug or security issue during a QA pass it must report it using this format:

```
[SEVERITY] — [short title]

File: [file path and line number if known]
Type: [logic error | security | standards violation | accessibility | performance]

What is wrong:
[clear description of the problem]

Impact:
[what breaks or what risk this creates]

Fix:
[what needs to change — or "developer decision required" if Claude cannot resolve it]
```

---

## RULE QA-24 — Severity levels

| Severity | Meaning | Action |
|---|---|---|
| `[CRITICAL]` | Security vulnerability or data loss risk | Block — must be fixed before any other work continues |
| `[HIGH]` | Broken functionality or significant standards violation | Fix before promoting to next branch |
| `[MEDIUM]` | Degraded behaviour, edge case failure, minor standards violation | Fix before beta |
| `[LOW]` | Code quality issue, naming inconsistency, missing comment | Fix before main |
| `[INFO]` | Observation with no immediate action required | Log for awareness |
