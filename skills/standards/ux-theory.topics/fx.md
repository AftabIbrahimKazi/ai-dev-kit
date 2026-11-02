# SFX and VFX

## SFX (sound)
- Off by default. Play only after a user action; browsers block autoplay.
- Under 200ms for UI cues, low volume, one sound per event, always paired with a visual cue.
- Persistent mute control. Audio longer than 3s needs pause, stop or volume (WCAG 1.4.2).
- Never the only signal for state or error.

## VFX (visual effects)
- **Budget:** 16.6ms a frame (60fps). Measure before shipping; remove the effect before the budget.
- **Glass and blur:** `backdrop-filter` is costly on large areas. Keep blur 8–24px, limit to small surfaces, give a solid fallback (`@supports`).
- **Depth:** layered shadows (2–3 stacked, low opacity) beat one hard shadow; elevation tokens, not literals.
- **Gradients:** two or three stops, hues within 60° of each other, no banding (add subtle noise on large areas).
- **Canvas, WebGL, particles:** gate on capability, pause offscreen (`IntersectionObserver`), stop under `prefers-reduced-motion`, cap devicePixelRatio at 2.
- **`will-change`:** set it just before the effect and remove it after; never blanket it.
- **Purpose:** an effect supports hierarchy or feedback. One signature effect per theme, not one per component.
