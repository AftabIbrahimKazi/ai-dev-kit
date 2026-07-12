# JS Standards — Class / Engine Files

**Role:** A class file defines a stateful system. An engine is a class that owns a major subsystem.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to class files only.

---

## RULE JS-CL-01 — Classes have a single responsibility

A class owns one system. If a class manages more than one concern, split it. The class name must describe exactly what it owns.

---

## RULE JS-CL-02 — Constructor only assigns, it does not run side effects

The constructor assigns dependencies and initial values only. DOM queries, event listeners, and render operations belong in an explicit `init()` method.

```js
// Wrong
class SceneEngine {
  constructor(canvas) {
    this.renderer = new Renderer(canvas);
    window.addEventListener('resize', this.onResize); // side effect
  }
}

// Right
class SceneEngine {
  constructor(canvas) {
    this.canvas = canvas;
  }
  init() {
    this.renderer = new Renderer(this.canvas);
    window.addEventListener('resize', this.onResize.bind(this));
  }
}
```

---

## RULE JS-CL-03 — Classes must implement a destroy method

Any class that adds event listeners, starts an animation loop, or allocates resources must implement `destroy()` to clean them up.

---

## RULE JS-CL-04 — Static classes are permitted for singletons

If a system should only ever have one instance, a static class is the correct pattern.
