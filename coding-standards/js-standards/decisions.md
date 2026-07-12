# JS Standards — Decisions

This file defines when to use a function, a class, and a constructor. These decisions must be made deliberately — the wrong choice creates unnecessary complexity or missing structure.

Read [js-standards.md](../js-standards.md) first for global rules.

---

## Function vs Class

---

## RULE JS-D-01 — Use a function when the work is stateless

A function is correct when:
- The operation takes inputs, performs work, and returns or causes an effect
- Nothing needs to be remembered after the call completes
- No methods will ever be called on the result
- Each call is fully independent of every other call

```js
// Right — stateless, independent, no persistence needed
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toggleState(id, attribute, value) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.dataset[attribute] = value;
}
```

---

## RULE JS-D-02 — Use a class when state must persist across time

A class is correct when:
- Data must be stored and remembered after initialisation
- Multiple methods will be called on the same instance over its lifetime (`update()`, `destroy()`, `enable()`)
- Multiple independent instances may coexist with their own separate state
- The system has a lifecycle (created → active → destroyed)

```js
// Right — state persists, update() called every frame, lifecycle exists
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

---

## RULE JS-D-03 — When in doubt, start with a function

If it is not clear whether state persistence is needed, write a function first. Promote it to a class only when the need for state or lifecycle becomes evident. Do not create a class speculatively.

---

## Constructor Rules

---

## RULE JS-D-04 — The constructor stores, init() acts

The constructor is for receiving dependencies and assigning them to properties. It must not run side effects, start loops, query the DOM, add event listeners, or perform any operation that can fail or needs to be undone.

All active setup belongs in a separate `init()` method called explicitly after construction.

```js
// Wrong — constructor doing too much
class SceneEngine {
  constructor(canvas) {
    this._renderer = new Renderer(canvas);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onWindowResize.bind(this));
  }
}

// Right — constructor stores, init() acts
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

---

## RULE JS-D-05 — Construction and activation are always separate concerns

A class may be constructed without being activated. The constructor sets up the object so it is ready to be initialised. Calling `init()` is what actually starts the system. This separation allows:
- Constructing all dependencies before activating any of them
- Controlling initialisation order explicitly in the orchestrator
- Destroying and reinitialising without recreating the object

---

## Decision Tree

```
Does the operation need to remember state after it runs?
├── No  → Use a function
└── Yes → Use a class
           │
           Does setup involve side effects?
           (DOM queries, event listeners, GPU allocation, network calls)
           ├── No  → Constructor can do everything
           └── Yes → Constructor stores only
                     init() does the work
```
