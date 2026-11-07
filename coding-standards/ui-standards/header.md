# UI Standards — App Header

Read when: adding or changing the top bar of an app shell: logo, tenant switcher, environment badge, search trigger, help, notifications, account menu.

- **UI-HDR-01** Parts run in this order, start to end: menu toggle (below 992 px), logo, tenant switcher, environment badge, search trigger, theme toggle, help, notifications, account menu. An absent part leaves no gap.
- **UI-HDR-02** At 992 px and up the header starts after the sidebar and has no logo (the sidebar logo row has it). Below 992 px it spans the full width with the ≡ toggle first.
- **UI-HDR-03** Height is 64 px at 992 px and up, 56 px below. The header is sticky, never hides on scroll, and the scroll container sets `scroll-padding-top` to the header height.
- **UI-HDR-04** The end zone holds at most 5 controls: search, theme toggle, help, notifications, account. Page titles, the `<h1>` and page actions never go in the header; they go in the page header.
- **UI-HDR-05** The logo is the only content of one link to home (`aria-current="page"` on home itself). Its `alt` is "<Product> home" and the link has no extra `aria-label`. It is 32 px high at 992 px and up, 28 px below, max 160 px wide (96 px under 576 px), loads the logo variant for the active theme, and has a 44 × 44 px hit area.
- **UI-HDR-06** The tenant switcher renders only for 2 or more tenants. It is a menu button showing the current tenant, truncated at 24 characters (12 at 576–767 px) with the full name in a tooltip. Under 576 px it moves into the account sheet as its first item. With more than 7 tenants the list starts with a search field and the 3 most recent tenants.
- **UI-HDR-07** Every non-production environment shows an uppercase text badge (`DEV`, `UAT`, `STAGING`). Production shows none. Under 576 px it becomes a 24 px strip above the header reading "<ENV> environment".
- **UI-HDR-08** The search trigger is a field-styled `<button>` reading "Search" with a shortcut hint (`Ctrl K`, `⌘K` on macOS), 240 px wide at 768–991 px and 320 px at 992 px and up, centred. Below 768 px it is an icon button. Both open the command palette and set `aria-keyshortcuts="Control+K"`.
- **UI-HDR-09** The theme toggle shows from 576 px, right after search. Below 576 px it moves into the account sheet.
- **UI-HDR-10** Help is an icon button named "Help", always directly before Notifications, at every breakpoint on every signed-in screen.
- **UI-HDR-11** Notifications is a bell icon button. The unread badge shows 1 to 99, `99+` above, and nothing at 0. The accessible name is "Notifications, N unread" ("Notifications" at 0). It opens a popover from 768 px and a full-screen dialog below.
- **UI-HDR-12** The account menu trigger shows a 32 px avatar, plus the display name (truncated at 20 characters) from 992 px. Its accessible name starts with the visible name: "<Name>, account menu".
- **UI-HDR-13** Account menu items in order: tenant switcher (under 576 px only), Profile, Settings, Theme, Customize theme, divider, Sign out. Sign out is last. Theme is 3 `menuitemradio` items (System, Light, Dark) in a group labelled "Theme", never a submenu; a phone sheet may show them as a 3-segment row.
- **UI-HDR-14** The first focusable element in `<body>` is a "Skip to main content" link to `<main id="main-content" tabindex="-1">`, hidden until focused.
- **UI-HDR-15** One `<header>` landmark outside `<main>`. Every icon-only control has an accessible name. Hit areas are 40 × 40 px, 44 × 44 px on coarse pointers.
- **UI-HDR-16** The header uses its own surface token with a 1 px bottom border in both themes. Dark theme has no header shadow.
- **UI-HDR-17** Native apps do not use this header; they use the platform app bar. A PWA uses it with safe-area padding.
