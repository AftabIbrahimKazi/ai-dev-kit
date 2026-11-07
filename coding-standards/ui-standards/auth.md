# UI Standards — Authentication and Account Settings

Read when: adding sign-in, sign-up, invitation, password reset, 2FA, session handling, biometric unlock, or the account settings page.

Detail in `ui-standards/auth.ref.md`: two-step verification, account settings, quality. Read it only when the task covers one of these.

## Screens

- **UI-AUT-10** Pre-sign-in screens use a centred 400 px card (24 to 28 px padding, 12 px radius) on the page surface, the product logo above it (tenant logo when white-labelled), one `<h1>` per screen, 40 px fields and buttons (44 px and 16 px text on phones), and a footer with language, theme, Help, Privacy and Terms. On phones the card is full width without a border. No marketing content or split-screen illustration.
- **UI-AUT-11** Sign in shows, in order: SSO buttons for the providers enabled for the tenant ("Continue with Google", "Continue with Microsoft", official brand assets), an "or" divider, Work email (`autocomplete="username"`), Password (`autocomplete="current-password"`, show/hide) with "Forgot password?" aligned to its label, "Keep me signed in for 30 days" (unchecked by default), and a full-width "Sign in" button. Self-registration is not offered: "New to <product>? Ask your administrator for an invitation."


## Errors and protection

- **UI-AUT-01** Sign-in and reset never reveal whether an account exists, is disabled or uses SSO. Use the same message and the same response time. A failed sign-in shows only "Email or password is incorrect." above the form (`role="alert"`) and marks both fields.
- **UI-AUT-02** After 5 failed attempts for an email within 15 minutes, lock the account for 15 minutes and show "Too many attempts. Try again in 15 minutes, or reset your password." with a disabled button counting down; unknown emails behave the same. Rate-limit every auth endpoint per IP and per account (`429` with `Retry-After`), including reset and 2FA attempts. The message stays generic.
- **UI-AUT-12** Auth screens allow paste and password managers, use no cognitive tests (puzzles, transcription), and offer at least one alternative that needs no memorising (password manager, passkey, SSO).


## Passwords and recovery

- **UI-AUT-03** Allow paste and password managers (`autocomplete="username"`, `current-password`, `new-password`). A new password is at least 12 characters (maximum at least 64), not in a breached-password list, not containing the user's name or email, with no composition rules. The field shows a 4-step strength meter with a text label and a live checklist (✓ or ○ with screen-reader text). No confirm-password field; use show/hide.
- **UI-AUT-13** "Reset your password" asks only for the work email. The next screen always says "If an account exists for <email>, we've sent a link to reset the password. The link works once and expires in 30 minutes." with resend after 60 s and "Back to sign in".
- **UI-AUT-06** A reset link is single-use and expires in 30 minutes. Never put a password or a reset token in a log or an email body.
- **UI-AUT-14** The reset screen shows the account email, the new-password field and "Set password and sign in". On success revoke all other sessions and remember-device tokens and send a security email. An expired or used link shows "This link has expired. Request a new one." with a button.


## Sessions

- **UI-AUT-05** Rotate the session ID on sign-in and on any privilege change. Cookies are `HttpOnly`, `Secure` and `SameSite=Lax` or `Strict` (tokens in secure storage on native apps). Expire after the tenant idle timeout (default 30 minutes; 30 days absolute with "Keep me signed in"). Sign-out is POST with CSRF and invalidates the session on the server. (check: ui-aut-09)
- **UI-AUT-07** After sign-in redirect only to a same-origin path from an allowlist.
- **UI-AUT-08** 2 minutes before idle timeout show an `alertdialog` "Your session is about to end" with a live countdown, the reason (inactivity), "Unsaved changes on this page are kept as a draft", and "Sign out" and "Stay signed in" (focused). After timeout the user signs in and returns to the same page with drafts restored and unsaved form data kept.
- **UI-AUT-18** An invitation link is single-use and valid 72 hours. Accepting shows the organisation and email (read-only), the password field (or SSO buttons for SSO tenants), then continues to 2FA setup.
- **UI-AUT-19** After a full sign-in apps may offer "Unlock with Face ID / fingerprint". The unlock screen shows the user's first name, the biometric button, "Use password instead" and "Sign in with another account". Biometrics unlock a token in the platform keystore and never replace server sessions. Web and PWA offer passkeys (WebAuthn) where supported.
