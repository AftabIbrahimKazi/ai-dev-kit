# UI Standards — Element and Pattern Rules

Rules for single UI elements and whole UI flows. `css-standards` and `html-standards` govern the file type; this layer governs what the element does and how it behaves. Read only the partial for what you build or change, never the whole folder.

## Route

| Build or change | Read |
|---|---|
| Button, icon button, row action | `ui-standards/button.md` |
| Text, number, textarea, password, checkbox, radio, switch | `ui-standards/fields.md` |
| Dropdown or multi-select, searchable select | `ui-standards/select.md` |
| Date, date-time, date range, time | `ui-standards/date.md` |
| Whole form, Save/Cancel, validation, settings page, quick edit | `ui-standards/forms.md` (failures, security, wizard: `forms.ref.md`) |
| Multi-step flow, wizard, onboarding | `ui-standards/stepper.md` |
| Modal, dialog, drawer, side panel | `ui-standards/modal-drawer.md` |
| Dropdown menu, popover, tooltip | `ui-standards/menu-tooltip.md` |
| Tabs, segmented control, accordion | `ui-standards/tabs-accordion.md` |
| Card, KPI tile, badge, status chip, tag, avatar | `ui-standards/card-badge.md` |
| Table, record list, selection, pagination, inline edit, totals | `ui-standards/table.md` |
| Search box, filter bar, saved views, no-results | `ui-standards/filters.md` |
| File or image upload, attachments, gallery, upload endpoint | `ui-standards/upload.md` |
| Showing an image, thumbnail, photo, default or broken image | `ui-standards/image.md` |
| Loading, empty, error, offline, long job, 404/403/500/503 | `ui-standards/states.md` |
| Toast, alert, banner, flash, confirm, undo, notification, message wording | `ui-standards/feedback.md` |
| App header, top bar, tenant switcher, account menu, search trigger | `ui-standards/header.md` |
| Sidebar, rail, collapse, sign out | `ui-standards/sidebar.md` |
| Navigation config, menu search, pinned pages | `ui-standards/sidebar.ref.md` |
| Page title block, page actions, section tabs | `ui-standards/page-header.md` |
| Breadcrumb, active menu item, nav groups | `ui-standards/nav.md` |
| Rail flyout, header dropdown, mobile nav drawer, phone action sheet | `ui-standards/nav.ref.md` |
| Native app screen (Flutter, React Native, Swift, Kotlin) | `ui-standards/mobile.md` |
| PWA manifest, service worker, install, offline | `ui-standards/pwa.md` |
| Dark mode, theme toggle, brand colours, theme generator | `ui-standards/theming.md` |
| Customize-theme panel | `ui-standards/customizer.md` |
| Any colour, size, spacing, font, radius, motion, z-index, token pipeline | `ui-standards/tokens.md` |
| Public marketing, pricing or sign-up page | `ui-standards/landing.md` |
| Chart, dashboard, KPI | `ui-standards/charts.md` |
| Export to CSV, Excel, PDF, Word | `ui-standards/export.md` |
| Sign in, reset, 2FA, session, invitation, account settings | `ui-standards/auth.md` |
| Finishing or reviewing any UI change, pull-request description | `ui-standards/checklist.md` |

## Conventions

- A rule is `UI-<AREA>-NN`. Every rule is MUST unless it says SHOULD or MAY. IDs are permanent: never reuse or renumber one.
- `(check: id)` names the `code-audit` rule that checks it by script. `(browser)` needs a real-browser test. A rule with neither needs a read-through. A deliberate exception is a comment `DEVIATION: <rule id> <reason>`; accessibility and security rules cannot be waived.
- A rule that does not exist for the task is a gap. Write `STANDARDS GAP: <what is missing> — fallback used: <choice>`, name it, and ask. Never invent a rule, value, colour, spacing, icon or component.
- A partial that has a `<name>.ref.md` says so near its top. Read the `.ref.md` only when the task covers a topic it lists; the mod never requires it.
- End every UI change with the self-check in `ui-standards/checklist.md`.
- State follows `css-standards/component-files.md` RULE C-04: the data attribute is the only state mechanism, named by `css-standards.md` RULE 11 (signature prefix, `-js` or `-ts` suffix). Add a custom data attribute only when no existing one fits.
- ARIA is added on top for compliance (accessibility, SEO), only where a standard attribute exists for that state (`aria-expanded`, `aria-busy`, `aria-selected`). A state with no standard ARIA attribute keeps its data attribute alone. JS sets both in one step. CSS never selects on `aria-*`.
- This layer covers behaviour, states, wording and security, never the look. A project design source (`design.md`, Figma, tokens) wins on look. A `frameworks/` file wins where it says it overrides. When `company/` standards exist, they win over this layer.
- Precedence, highest first: accessibility and security rules (never overridable, not by a brand guide either); these standards; the CSS, HTML and JS standards for syntax and style; tenant or client brand guidelines, only within the theme inputs of `theming.md`; AI tool defaults are never applied.

## Shared rules

- **UI-SHR-01** Scope: a new screen follows the standards fully; a modified screen follows them for the regions touched, plus all accessibility and security rules for the whole screen. No mandatory retrofit of untouched screens.
- **UI-SHR-02** Use the product's shared components for every documented element. Never a third-party UI kit, and never substitute a library component for a documented one. Page and view code reads tokens through the project's own classes; no utility classes (Tailwind or other) outside component implementations.
- **UI-SHR-03** The prop `variant` names every visual variant; `type` is only the HTML button type. Component names are the project's own, one per element.
- **UI-SHR-04** Two token tiers: primitive tokens exist only in theme files; components use semantic tokens only. Units live in tokens (type in `rem`; spacing, radius and borders in `px`); code never types a unit for these.
- **UI-SHR-05** One icon set across the product, drawn on a 24 px grid with a 2 px stroke.
- **UI-SHR-06** Breakpoints: xs 0 (phones, minimum supported viewport 360 px), sm 576, md 768 (tablets; dropdowns replace bottom sheets from here), lg 992 (fixed sidebar appears, header 64 px), xl 1200 (admin panels optimised from here), 2xl 1400, 3xl 1920. Use logical properties so layouts mirror in RTL.
- **UI-SHR-07** Text can grow 40% for translation and tolerates the line height of every supported script (for example Devanagari). Store UTC and display local time. The default locale sets currency, date and 12 or 24 hour time once per product and a tenant may override it.
- **UI-SHR-08** Support matrix: the last 2 versions of Chrome, Edge, Firefox and Safari; iOS Safari 16.4 and up for PWA; iOS 15 and Android 8.0 (API 26) and up for Flutter and React Native. No Internet Explorer or legacy Edge.
- **UI-SHR-09** A tenant may change only: logo, product name, primary colour (suggested from the logo, confirmed by the admin), default menu style, header style and background tint, and whether users may customise colours. The generator contrast-corrects every value in light and dark. Status colours, typography, spacing, layout and components stay locked. No custom CSS.
- **UI-SHR-10** Where the project has no brand fonts or colours yet, use the neutral token scale in `tokens.md` with one accent slot and the system font stack.
