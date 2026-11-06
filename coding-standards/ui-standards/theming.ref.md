# UI Standards — Theming and Dark Mode (reference)

Read when: the task covers brand colour and the generator, dark mode details. The everyday rules are in `ui-standards/theming.md`.

## Brand colour and the generator

- **UI-THM-12** A theme is defined by exactly these inputs: mode, primary colour, menu style, header style, background tint. Users choose only from the swatches in `customizer.md`; a tenant admin may set the primary as any hex value, validated by the generator. No other colour is configurable.
- **UI-THM-13** One shared generator (one package used by the back end) derives all semantic colours in OKLCH and outputs a complete light and dark token set. Clients consume its output (CSS variables, JSON) and never re-implement colour derivation.
- **UI-THM-14** The generator adjusts lightness, keeping hue, until every pair passes in both modes: body, secondary and muted text on page and card 4.5:1; primary button label on primary (rest, hover, pressed) 4.5:1; primary as link text 4.5:1; focus ring against card and page 3:1; menu and header text and icons on their background 4.5:1; active menu text on the active pill 4.5:1; active indicator bar and icon on the menu background 3:1; input and field borders 3:1; logo against menu or header background 3:1 (else use the single-colour logo).
- **UI-THM-15** Use the primary colour only for: primary buttons (darker on hover, darker again pressed), links, the focus ring, the active menu bar and icon, the active tab underline, checked checkboxes, selected radios, switch on, progress bars and sliders, and the secondary-button hover border and text. Never for body or table text, status colours, notification badges, destructive actions, chart series, or page and card backgrounds.
- **UI-THM-16** Status colours (success, warning, danger, info), the notification badge, destructive colours, the environment badge and chart palettes come from fixed tokens and never change with primary, menu, header or background choices. Only generated tokens may be overridden per tenant, and only with generator output.
- **UI-THM-17** Menu style is one of Default, Dark, Navy, Brand-tinted; header style one of Default, Dark, Match menu. For the chosen background the generator derives text and icons, hover tint, a neutral active pill (text colour mixed 6% into light backgrounds, 12% into dark), active text (strongest text colour), indicator bar and icon (primary fitted to 3:1), border, field border and search-field background. Dropdowns, flyouts and menus opened from the header or menu use page colours, not the bar's.
- **UI-THM-18** Background is one of Neutral, Cool, Warm, each with a fixed light and a fixed dark value. A user never picks a dark background in Light mode or the reverse. Cards and surfaces stay neutral.
- **UI-THM-19** When the logo's brand colour has under 3:1 contrast with the bar it sits on, use the single-colour logo variant (placeholder: the logomark drawn in the bar's text colour).
- **UI-THM-20** When a tenant admin uploads a logo, suggest a primary extracted from it (the most saturated dominant colour); the admin confirms it or picks another before it applies. The confirmed colour is the "Brand" swatch and the tenant default.
- **UI-THM-21** Tenant admins set the tenant default theme and the switch "Allow users to customize colors" (default on). Every user can always change Mode. When customization is allowed users change the other inputs for themselves, stored per user per tenant; "Reset to default" returns to the tenant default.
- **UI-THM-11** A customizer validates every value, never accepts raw CSS, derives accent shades so they meet contrast, and offers "Reset to default". Store inputs as allow-listed keys (`brand`, `blue`, …, `navy`, `cool`) or, for the admin primary only, a hex matching `^#[0-9A-Fa-f]{6}$`. Write generated values into CSS custom properties on the server; never render user or admin CSS.


## Dark mode details

- **UI-THM-22** Elevation in dark mode uses lighter surfaces and borders, not shadows. Photos are never inverted or filtered. Logos switch to their dark variant; a transparent logo with no dark variant sits on a light badge with 8 px padding. A third-party widget with no dark support (maps, payment, embedded docs) renders inside a bordered container that keeps its own light background, never inverted. Charts use the dark chart palette.
- **UI-THM-10** An image or embed gets a dark variant or a dimming filter, never an inversion. A logo has a variant per mode with at least 3:1 against its bar.
- **UI-THM-23** Flutter and React Native load the generated token JSON for the user (cached, refreshed on change) and map it to `ThemeData` or `ColorScheme` and the RN theme object. The PWA sets `theme-color` per mode to the header background.
