# QA — Security Checks

Read [index.md](index.md) first.

---

## RULE QA-SEC-01 — No user input is rendered as HTML without sanitisation

Any value that originates from user input, a URL parameter, localStorage, an
API response, or any external source must never be inserted into the DOM via
`innerHTML`, `outerHTML`, `document.write`, or `insertAdjacentHTML` without
sanitisation. This prevents XSS attacks.

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

## RULE QA-SEC-02 — No secrets or credentials in source code

API keys, tokens, passwords, private URLs, and any other credentials must
never appear in source code, HTML, JavaScript, CSS, or any committed file.
They belong in environment variables only and must be listed in `.gitignore`.

If Claude encounters a secret in the code it must flag it immediately and
block the task until it is removed.

---

## RULE QA-SEC-03 — No use of eval() or Function()

`eval()`, `new Function()`, and `setTimeout`/`setInterval` with string
arguments are banned. They execute arbitrary code and create XSS vectors.

```js
// Wrong
eval(userCode);
new Function('return ' + expression)();
setTimeout('doSomething()', 1000);

// Right
setTimeout(doSomething, 1000);
```

---

## RULE QA-SEC-04 — innerHTML is never used for dynamic content

`innerHTML` must not be used to insert dynamic content. Use `textContent` for
text, or create elements programmatically with `createElement` and
`appendChild`.

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

## RULE QA-SEC-05 — No sensitive data in localStorage or sessionStorage

Sensitive data (tokens, user IDs, personal information, session data) must
not be stored in `localStorage` or `sessionStorage`. These are accessible to
any JavaScript on the page and to XSS attacks. Use secure, httpOnly cookies
via the server for sensitive session data.

---

## RULE QA-SEC-06 — All external URLs are validated before use

Any URL constructed from user input, URL parameters, or external data must be
validated before use in `fetch`, `XMLHttpRequest`, `src`, `href`, or `action`
attributes. Open redirect and SSRF vulnerabilities must be prevented.

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

## RULE QA-SEC-07 — Third-party scripts are loaded from trusted sources only

No third-party script may be loaded from an unverified or user-controlled
URL. All external scripts must use Subresource Integrity (SRI) hashes where
possible.

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

## RULE QA-SEC-08 — No prototype pollution vectors

Code must not merge or assign untrusted objects onto existing objects in
ways that could pollute the prototype chain. Avoid `Object.assign`, spread
operators, or deep merge functions on untrusted input without validation.

```js
// Wrong — untrusted input merged onto config
Object.assign(config, userSuppliedObject);

// Right — validate and whitelist known keys only
const safeConfig = {
  theme: ALLOWED_THEMES.includes(userInput.theme) ? userInput.theme : 'light',
};
```

---

## RULE QA-SEC-09 — Content Security Policy is respected

All dynamically injected content, scripts, and styles must be compatible
with the project's Content Security Policy. No `unsafe-inline` or
`unsafe-eval` may be introduced. If a change requires relaxing the CSP, it
must be flagged for developer review before proceeding.

---

## RULE QA-SEC-10 — Sensitive operations are not exposed in client-side code

Authentication logic, authorisation checks, payment processing, and any
security-critical operation must never be implemented in client-side
JavaScript. Client-side code is fully visible to the user — it must only
handle UI concerns.

---

## RULE QA-SEC-11 — Dependency vulnerabilities are flagged before use

Before integrating any new npm package Claude must flag:
- Whether the package has known published vulnerabilities
- Whether the package injects styles or scripts that violate coding standards
- Whether the package accesses sensitive browser APIs (clipboard, camera,
  geolocation, etc.) beyond its stated purpose

The developer decides whether to proceed. This is flagged — not blocked
automatically.

---

## RULE QA-SEC-12 — No clickjacking exposure

Pages must include an `X-Frame-Options` or `frame-ancestors` CSP directive to
prevent the page being embedded in an iframe on a malicious site.

```html
<!-- Via meta tag where headers are not available -->
<meta http-equiv="X-Frame-Options" content="DENY">
```

---

## RULE QA-SEC-13 — Form inputs are validated on both sides

All form input validation that exists on the client side must be treated as
a UX convenience only — never as a security control. Claude must flag any
form that relies solely on client-side validation for security-critical
fields.
