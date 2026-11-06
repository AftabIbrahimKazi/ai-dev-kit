# UI Standards — PWA

Read when: adding a web app manifest, a service worker, an install offer, offline support or an update notice.

- **UI-PWA-01** Ship a manifest with `name`, `short_name` (at most 12 characters), `id`, `start_url`, `scope`, `display: "standalone"`, `theme_color`, `background_color`, and icons at 192 and 512 px including one `purpose: "maskable"`. (check: ui-pwa-01)
- **UI-PWA-02** Set `<meta name="theme-color">` once per colour scheme with `media="(prefers-color-scheme: …)"`. Provide a 180 px Apple touch icon and iOS splash images for common sizes. The splash uses `background_color` with the maskable icon centred.
- **UI-PWA-03** Show no install offer on the first visit. From the second visit put "Install app" in More or the account menu, and it may appear once as a sheet listing 3 benefits with "Install" (triggers the browser prompt) and "Not now". Remember a dismissal for 30 days.
- **UI-PWA-04** iOS Safari has no install prompt. "Install app" opens a sheet with numbered steps: Tap Share (show the icon), Add to Home Screen, Add; plus "Got it" and "Don't show again".
- **UI-PWA-05** When installed (`display-mode: standalone`) use bottom navigation, give every sub-page its own back control, open links to other sites in the browser, and hide "Install app".
- **UI-PWA-06** When a new service worker is waiting, show a persistent toast "A new version of <product> is available · Reload" above the bottom navigation. Never reload by itself while the user is working. Reload activates the new version and keeps the current route.
- **UI-PWA-07** The service worker caches only the app shell and public static assets, never an API response with personal or Restricted data. Limit its scope to the app path.
- **UI-PWA-08** Cache an offline page. Offline navigation to an uncached page says "You're offline", that changes are kept, shows the pending-sync list, and offers "Try again".
- **UI-PWA-09** Keep the offline write queue in encrypted storage. The server stays the source of truth. Sync when the app opens, because iOS has no background sync, and storage may be cleared after about 7 days of non-use.
- **UI-PWA-10** Detect at runtime a native capability the PWA lacks (background location, NFC, some biometrics). Hide the feature or explain it and point to the native app. Never fail silently. iOS limits: no install prompt (steps sheet); push only when installed on iOS 16.4 and up (in-app bell and email otherwise); limited biometrics (passkeys where supported, else password).
