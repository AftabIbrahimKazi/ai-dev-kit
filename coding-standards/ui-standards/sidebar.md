# UI Standards — Sidebar, Menu Search and Pinned Pages

Read when: adding or changing the sidebar, its collapse and rail mode, the navigation config, menu search, pinned pages or sign out placement. Groups, flyouts and active cues: `nav.md`.

Detail in `ui-standards/sidebar.ref.md`: navigation config, menu search, pinned pages. Read it only when the task covers one of these.

## Layout

- **UI-SBR-01** At 992 px and up the sidebar runs the full viewport height at the start edge, with one `<nav aria-label="Main">`. Below 992 px it does not render; its content is the drawer (`nav.md`).
- **UI-SBR-02** Zones top to bottom: logo row, menu search, Pinned, main navigation, footer (collapse toggle, divider, Sign out). Logo row, search and footer stay fixed; Pinned and navigation scroll together.
- **UI-SBR-03** Width is 260 px expanded or 72 px rail. No other width and no drag resize.
- **UI-SBR-04** Rows are 40 px high (44 px on coarse pointers), 8 px outer margin, 12 px inner padding, a 20 px icon, 12 px gap, label 14 px weight 500.
- **UI-SBR-05** The sidebar scrolls independently. On load the active item scrolls into view (`block: nearest`) and scroll position persists across navigation. The scroll container has 4 px inline padding and `scroll-padding-block: 8px` so a focus ring is never clipped.
- **UI-SBR-06** The logo row is exactly header height with a 1 px bottom border aligned with the header's. Expanded it shows the full logo; rail shows the 32 × 32 px logomark, still a link to home with the same `alt`.
- **UI-SBR-07** The footer holds exactly two controls, separated by a 1 px divider: the collapse toggle, then Sign out. The toggle has `aria-controls` and `aria-expanded`; in rail mode it is icon-only with the name and tooltip "Expand sidebar".
- **UI-SBR-08** Sign out is a `<button>` in a POST form with a CSRF token, with a log-out icon and "Sign out" (icon-only with name and tooltip in rail mode). It uses the normal nav colour, not danger, stays visible while the list scrolls, and asks no confirmation. An unsaved-changes guard still applies.
- **UI-SBR-09** With no saved choice the sidebar starts expanded at 1200 px and up and in rail mode at 992–1199 px. After the user toggles it, store the choice server-side per user and render it server-side so the layout never shifts on load.
- **UI-SBR-10** Collapse pushes the content area; the sidebar never overlays content. Width change is instant; labels may fade over 100 ms, none under reduced motion.
- **UI-SBR-11** Rail mode: icons only with tooltips, section headings become 1 px dividers, search becomes an icon button, Pinned becomes one pin icon button, groups open flyouts, count badges sit on the icon's top-end corner.
- **UI-SBR-12** Section headings: at most 4 (Pinned excluded), non-interactive, sentence case, 12 px weight 600 muted, built as `role="group"` with `aria-labelledby` on a `<span>`, not an `<h2>`.
- **UI-SBR-13** A count badge appears only for items the user must act on (assigned, unread, pending approval), never for totals. It shows 1 to 99 or `99+`, hides at 0, and the item's accessible name includes the count and meaning ("Tickets, 12 assigned to you").
- **UI-SBR-14** An item may carry one tag, only "New" or "Beta". "New" disappears 30 days after release (`tagUntil`).
- **UI-SBR-15** An external link shows a 16 px external-link icon, appends "(opens in new tab)" to its name, and uses `target="_blank" rel="noopener noreferrer"`.
- **UI-SBR-16** Dashboard is first, Settings or Administration last. Labels are 1 to 3 words, nouns, sentence case. Top-level icons are unique. At most 10 top-level entries; more go into groups or section headings.
- **UI-SBR-17** The sidebar uses its own surface token with a 1 px end border; dark theme has no shadow. A tenant accent appears only through the active nav tokens.
- **UI-SBR-18** Below 992 CSS px for any reason, including 200% zoom on a 1280 px screen, the drawer layout applies and the page never scrolls sideways.
- **UI-SBR-19** Focus order: skip link, sidebar (logo, search, Pinned, navigation, collapse toggle, Sign out), header, `main`.
- **UI-SBR-20** Every control hovers to the nav hover background with a pointer cursor, using CSS `:hover` only. Active rows keep their active cues on hover.
