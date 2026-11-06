# UI Standards — Sidebar, Menu Search and Pinned Pages (reference)

Read when: the task covers navigation config, menu search, pinned pages. The everyday rules are in `ui-standards/sidebar.md`.

## Navigation config

- **UI-SBR-21** One config drives the sidebar, drawer, breadcrumb and menu search. Each item has a stable `key` (dot path such as `assets.laptops`), `label` (translation key), `route`, `permission`, and for top-level items an `icon`. It may have `keywords[]`, `badge` (source and meaning), `tag`, `tagUntil`, `external`, and `pinnable` (default true for leaf links).
- **UI-SBR-22** Permissions prune the config on the server. Hidden items never reach the client.


## Menu search

- **UI-SBR-30** A menu search field sits at the top of the sidebar and of the drawer, below the logo row: `<input type="search">` in a `role="search"` wrapper, label and placeholder "Find in menu", leading search icon, 36 px high (44 px coarse). It shows no `Ctrl K` hint.
- **UI-SBR-31** It filters only the rendered, permission-pruned items, client-side with no request. It never searches records.
- **UI-SBR-32** Matching is case- and accent-insensitive substring against the item label, the parent group label and `keywords`. Results keep navigation order. A match on a group label shows all its children.
- **UI-SBR-33** While the query is non-empty, non-matching items and empty headings hide, groups with matches expand temporarily without changing saved state, Pinned hides, and matched text is wrapped in `<mark>` (weight 600, underline, highlight background).
- **UI-SBR-34** Update on every keystroke within 50 ms, no debounce. A polite live region announces the count ("4 results") 500 ms after typing stops.
- **UI-SBR-35** Keys: ArrowDown moves to the first result, Enter opens it, Escape clears a non-empty query and keeps focus in the field.
- **UI-SBR-36** No match shows "No pages match “{query}”." and a "Search everywhere" button that opens the command palette with the query filled in.
- **UI-SBR-37** In rail mode the field is an icon button named "Find in menu". Activating it expands the sidebar, saves that choice, and focuses the field.
- **UI-SBR-38** Clear the query on navigation and when the drawer closes.


## Pinned pages

- **UI-SBR-40** Only leaf links with `pinnable: true` can be pinned; groups and external links cannot. At most 7 pins per user per tenant.
- **UI-SBR-41** Store pins server-side per user, tenant and product, as item `key`s, never URLs, and sync them across devices. Validate every key against the user's permitted navigation on save and render. A key the user can no longer reach is hidden but kept.
- **UI-SBR-42** The Pinned section sits between menu search and navigation, headed "Pinned" with a "Manage" text button at the end. Items follow the user's order and show icon, label, and for grouped items the parent label muted ("Laptops · Assets"). A 1 px divider separates it from the navigation.
- **UI-SBR-43** With 0 pins it still shows the heading, Manage, and "Pin pages you use often."
- **UI-SBR-44** On fine pointers each pinnable row shows a 28 × 28 px pin toggle on hover with `aria-pressed` and the name "Pin <label>" / "Unpin <label>". It has `tabindex="-1"` and never appears on coarse pointers; keyboard and touch pin through Manage.
- **UI-SBR-45** Manage opens a modal (full-screen below 768 px) titled "Pinned pages" with: the count ("3 of 7 pinned"); the pinned list with Move up, Move down and Unpin per row; all pinnable pages grouped as in the navigation with checkboxes. At 7 pins unchecked boxes are disabled with "Pin limit reached. Unpin a page to add another." Save applies, Cancel discards. Drag reorder may exist but is never the only way.
- **UI-SBR-46** In rail mode Pinned is one pin icon button named "Pinned, N pages" that opens a flyout with the pinned items and Manage.
- **UI-SBR-47** When the current page is pinned, both its Pinned row and its navigation row show the active cues; only the navigation row has `aria-current="page"`.
- **UI-SBR-48** At 7 pins, quick pin toggles on unpinned rows are `aria-disabled="true"` with the tooltip "Pin limit reached (7). Unpin a page first."
- **UI-SBR-49** Pinning updates the section at once and announces "<label> pinned" or "<label> unpinned" in a polite live region. No toast.
