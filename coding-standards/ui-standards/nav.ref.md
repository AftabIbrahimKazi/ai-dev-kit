# UI Standards — Navigation (reference)

Read when: the task covers rail flyout, horizontal dropdowns (header nav, landing), mobile drawer, phone action menus. The everyday rules are in `ui-standards/nav.md`.

## Rail flyout

- **UI-NAV-40** In the rail, activating a group icon opens a flyout at the rail's end with a non-interactive group heading and the child links. Click, Enter and Space open it; hover may open it after a 150 ms intent delay.
- **UI-NAV-41** The flyout stays open while the pointer is over the trigger or panel and closes 300 ms after it leaves both. Escape (focus returns to the trigger), outside click and link activation close it at once. The gap between rail and panel is 4 px or less, or bridged by an invisible hover area.
- **UI-NAV-42** The panel aligns its top with the trigger and flips upward on overflow; it is 220 to 280 px wide, with max height viewport minus header minus 16 px and internal scroll, at the dropdown layer.


## Horizontal dropdowns (header nav, landing)

- **UI-NAV-50** Admin dropdowns open only on click, Enter or Space; hover never opens them. Landing at 992 px and up may open on hover after 150 ms and close 300 ms after leaving, and click also toggles. On touch the first tap opens and does not navigate.
- **UI-NAV-51** One dropdown is open per bar; opening another closes the first. Escape closes and returns focus to the trigger. Outside click, route change and Tab past the last link also close it.
- **UI-NAV-52** The panel opens 4 px below its trigger, aligned to the start edge, flipping to the end edge on overflow; min width is the trigger width, max 320 px. A landing mega-menu may reach container width in columns, still 2 levels.
- **UI-NAV-53** Below 992 px horizontal navigation moves into the drawer and its dropdowns become disclosure groups (UI-NAV-30 to 34). No flyouts and no hover.
- **UI-NAV-54** Native apps use no dropdown navigation. The second level is a pushed screen, or expandable drawer groups when the app uses a drawer.


## Mobile drawer

- **UI-NAV-60** Below 992 px main navigation opens as a modal drawer from the start edge (left, right in RTL), full height over the header, `min(320px, 100vw − 56px)` wide, with a scrim over the rest.
- **UI-NAV-61** The top row has the logo link and a 44 × 44 px Close button at the end. Below it: menu search, Pinned (without the hover pin toggle), then the same navigation as the sidebar (`sidebar.md`). No page actions or account items. A fixed footer holds Sign out built as in the sidebar. The collapse toggle never appears.
- **UI-NAV-62** Open only with the ≡ button (`aria-expanded="true"`); no edge-swipe on the web. Close with Close, scrim tap, Escape or link activation; a swipe toward the start edge may also close. Focus moves to Close on open, is trapped, and returns to ≡ on close. The body does not scroll. Enter 250 ms decelerate, exit 200 ms; reduced motion uses a 100 ms fade.
- **UI-NAV-06** On a phone, navigation opens from a button with `aria-expanded`, traps focus, closes on route change and returns focus.


## Phone action menus

- **UI-NAV-70** Below 768 px every action menu (account, row "⋯", tenant switcher, sort, bulk, columns) renders as a modal bottom sheet. From 768 px they stay anchored dropdowns. The sheet holds the same items in the same order, plus a header row. The tenant switcher joins the account sheet as its first item.
- **UI-NAV-71** Sheet: 16 px top radius, 52 to 56 px header with title and a 44 × 44 px Close at the end, optional 32 × 4 px drag handle (`aria-hidden`), item rows at least 48 px, max height 85% of the viewport with internal scroll, bottom padding `8px + env(safe-area-inset-bottom)`, raised surface (dark: tinted surface, no shadow).
- **UI-NAV-72** A sheet closes with Close, scrim tap, Escape or item activation; drag-down may exist but is never the only way. Focus moves in, is trapped, and returns to the trigger.
- **UI-NAV-73** A second level (tenant list, "Move to") drills in within the same sheet with a "‹ Back" control. A sheet never opens over another sheet.
- **UI-NAV-74** Below 768 px the command palette and the notifications panel open as full-screen dialogs sliding up from the bottom, each with a 56 px top bar holding the title and a Close button at the end.
