# UI Standards — Navigation

Read when: adding navigation of any kind: menus, groups, breadcrumb, active states, flyouts, dropdowns, the mobile drawer. Header: `header.md`. Sidebar, menu search, pinned: `sidebar.md`. Page title and actions: `page-header.md`.

Detail in `ui-standards/nav.ref.md`: rail flyout, horizontal dropdowns (header nav, landing), mobile drawer, phone action menus. Read it only when the task covers one of these.

## Structure

- **UI-NAV-01** Navigation sits in `<nav aria-label>`. Each page has exactly one `<h1>`. (check: seo-03)
- **UI-NAV-02** The current page has `aria-current="page"` and a cue that is not colour alone. The parent section is marked too.
- **UI-NAV-03** Navigation has at most 2 levels (section, page). A third level is section tabs on the destination page. Mobile bottom navigation has 1 level with 3 to 5 destinations.
- **UI-NAV-05** The page title and page actions sit in the page header, not the app header (`page-header.md`).
- **UI-NAV-08** Each page has a unique browser tab title: "Page — Product". (check: seo-01)
- **UI-NAV-09** After a client-side route change, move focus to the page `<h1>` (`tabindex="-1"`) and update `document.title`. A full page load keeps the browser default. (browser)


## Breadcrumb

- **UI-NAV-04** A page 2 or more levels deep has a breadcrumb as the first part of the page header; depth 0 and 1 have none. It is `<nav aria-label="Breadcrumb">` with an `<ol>`, one `<li>` per crumb. Every crumb but the last is a link; the last is plain text with `aria-current="page"`. Separators are decorative (`aria-hidden` or CSS) and mirror in RTL. Overlays (modal, drawer, sheet, popover) have none.
- **UI-NAV-10** One shared breadcrumb component builds the trail from the navigation config plus route parameters. The first crumb is the home item ("Dashboard"). Pages never hand-write breadcrumb markup.
- **UI-NAV-11** Module and page crumbs use nav labels; a record crumb uses its identifier (`LT-0042`), not the display name. A crumb over 24 characters truncates with an ellipsis, with the full text as tooltip and accessible name.
- **UI-NAV-12** More than 4 crumbs show the first, a "…" menu button (name "Show hidden levels") listing the hidden crumbs as links, and the last 2.
- **UI-NAV-13** Below 768 px replace the breadcrumb with one back link to the immediate parent: chevron and parent label, 44 × 44 px target, name "Back to <parent>". It links to the parent URL; it does not call `history.back()`.
- **UI-NAV-14** A nav group that only toggles appears in the trail as a link to its "Overview" page if one exists, otherwise as plain text.
- **UI-NAV-15** Crumbs are 14 px; links secondary colour, underline on hover and focus; current crumb primary weight 500; separators muted; each link has a hit area of at least 24 × 24 px.


## Active and hover state

- **UI-NAV-20** The item for the current route has `aria-current="page"` and all three cues together: a neutral active pill background, a semibold label in the active text colour, and a 3 px indicator bar in the indicator colour at the start edge (vertical) or bottom edge (horizontal and bottom nav). The active icon takes the indicator colour. Values come from the theme generator.
- **UI-NAV-21** Active label contrast is at least 4.5:1 against the active background; the bar and active icon at least 3:1 against the menu background, in both modes and every menu style.
- **UI-NAV-22** An ancestor of the current route shows an active state too; only an exact match has `aria-current="page"`.
- **UI-NAV-23** Hover changes only the background. It never shows the bar or the active text colour. Focus-visible shows the standard ring on top of any state.
- **UI-NAV-24** In the 72 px rail the active item keeps its background and bar; each icon has an accessible name and a tooltip on hover and focus.


## Groups and submenus

- **UI-NAV-30** A group is a `<button aria-expanded aria-controls>` followed by a `<ul>` of links.
- **UI-NAV-31** A group parent only expands or collapses. A section landing page is the group's first child, labelled "Overview".
- **UI-NAV-32** Parent row: 20 px icon, label, 16 px end chevron (down collapsed, rotated 180° expanded, 150 ms, instant under reduced motion). Child rows: no icon, label aligned with the parent's label. Rows 40 px, 44 px coarse.
- **UI-NAV-33** On load the group holding the current route is expanded; other groups restore the user's last state, stored per device. Several groups may be open. Toggling moves no focus and navigates nowhere.
- **UI-NAV-34** The exact child gets the three cues and `aria-current="page"`. While its group is expanded the parent shows only the active text colour. While the group is collapsed, or in rail mode, the parent shows all three cues and `aria-current="true"`.
- **UI-NAV-35** Children the user cannot access do not render (filtered on the server). A group with 0 visible children does not render. A group with exactly 1 visible child renders as a direct link with the child's route and the parent's icon and label.
- **UI-NAV-36** SHOULD: a group holds 2 to 8 children; more are split or moved to tabs or filters.
- **UI-NAV-37** Nav labels wrap to at most 2 lines, then truncate with an ellipsis. The full label is the accessible name and shows in a tooltip on hover and focus.
- **UI-NAV-07** A collapsed sidebar keeps every item's accessible name. Its flyouts work by keyboard. Its state persists per user.
