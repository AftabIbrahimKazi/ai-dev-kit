# TS Standards — Decisions

This file defines when to use a function, a class, and a constructor. These decisions must be made deliberately — the wrong choice creates unnecessary complexity or missing structure.

Read [ts-standards.md](../ts-standards.md) first for global rules.

---

## Function vs Class

---

## RULE TS-D-01 — Use a function when the work is stateless

A function is correct when:
- The operation takes typed inputs, performs work, and returns a typed result or causes an effect
- Nothing needs to be remembered after the call completes
- No methods will ever be called on the result
- Each call is fully independent of every other call

```ts
// Right — stateless, typed, no persistence needed
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toggleState(id: string, attribute: string, value: string): void {
  const el = document.querySelector(`#${id}`) as HTMLElement | null;
  if (!el) return;
  el.dataset[attribute] = value;
}
```

---

## RULE TS-D-02 — Use a class when state must persist across time

A class is correct when:
- Typed data must be stored and remembered after initialisation
- Multiple methods will be called on the same instance over its lifetime (`update()`, `destroy()`, `enable()`)
- Multiple independent instances may coexist with their own separate typed state
- The system has a lifecycle (created → active → destroyed)

```ts
// Right — typed state persists, update() called every frame, lifecycle exists
class SunAnimation {
  private _sun: Sun;
  private _mixer: AnimationMixer | null = null;

  constructor(sun: Sun) {
    this._sun = sun;
  }

  public update(delta: number): void {
    if (!this._mixer) this._mixer = this._init();
    this._mixer?.update(delta);
  }

  public destroy(): void {
    this._mixer = null;
  }

  private _init(): AnimationMixer { ... }
}
```

---

## RULE TS-D-03 — When in doubt, start with a function

If it is not clear whether state persistence is needed, write a typed function first. Promote it to a class only when the need for state or lifecycle becomes evident. Do not create a class speculatively.

---

## Constructor Rules

---

## RULE TS-D-04 — The constructor stores typed dependencies, init() acts

The constructor receives typed dependencies and assigns them to typed private properties. It must not run side effects, start loops, query the DOM, add event listeners, or perform any operation that can fail or needs to be undone.

All active setup belongs in an explicit `public init(): void` method called after construction.

```ts
// Wrong — constructor doing too much
class SceneEngine {
  constructor(canvas: HTMLCanvasElement) {
    this._renderer = new WebGLRenderer({ canvas });
    this._renderer.setSize(window.innerWidth, window.innerHeight); // side effect
    window.addEventListener('resize', this._onWindowResize.bind(this)); // side effect
  }
}

// Right — constructor stores, init() acts
class SceneEngine {
  private _canvas: HTMLCanvasElement;
  private _renderer: WebGLRenderer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
  }

  public init(): void {
    this._renderer = new WebGLRenderer({ canvas: this._canvas });
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onWindowResize.bind(this));
  }
}
```

---

## RULE TS-D-05 — Construction and activation are always separate concerns

A class may be constructed without being activated. The constructor sets up the typed object so it is ready to be initialised. Calling `init()` starts the system. This separation allows:
- Constructing all typed dependencies before activating any of them
- Controlling initialisation order explicitly in the orchestrator
- Destroying and reinitialising without recreating the object

---

## RULE TS-D-06 — Uninitialised properties use null not undefined

Properties that will be assigned in `init()` rather than the constructor must be typed as `Type | null` and initialised to `null`. This makes the uninitialised state explicit and type-safe.

```ts
// Wrong — undefined is implicit and ambiguous
private _renderer: WebGLRenderer;

// Right — null is explicit and typed
private _renderer: WebGLRenderer | null = null;
```

---

## Decision Tree

```
Does the operation need to remember state after it runs?
├── No  → Use a function with explicit parameter and return types
└── Yes → Use a class with typed private properties
           │
           Does setup involve side effects?
           (DOM queries, event listeners, GPU allocation, network calls)
           ├── No  → Constructor can do everything
           └── Yes → Constructor stores typed deps only (null for uninitialised)
                     init(): void does the work
```
