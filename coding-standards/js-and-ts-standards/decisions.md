# JS + TS Standards — Decisions

This file defines when to use a function, a class, and a constructor. These decisions must be made deliberately — the wrong choice creates unnecessary complexity or missing structure.

Read [js-and-ts-standards.md](../js-and-ts-standards.md) first for global rules.

---

## Function vs Class

---

## RULE JT-D-01 — Use a function when the work is stateless

A function is correct when:
- The operation takes inputs, performs work, and returns or causes an effect
- Nothing needs to be remembered after the call completes
- No methods will ever be called on the result
- Each call is fully independent of every other call

In `.ts` files all parameters and return types must be explicitly typed.

```js
// Right — JS, stateless, no persistence needed
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toggleState(id, attribute, value) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.dataset[attribute] = value;
}
```

```ts
// Right — TS, same logic, explicitly typed
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

## RULE JT-D-02 — Use a class when state must persist across time

A class is correct when:
- Data must be stored and remembered after initialisation
- Multiple methods will be called on the same instance over its lifetime (`update()`, `destroy()`, `enable()`)
- Multiple independent instances may coexist with their own separate state
- The system has a lifecycle (created → active → destroyed)

```js
// Right — JS, state persists, lifecycle exists
class SunAnimation {
  constructor(sun) {
    this._sun = sun;
    this._mixer = null;
  }

  update(delta) {
    if (!this._mixer) this._mixer = this._init();
    this._mixer.update(delta);
  }

  destroy() {
    this._mixer = null;
  }
}
```

```ts
// Right — TS, same pattern, typed
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
}
```

---

## RULE JT-D-03 — When in doubt, start with a function

If it is not clear whether state persistence is needed, write a function first. Promote it to a class only when the need for state or lifecycle becomes evident. Do not create a class speculatively.

---

## Constructor Rules

---

## RULE JT-D-04 — The constructor stores, init() acts

The constructor receives dependencies and assigns them to properties. It must not run side effects, start loops, query the DOM, add event listeners, or perform any operation that can fail or needs to be undone.

All active setup belongs in an explicit `init()` method called after construction. In `.ts` files this is `public init(): void`.

```js
// Wrong — JS, constructor doing too much
class SceneEngine {
  constructor(canvas) {
    this._renderer = new Renderer(canvas);
    this._renderer.setSize(window.innerWidth, window.innerHeight); // side effect
    window.addEventListener('resize', this._onWindowResize.bind(this)); // side effect
  }
}

// Right — JS
class SceneEngine {
  constructor(canvas) {
    this._canvas = canvas;
    this._renderer = null;
  }

  init() {
    this._renderer = new Renderer(this._canvas);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onWindowResize.bind(this));
  }
}
```

```ts
// Right — TS, same separation, typed
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

## RULE JT-D-05 — Construction and activation are always separate concerns

A class may be constructed without being activated. The constructor sets up the object so it is ready to be initialised. Calling `init()` starts the system. This allows:
- Constructing all dependencies before activating any of them
- Controlling initialisation order explicitly in the orchestrator
- Destroying and reinitialising without recreating the object

---

## RULE JT-D-06 — Uninitialised TS properties use null not undefined

In `.ts` files, properties assigned in `init()` rather than the constructor must be typed as `Type | null` and initialised to `null`. This makes the uninitialised state explicit and type-safe.

```ts
// Wrong
private _renderer: WebGLRenderer;

// Right
private _renderer: WebGLRenderer | null = null;
```

---

## Decision Tree

```
Does the operation need to remember state after it runs?
├── No  → Use a function
│         (TS: with explicit parameter and return types)
└── Yes → Use a class
           │
           Does setup involve side effects?
           (DOM queries, event listeners, GPU allocation, network calls)
           ├── No  → Constructor can do everything
           └── Yes → Constructor stores only
                     (TS: null for uninitialised typed properties)
                     init() does the work
```
