# SEO Standards

These rules apply to every page and component across all projects. SEO is not a post-launch concern — it is built in from the start.

---

## Document Structure

---

## RULE SEO-01 — Every page has a unique, descriptive title

Every page must have a `<title>` tag. The title must be unique across the site and accurately describe the page content.

- 50–60 characters maximum
- Most important keyword near the front
- No keyword stuffing

```html
<!-- Wrong -->
<title>Home</title>
<title>Page</title>

<!-- Right -->
<title>Solar System Explorer — Exo Space</title>
```

---

## RULE SEO-02 — Every page has a unique meta description

Every page must have a `<meta name="description">` tag with a unique, human-readable summary of the page content.

- 120–155 characters
- Describes the page accurately — not a keyword list
- Unique per page — never duplicated across pages

```html
<meta name="description" content="Explore the planets of our solar system through an interactive 3D experience built for curious minds.">
```

---

## RULE SEO-03 — One h1 per page, matching the page topic

Every page must have exactly one `<h1>` that clearly describes the primary subject of the page. The `<h1>` content should relate to the page title.

---

## RULE SEO-04 — Heading hierarchy is sequential and meaningful

Headings (`h1` → `h6`) must not skip levels. Headings are used to structure content — not to achieve a visual size. Font size is controlled by CSS.

```html
<!-- Wrong — skipped level, headings used for size -->
<h1>Page Title</h1>
<h4>Section</h4>

<!-- Right -->
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Sub-section</h3>
```

---

## RULE SEO-05 — All images have descriptive alt text

Every `<img>` must have an `alt` attribute. Decorative images use `alt=""`. All content images must have a meaningful description that conveys the image's purpose to a search engine and screen reader.

```html
<!-- Wrong -->
<img src="jupiter.jpg">
<img src="jupiter.jpg" alt="image">

<!-- Right -->
<img src="jupiter.jpg" alt="Jupiter showing the Great Red Spot storm system">

<!-- Right — decorative -->
<img src="divider.svg" alt="">
```

---

## RULE SEO-06 — Canonical URL is declared on every page

Every page must declare a canonical URL to prevent duplicate content issues.

```html
<link rel="canonical" href="https://example.com/page-url">
```

---

## RULE SEO-07 — Open Graph and social meta tags are present

Every public-facing page must include Open Graph meta tags for correct social sharing previews.

Required tags:

```html
<meta property="og:title"       content="Page Title">
<meta property="og:description" content="Page description">
<meta property="og:image"       content="https://example.com/og-image.jpg">
<meta property="og:url"         content="https://example.com/page-url">
<meta property="og:type"        content="website">
```

---

## RULE SEO-08 — Semantic HTML is used throughout

Content must use the correct semantic HTML elements. Search engines use element semantics to understand page structure and content type.

```html
<!-- Wrong — generic containers for everything -->
<div class="header">
  <div class="nav">...</div>
</div>
<div class="article">...</div>

<!-- Right -->
<header>
  <nav>...</nav>
</header>
<article>...</article>
```

---

## RULE SEO-09 — URLs are human-readable and descriptive

Page URLs must be lowercase, hyphen-separated, and descriptive. No query strings, no IDs, no auto-generated slugs in public URLs.

```
# Wrong
/page?id=42
/p/a/g/e
/Page_Title

# Right
/solar-system
/planets/jupiter
/about
```

---

## RULE SEO-10 — Content images are in img tags, not background-image

Search engines index `<img>` tags and their `alt` text. CSS `background-image` is invisible to crawlers. All content images must use `<img>`.

---

## RULE SEO-11 — Pages are indexable unless explicitly excluded

Pages must not set `noindex` unless there is a deliberate reason (duplicate content, private pages, thank-you pages). Every public page is indexable by default.

```html
<!-- Only use when intentional -->
<meta name="robots" content="noindex, nofollow">
```

---

## RULE SEO-12 — Structured data is added where applicable

Pages that display content matching a Schema.org type (Article, Product, FAQ, BreadcrumbList, etc.) must include the appropriate JSON-LD structured data block in the `<head>`.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Jupiter — Exo Space",
  "description": "Explore Jupiter in an interactive 3D environment."
}
</script>
```
