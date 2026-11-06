# UI Standards — Theming and Dark Mode

Read when: adding dark mode, a theme toggle, brand colours, menu or header styles, a theme generator, or any colour that changes by mode. The customizer panel: `customizer.md`. Token values: `tokens.md`.

Detail in `ui-standards/theming.ref.md`: brand colour and the generator, dark mode details. Read it only when the task covers one of these.

## Modes

- **UI-THM-01** Offer light, dark and System. The default is System, which follows `prefers-color-scheme`. Save an explicit choice (System, Light, Dark) per user, server-side when signed in, and apply it on every device.
- **UI-THM-02** Resolve System in CSS with `@media (prefers-color-scheme: dark)`, so no script runs before first paint. A user choice sets one theme data attribute on `<html>`, named by `css-standards.md` RULE 11.
- **UI-THM-03** No flash of the wrong theme. The server writes the mode into the first HTML response and links the generated theme as a cached per-tenant stylesheet (`/theme/{tenant}-{hash}.css`, immutable caching, new hash on change). If an inline `<style>` or script is unavoidable it carries the request's CSP nonce; never enable `unsafe-inline`.
- **UI-THM-04** Save the choice per user (account setting when signed in, else a first-party cookie or `localStorage`) and read it on every load.
- **UI-THM-05** A quick toggle icon button sits in the header right before Help, from 576 px; below 576 px mode changes in the account sheet. It switches between Light and Dark, shows the icon of the mode it will switch to (moon in Light, sun in Dark), and has the name and tooltip "Switch to dark mode" or "Switch to light mode". A three-way choice is a radio group.
- **UI-THM-06** Switching mode or any theme option applies at once, with no reload and no layout shift. Do not animate colour changes.
- **UI-THM-07** Every colour is a semantic token with a value per mode. No literal colour (hex, rgb, hsl, named, or palette utility such as `bg-blue-600`) in a component or page outside the theme files and the generator. (check: css-10)
- **UI-THM-08** Check contrast in both modes: 4.5:1 for text, 3:1 for large text and interface parts. Dark mode is not an inversion: higher surfaces are lighter, and body text is a soft white, not pure white.
- **UI-THM-09** Set `color-scheme: light dark` so native controls and scrollbars follow the mode. Set `<meta name="theme-color">` once per scheme to the header background.
