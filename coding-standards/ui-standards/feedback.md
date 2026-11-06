# UI Standards — Feedback and Messages

Read when: adding a toast, alert, banner, flash message, confirm dialog, undo, notification or any user-facing message text.

## Choosing the component

- **UI-FBK-01** Choose by situation: action succeeded (no reload), a toast ("LT-0044 assigned to Rahul Mehta"); succeeded and reversible, a toast with Undo ("3 laptops archived · Undo"); result after a server redirect, an inline flash under the page header; action failed, an inline alert at the form or region; invalid field, an inline field error; condition in one region, an inline alert in that region; condition for the whole app, a banner; irreversible or high-risk action, a confirmation dialog; long job, a progress toast plus bell notification; event caused by someone else, a bell notification. Errors never go in auto-dismissing toasts; success never goes in a modal.

## Toasts

- **UI-FBK-02** A toast is an icon, a message of at most 2 lines (80 characters, no title), at most one text action, and a Close button named "Dismiss: <message>". It uses inverted page colours, sits at the bottom centre 420 px wide above any sticky action bar, and on phones is full width with 12 px side margins above bottom bars. A plain toast stays 5 s, one with an action 10 s, a progress toast until the job ends or the user hides it. The timer pauses on hover and focus.
- **UI-FBK-08** At most 3 toasts show at once; the newest is at the bottom; the rest queue. Identical messages within 2 s merge ("3 laptops assigned"). A routine, expected view change gets no message.
- **UI-FBK-03** A toast uses `role="status"` and never takes focus; its buttons are keyboard reachable. Use `role="alert"` for errors only. Information needed later also exists outside the toast (Undo from the record's activity or the archive list).

## Inline messages and banners

- **UI-FBK-09** A message carried across a server redirect renders inline directly below the page header, one at a time, as a success, info, warning or danger alert with icon, text and a Dismiss button, in the same style as a client message. Success and info use `role="status"`, danger `role="alert"`. It disappears on the next navigation.
- **UI-FBK-10** An inline alert sits in the form or region it concerns, uses the fixed status colours with an icon and text (never colour alone), an optional bold first sentence, and at most 2 actions. An error alert stays until the problem is fixed; info and warning may be dismissible.
- **UI-FBK-11** An app-wide condition is a banner directly below the header across the content column. Show at most one, by priority: offline, security or session, maintenance, licence or billing, announcement. Offline and security banners are not dismissible; others may be, remembered per user per announcement.
- **UI-FBK-07** An error the user must fix never appears only in a toast.

## Confirm or Undo

- **UI-FBK-05** A reversible action (archive, remove from list, change status, unassign, move) runs at once and shows a toast with Undo for at least 10 s. No confirmation. Apply it in a reversible form on the server (soft state) so Undo restores order and relations; after the toast closes the change stands, and where possible it can still be reversed from the record's activity or the archive.
- **UI-FBK-06** An irreversible action (permanent delete, send an email or invoice, revoke access, payment) asks confirmation in an `alertdialog`: the title is a question naming the action and the object ("Delete laptop LT-0044?"), the body states the consequence ("…can't be undone."), "Cancel" has initial focus, and a solid danger button repeats the verb ("Delete laptop"). Esc cancels.
- **UI-FBK-12** A permanent bulk delete of more than 25 records, and the deletion of a tenant, site, account or any container of data, requires typing the record code or the count ("Type 40 to confirm"). The danger button stays `aria-disabled` until the text matches.

## Wording and notifications

- **UI-FBK-04** A message is in sentence case, names the object ("LT-0044 assigned to Rahul Mehta"), uses past tense for completed actions, and states what happened, why and what to do next. A server error adds a support code. Never "Error", "Oops" or jokes. (check: ui-fbk-04)
- **UI-FBK-13** The bell is for events that happen while the user is elsewhere: background job results, assignments and mentions by others, approvals. Never for the immediate feedback of the user's own action. Each notification links to its object and has read and unread state, and goes only to users permitted to see the object.
- **UI-FBK-14** Toasts, banners, flash messages and notifications never carry Confidential or Restricted values, tokens or full personal data. They reference records by identifier.
- **UI-FBK-15** Colours come from tokens: status colours, inverted toast colours, danger solid and on-danger for destructive buttons.
