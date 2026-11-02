# Color

- **Roles, not hues.** Define primitives (ramps) then semantic tokens (`surface`, `text`, `border`, `accent`, `success`, `warning`, `danger`, `info`), then component tokens. Components read semantic tokens only.
- **Ramps:** 10 steps per hue, built in OKLCH (perceptually uniform). Hold L constant across hues at the same step so equal steps carry equal weight.
- **Neutral ramp:** tint toward the brand hue, chroma 0.005–0.02. Never pure `#000` or `#fff` for large areas.
- **Proportion:** 60-30-10 (dominant neutral, secondary, accent). Accent marks one action per view.
- **Harmony:** pick one scheme (monochromatic, analogous, complementary, split-complementary, triadic) and name it. Do not mix schemes.
- **Saturation:** large areas low chroma; high chroma only on small, important marks.
- **Contrast (WCAG 2.2):** body text 4.5:1; large text (24px, or 18.66px bold) 3:1; UI components, icons and focus rings 3:1. APCA is a cross-check, not the pass mark.
- **Never colour alone:** pair colour with an icon, label or pattern (WCAG 1.4.1).
- **Dark mode:** do not invert. Lower chroma, raise surfaces lighter with elevation, keep text at 87–92% white, re-check every contrast pair.
- **States:** hover and active shift L by 4–8% on the same hue; disabled drops chroma and contrast but stays legible.
