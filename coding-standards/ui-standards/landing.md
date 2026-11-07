# UI Standards — Landing and Marketing Pages

Read when: adding a public product, marketing, pricing or sign-up page. Look and tone: `design-standards.md`.

Detail in `ui-standards/landing.ref.md`: layout, type, navigation, cms-ready content. Read it only when the task covers one of these.

## Structure and content

- **UI-LND-11** Section order: sticky header (logo, up to 6 anchor links, Sign in, primary CTA), 1 Hero (required), 2 Trust (client logos, real only), 3 Features (required), 4 How it works, 5 Product tour, 6 Integrations, 7 Proof (customer story with a measurable result, real only), 8 Pricing, 9 FAQ, 10 Final CTA (required), 11 Contact (required), footer (required). Optional sections never change position.
- **UI-LND-12** The hero has an optional eyebrow (at most 6 words), exactly one `<h1>` stating the outcome (at most 10 words), a lead (at most 35 words), a primary and an optional secondary CTA, an optional note (at most 10 words), and a real product visual. On a 390 × 844 phone the h1, lead and primary CTA are visible without scrolling.
- **UI-LND-01** One primary action per page with one label ("Book a demo") used in the header, hero, final CTA band and form submit. The secondary hero action is a scroll link ("See how it works") styled as a secondary button. Other CTAs are links or secondary buttons.
- **UI-LND-13** Feature cards: 3 to 6, each with a 40 px icon tile, a title (at most 5 words) and 1 to 2 lines about an outcome. "How it works" has exactly 3 numbered steps, each a title and one sentence.
- **UI-LND-14** Product visuals are real screenshots or faithful UI renders with realistic, non-personal sample data, in a card with 12 px radius, each with a descriptive `alt` or `role="img"` and label. No stock photos of people to represent the product.
- **UI-LND-15** Client logos, testimonials, names, ratings and result numbers are real and approved for publication. Until supplied, show a placeholder ("[Customer quote — supplied by marketing]") in drafts and hide the section in production. Never invent logos, quotes, numbers or prices.
- **UI-LND-09** Pricing shows 2 to 4 plans, each with name, one-line audience, price with currency and unit ("/ user / month") or "Custom", whether tax is included, 3 to 6 included items with check icons and a CTA. At most one plan is "Recommended" (2 px primary border and a label). Prices come from one config and are identical on the page and at checkout.


## Lead form and spam

- **UI-LND-20** The contact form has at most 5 fields (Full name*, Work email*, Company*, Phone optional, Message optional), follows `forms.md` (labels above, errors under, 16 px inputs), ends with "By submitting, you agree to our Privacy policy. We only use your details to arrange the demo.", and on success replaces itself with "Thanks, <first name>. We'll be in touch." and the reply time.
- **UI-LND-05** A public form layers: a visible non-puzzle human check (default self-hosted ALTCHA proof-of-work; alternative Cloudflare Turnstile) shown as an "I'm human" checkbox that becomes "Verified"; a hidden honeypot and a minimum fill time; server-side verification of the token on every submission; rate limiting per IP. Never an image-puzzle CAPTCHA, and never a client-only check. Missing check on submit: "Tick the box to confirm you're human, then submit again."
- **UI-LND-21** Validate and escape submissions on the server, use CSRF where cookies are used, store only the listed fields, and never echo user input into emails or pages unescaped.


## SEO, performance, privacy, security

- **UI-LND-08** Each page has `<html lang>`, a unique `<title>` of 50 to 60 characters, a meta description of 140 to 160, exactly one `<h1>` with h2 per section and no skipped levels, a canonical link, Open Graph and Twitter tags with a 1200 × 630 share image, JSON-LD `Organization` (plus `SoftwareApplication` and `FAQPage` when present), `sitemap.xml`, `robots.txt`, and a real 404 page. Text is HTML text, never baked into images. (check: seo-01)
- **UI-LND-07** Budget on a mid-range phone over 4G: LCP under 2.5 s, INP under 200 ms, CLS under 0.1, total transfer 1.5 MB or less, JavaScript 150 KB gzipped or less, hero image 200 KB or less (WebP or AVIF, eager, `fetchpriority="high"`), all other images lazy, at most 2 self-hosted font weights preloaded. Lighthouse Performance, Accessibility, Best Practices and SEO each score 90 or more in CI (`performance-standards.md`).
- **UI-LND-03** Load analytics and advertising tags only after consent where the law requires it. Default off, remember the choice, and let the user reopen settings from the footer ("Cookie settings"). Cookie-less privacy-friendly analytics may run without consent where the law allows.
- **UI-LND-04** The consent banner is non-blocking (bottom corner on desktop, bottom sheet on phones), never covers a focused element, offers "Reject" and "Accept" with equal prominence, and links "Cookie settings".
- **UI-LND-10** The footer holds the company legal name and city, Privacy policy, Terms, Cookie settings and © year; contact details appear in the footer or contact section.
- **UI-LND-06** Serve HTTPS with HSTS, a Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `frame-ancestors 'none'`. Third-party scripts are limited to the spam check and consented analytics, loaded with SRI where possible.
- **UI-LND-22** Keep a skip link, 4.5:1 contrast including text over images or gradients, descriptive link text ("See pricing", not "Click here"), captions for videos, the FAQ as an accessible accordion, and visible focus on every link and button.
- **UI-LND-23** On a mid-range phone over 4G: LCP under 2.5 s, INP under 200 ms, CLS under 0.1; total transfer at most 1.5 MB, JavaScript at most 150 KB gzipped, hero image at most 200 KB (WebP or AVIF, eager, `fetchpriority="high"`), all other images lazy, at most 2 self-hosted font weights preloaded. Lighthouse Performance, Accessibility, Best Practices and SEO each score 90 or more in CI.
