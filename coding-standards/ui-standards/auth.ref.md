# UI Standards — Authentication and Account Settings (reference)

Read when: the task covers two-step verification, account settings, quality. The everyday rules are in `ui-standards/auth.md`.

## Two-step verification

- **UI-AUT-15** Every account completes 2FA setup at first sign-in (no skip) and verifies 2FA at every sign-in except on a remembered device. SSO users are exempt only when the identity provider asserts MFA (`amr` claim). Enforce on the server.
- **UI-AUT-04** The primary method is an authenticator app (TOTP) or a passkey; fallbacks are an emailed one-time code and 10 single-use backup codes. No SMS.
- **UI-AUT-16** A code is one field (`inputmode="numeric"`, `autocomplete="one-time-code"`, maxlength 6, large centred digits), submitted automatically at 6 digits and also by a "Verify" button, with "Remember this device for 30 days" and links "Use a backup code" and "Email me a code instead". Never six separate boxes.
- **UI-AUT-17** Setup shows "Step 1 of 2", the QR code with a text alternative (manual key in groups of 4 with Copy), and a code field to confirm. Step 2 shows 10 backup codes in a monospace grid with Download (.txt), Copy and Print, and "I've saved my backup codes in a safe place" must be ticked before "Finish setup".


## Account settings

- **UI-AUT-20** Account settings is one page reached from the avatar menu with in-page tabs Profile, Security, Notifications.
- **UI-AUT-21** Profile offers photo (avatar upload), full name, work email (changing it sends a verification link to the new address and a notice to the old), phone (optional, recovery only), language, time zone and date format, built as a normal form.
- **UI-AUT-22** Security lists: sign-in methods (password with last-changed date and "Change password" needing the current password; authenticator app status; backup codes left with "Generate new codes"; passkeys and biometric devices; SSO "Managed by your organization"); active sessions (device, browser or app, approximate location, last active, "This device" tag, Sign out per session, "Sign out of other devices"); and a link to sign-in history (90 days).
- **UI-AUT-23** Email the user on: sign-in from a new device, password change, 2FA method change, backup codes regenerated, email change. Emails never contain passwords, codes or session links.


## Quality

- **UI-AUT-24** Log every sign-in, failure, lockout, reset, 2FA change, session revocation and invitation with time, user ID, IP and user agent. Never passwords, codes or tokens.
- **UI-AUT-25** All auth forms post over HTTPS with CSRF protection. Auth pages send `Cache-Control: no-store` and are never framed (`frame-ancestors 'none'`).
- **UI-AUT-26** On phones fields and buttons are 44 px with 16 px text, the keyboard type matches the field, and the primary button stays visible above the keyboard. Auth screens follow the user's or system theme and the tenant's primary colour through tokens.
