# UI Standards — Forms (reference)

Read when: the task covers failures, security, access, wizard. The everyday rules are in `ui-standards/forms.md`.

## Failures, security, access

- **UI-FRM-24** A failed save keeps everything typed and shows a banner at the top of the form: "We couldn't save your changes. Try again, or contact support with code <ERR-XXXX>." Never framework or stack text. A `429` shows "Too many save attempts. Try again in <N> seconds. Your changes are kept." with a countdown from `Retry-After`, and the button reads "Try again in <N> s" with `aria-disabled` until it ends. Offline: "You're offline. Your changes are kept and will be saved when you're back online."
- **UI-FRM-25** Record changed by someone else while editing: reject the save with a banner "This laptop was changed by <name> at 10:42. Review their changes before saving." and a "Show changes" action. A server error for a hidden or conditional field shows the field first, then the error. A session that expires keeps typed values after sign-in.
- **UI-FRM-11** Every state-changing form carries a CSRF token and uses POST, PUT, PATCH or DELETE, never GET. Accept only allow-listed fields on the server. Never send workflow status, owner, price or tenant as hidden inputs or trust them from the client. Use opaque IDs for record references. Never log, echo or prefill a password, token or card number.
- **UI-FRM-26** A Confidential or Restricted field is masked by default with a Show/Hide button (`aria-pressed`, `aria-controls`), tagged "Restricted" when Restricted, `autocomplete="off"`, `spellcheck="false"`, and absent from URLs, toasts, errors, analytics and logs. A native screen with Restricted fields blocks screenshots and app-switcher previews.
- **UI-FRM-27** Reuse what the user already entered in the same process ("Same as billing address"). A form with legal or financial consequences offers a review step or confirmation before the final submit.
- **UI-FRM-28** Below 768 px a form is one column with full-width 44 px controls, radio and checkbox rows at least 44 px, a sticky action bar with full-width buttons, and the focused field scrolled above the keyboard.
- **UI-FRM-29** With 40 or more fields use sections plus the grid, and a section jump list at 1200 px and up when there are more than 4 sections. Labels wrap for long translations; fields keep their span.
- **UI-FRM-30** Colours come from tokens: field border, focus ring, danger for errors, warning for the unsaved indicator, success for "Saved", header surface with a subtle top border for the action bar.


## Wizard

- **UI-FRM-10** A wizard is for creation with 3 or more dependent steps; edits are one page. Use the stepper rules in `stepper.md`.
- **UI-FRM-12** In a wizard, Back and Next sit in the action bar and Next validates the current step. A completed step can be revisited; an upcoming step cannot be skipped. Save progress per step. Under 768 px show "Step 2 of 4" and a progress bar.
- **UI-FRM-13** Every state-changing form carries the CSRF token and uses POST, PUT, PATCH or DELETE, never GET. The server accepts only allow-listed fields.
