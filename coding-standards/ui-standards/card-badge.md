# UI Standards — Card, Badge, Tag, Avatar

Read when: adding a card, KPI tile, status badge, tag, count or avatar.

## Card

- **UI-CRD-01** A card shows one object and has one primary target. Never put a button or link inside a clickable card.
- **UI-CRD-02** A heading inside a card continues the page heading order. It does not restart at `h1`.
- **UI-CRD-08** A card has the surface colour, a 1 px subtle border, 10 px radius and no shadow (shadows are for overlays); padding 14 to 20 px; 16 px between cards.
- **UI-CRD-09** Anatomy: an optional header (title 14 to 15 px weight 600 as a heading, optional description, optional ⋯ menu as a 28 px ghost icon button at the end), a body, and an optional footer after a 1 px divider with one secondary link or action. At most one primary-style button.
- **UI-CRD-10** A clickable card is one `<a href>` covering the card, with a hover border and a visible focus ring, and no other links or buttons inside.
- **UI-CRD-11** A KPI card shows a label (13 px weight 500, secondary), a value (26 px, tabular digits, locale format) and an optional one-line note (12 px, muted) such as "2 overdue". When clickable it links to the filtered list.
- **UI-CRD-12** A table inside a card has no padding so rows reach the card edges; the card header holds the title and actions.

## Badge, tag, count

- **UI-CRD-03** A badge shows a status word, not a raw value: "In repair", not `IN_REPAIR`. Labels are 1 to 2 words in sentence case.
- **UI-CRD-04** Colour is never the only status cue. Add text or an icon. One status word has one colour everywhere in the product.
- **UI-CRD-05** A count badge caps at "99+" and has accessible text: "3 unread".
- **UI-CRD-13** A status chip is a pill (22 px, 20 px in tables) with a 6 px dot and a text label, 12 px weight 600. Tones: success (In use, Active, Paid), warning (In repair, Pending, Due soon), danger (Retired, Overdue, Failed), info (Pending approval, Scheduled), neutral (In stock, Draft, Closed). Each product maps its statuses to tones in one config.
- **UI-CRD-14** A user-defined tag is neutral (never a status tone), 24 px high, 4 px radius, 12 px weight 500, with an optional 18 px ✕ button named "Remove tag <name>".
- **UI-CRD-15** Count pills are at least 18 px high. The `alert` style (fixed alert colour, white text) is only for unread notifications; totals next to labels use the neutral style. Name the meaning ("3 unread notifications").
- **UI-CRD-16** Chips and tags stay on one line; text over 24 characters truncates with an ellipsis and a tooltip.
- **UI-CRD-17** A status chip is not clickable. Changing a status is an action (menu item or select).

## Avatar

- **UI-CRD-06** An avatar has a fixed size and an initials fallback. A missing or failed photo never shows a broken image.
- **UI-CRD-07** Truncated text exposes the full value to keyboard and screen-reader users. Person and record names wrap instead of truncating.
- **UI-CRD-18** Avatars are circles: 24 px (inline text), 22 to 24 px (table cells, select options), 32 px (header, lists, comments), 40 px (cards, detail headers), 64 px (profile). Initials are 10, 12, 14 or 22 px weight 700.
- **UI-CRD-19** A photo uses the image component (lazy, 160 px WebP, `object-fit: cover`). With no photo or on failure, show the first letters of first and last name on the active-nav colours.
- **UI-CRD-20** "Unassigned" is a dashed-outline circle with a muted person icon, named "Unassigned".
- **UI-CRD-21** The avatar's accessible name is the person's name (`role="img"` and `aria-label`, or `alt`). When the name is shown beside it, the avatar is `aria-hidden`. A presence dot (10 px, 2 px surface ring) may show and is described in the name ("Rahul Mehta, online").
- **UI-CRD-22** An avatar group overlaps by 8 px with a 2 px surface ring, shows at most `max` avatars then "+N", is followed or described by a label ("7 people assigned"), and each avatar shows its name in a tooltip.
- **UI-CRD-23** Serve photos through signed, expiring URLs, only to users allowed to see the person.
