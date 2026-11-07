# UI Standards — Menu, Popover, Tooltip

Read when: adding a dropdown menu, popover or tooltip.

- **UI-MNU-01** An action menu button sets `aria-haspopup="menu"` and `aria-expanded`. Enter, Space and ↓ open it with focus on the first item; ↑ and ↓ move, Home and End jump, a letter jumps to the next match, Enter selects, Esc closes and returns focus to the trigger. (browser)
- **UI-MNU-02** `role="menu"` is for action menus only. Navigation is a list of links, never `role="menu"`. A form value uses Select, not a menu. (check: ui-mnu-02)
- **UI-MNU-03** A menu is 200 to 280 px wide with 4 px padding and at most about 10 items. Items are 32 px (44 to 48 px touch), with optional 16 px icons, shortcut hints, small-caps group headings and 1 px separators. A destructive item is last, after a separator, in the danger style. A disabled item stays visible, dimmed, with the reason in a tooltip.
- **UI-MNU-04** A popover holds small interactive content anchored to a trigger (details with links or buttons, a help card, a one-field form). A tooltip never does: text only, at most 80 characters. Anything larger is a drawer or modal.
- **UI-MNU-05** A tooltip opens after 300 ms of hover and at once on keyboard focus, stays open while the pointer is on the trigger or the tooltip, and closes on leave, blur or Esc. Fade is 120 ms, none under reduced motion.
- **UI-MNU-06** A tooltip is never the only place essential information appears. Touch devices have no hover: show that text on the page. Where a tooltip is kept on touch it opens on a 500 ms long-press and hides after 1.5 s; an ⓘ icon may open a popover on tap instead.
- **UI-MNU-07** A menu item is at least 32 px high; 44 px on touch. Below 768 px a menu is a bottom sheet (`nav.md`).
- **UI-MNU-08** A checkable item in a menu is `menuitemcheckbox` or `menuitemradio` with a ✓ in the icon column. The menu stays open after choosing; an action item closes it.
- **UI-MNU-09** Tooltips are for the name of every icon-only button, the full text of truncated content, and short help behind an ⓘ icon. They never hold information needed to finish a task.
- **UI-MNU-10** A tooltip uses inverted colours, 12 px weight 500, 5 × 8 px padding, 6 px radius, a 4 px arrow, max width 240 px, 6 px from the trigger, top by default and flipped to stay in view. It has `role="tooltip"`, is referenced by the trigger's `aria-describedby`, and for an icon-only button its text is also the accessible name. A non-focusable trigger (truncated text) gets `tabindex="0"`.
- **UI-MNU-11** A popover is at most 320 px wide, 14 px padding, raised surface with overlay shadow, an optional bold title with ✕, 13 px body text, and up to 2 small buttons. It opens on click, never hover, flips to stay in view, closes on Esc, ✕ or outside click, and returns focus to the trigger. The trigger has `aria-expanded` and `aria-controls`; the popover is a labelled, non-modal `role="dialog"`.
- **UI-MNU-12** Menus and popovers share the dropdown layer. Only one is open at a time; opening another closes the first.
