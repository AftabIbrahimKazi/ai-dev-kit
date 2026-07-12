# HTML Standards — Page Files

**Role:** A page file represents a single routable URL. It composes components and layout templates to build the page. It does not define document-level structure (that belongs in the layout template).

Read [html-standards.md](../html-standards.md) first for global rules. Rules below are specific to page files only.

---

## RULE P-01 — Page files compose, they do not style

A page file assembles components and passes content into slots. It must not contain raw CSS or inline styles. All styling is handled by components and their CSS files.

---

## RULE P-02 — Page files must use a layout template

Every page file must wrap its content in a layout template. No page file may define its own `<html>`, `<head>`, or `<body>` elements.

---

## RULE P-03 — Page-level scripts are imported, not inlined

Script logic must live in dedicated script files. A page file may import those scripts but must not contain business logic inline.

---

## RULE P-04 — One page, one primary heading

Every page must contain exactly one `<h1>` that describes the page's primary subject.
