# Motion

Motion exists for feedback, orientation or continuity. Remove any that does none. DES-02 is the floor.

- **Duration:** micro feedback 100–150ms; small UI 150–250ms; large or overlay 250–400ms. Above 500ms feels slow. Response to input starts inside 100ms (Doherty threshold 400ms for the whole result).
- **Easing:** ease-out for entering (decelerate); ease-in for exiting (accelerate); ease-in-out for movement across the screen; linear only for progress and loops. Exits run about 25% faster than entrances.
- **Curves (tokens):** standard `cubic-bezier(0.2, 0, 0, 1)`; emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`; emphasized accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)`. Use springs only for physical, draggable objects.
- **Properties:** animate `transform` and `opacity` only (compositor). Never animate width, height, top or left.
- **Stagger:** 20–50ms per item; cap the total at 300ms.
- **Reduced motion:** under `prefers-reduced-motion`, replace movement with a fade or nothing.
- **Micro-interaction anatomy** (Saffer): trigger, rules, feedback, loops and modes. Name all four before building one.
- **Press and hover:** press scale 0.97 over 100ms; hover shifts colour or elevation, not position.
- **Transitions between states:** shared element or continuity cue when content moves; fade-through when it does not relate.
- **Loading:** skeleton over spinner beyond 400ms; spinner only for short, unknown waits.
- **Tokens:** `--duration-fast|base|slow`, `--ease-standard|enter|exit`. No literal times or curves in components.
