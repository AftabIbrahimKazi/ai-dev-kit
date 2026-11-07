# UI Standards — Page Header

Read when: adding or changing the title block of a page inside the app shell: title, status badge, description, metadata, page actions, section tabs.

- **UI-PGH-01** Every page in the app shell starts `<main>` with a page header. Auth, error and print layouts are excluded.
- **UI-PGH-02** Parts in order: breadcrumb (back link on phones), title row (title, status badge, actions), description, metadata, section tabs. An absent part leaves no gap.
- **UI-PGH-03** One `<h1>`, inside the page header, 24 px on a 32 px line, weight 600. Its text follows the page type:

| Page type | `<h1>` | Example |
|---|---|---|
| List | plural entity name, equal to the nav label | `Laptops` |
| Detail | record identifier · display name | `LT-0042 · Dell Latitude 7440` |
| Create | "New" + singular entity | `New laptop` |
| Edit | "Edit" + record identifier | `Edit LT-0042` |
| Dashboard | nav label | `Dashboard` |
| Settings | nav label or section name | `Notification settings` |

- **UI-PGH-04** A long title wraps to at most 2 lines, then truncates with an ellipsis (`line-clamp: 2`). The full text stays in the DOM and shows in a tooltip on hover and focus.
- **UI-PGH-05** `<title>` is "<h1 text> – <Product>", unique per page, updated on client-side navigation.
- **UI-PGH-06** Only detail pages may show one status badge, right after the title. It contains text, never colour alone.
- **UI-PGH-07** A description is optional: one sentence, at most 120 characters, secondary colour, at most one "Learn more" link.
- **UI-PGH-08** A metadata line is optional and only on detail pages: at most 3 items separated by " · ", caption size, muted. A relative time uses `<time datetime>` with the absolute date and time in a tooltip.
- **UI-PGH-09** The title row has at most 1 primary and 2 secondary actions. More go into a "More" menu button (⋯, name "More actions"). Order start to end: secondary, secondary, More, primary. The primary is always last.
- **UI-PGH-10** Destructive actions (Delete, Archive, Revoke) live only in More, in the danger text colour, and ask confirmation. They are never the primary or a visible secondary action.
- **UI-PGH-11** Action labels are verb + noun in sentence case ("New laptop", "Export CSV"). Only More may be icon-only. A leading icon is allowed but the text stays.
- **UI-PGH-12** The primary action by page type: List "New <entity>" if the user may create; Detail "Edit" if the user may edit; Create and Edit none (Save and Cancel live in the form's action bar); Dashboard none; Settings none (each section has its own Save).
- **UI-PGH-13** Render only the actions the user may perform, decided on the server. A read-only role sees no Edit, Delete or New. If all are hidden the row shows only the title and status.
- **UI-PGH-14** The page header scrolls with the content. It is never sticky.
- **UI-PGH-15** It has no background, border, card, shadow or coloured band; it sits on the page surface. Spacing: breadcrumb to title 8 px, title to description 4 px, description to metadata 4 px, title block to tabs 16 px, header to content 24 px. `<main>` padding is 24/32 px at 992 px and up, 24 px at 768–991 px, 16 px below.
- **UI-PGH-16** Section tabs (the third navigation level) are a `<nav aria-label="<h1> sections">` of links, each with its own URL, the current one `aria-current="page"` with a text colour and 3 px bottom indicator. They never wrap; overflow scrolls sideways with the active tab in view. At most 7. Panel switching without a URL change uses the Tabs component.
- **UI-PGH-17** Below 768 px the breadcrumb becomes a back link; title, status, description and metadata stack full width; the primary action becomes a full-width 44 px button under the title block with More beside it; secondary actions move into More (bottom sheet). At 768 px and up, when the title (minimum 240 px) and actions do not fit, secondary actions move into More one by one from the start side. The primary never moves.
- **UI-PGH-18** Title uses primary text, description secondary, metadata muted, in both themes.
- **UI-PGH-19** After a client-side route change move focus to the `<h1>` (`tabindex="-1"`) and update `document.title`. A full page load keeps the browser default. (browser)
- **UI-PGH-20** A detail page may show one metadata line under the title: at most 3 items separated by " · ", caption size, muted colour. Relative times use `<time datetime>` with the absolute date and time in a tooltip.
