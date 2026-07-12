# JS Standards — Class / Engine Files

**Role:** A class file defines a stateful system. Classes encapsulate state and the methods that operate on it. An "engine" is a class that owns a major subsystem (renderer, scene, animation loop).

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to class files only.

---

## RULE CL-01 — Classes have a single responsibility

A class owns one system. If a class manages both rendering and input handling, it must be split. The class name must describe exactly what it owns.

---

## RULE CL-02 — Public interface is minimal

Only methods that need to be called from outside the class are `public`. Internal methods are `private`. Expose the smallest API surface needed.

```ts
// Wrong — everything public
class SceneEngine {
  public buildGeometry() { ... }
  public attachLights() { ... }
  public startLoop() { ... }
}

// Right — only the init surface is public
class SceneEngine {
  public init() { ... }
  private buildGeometry() { ... }
  private attachLights() { ... }
}
```

---

## RULE CL-03 — Constructor only assigns, it does not run side effects

The constructor must only assign dependencies and initial values. DOM queries, event listeners, network calls, and render operations belong in an explicit `init()` method.

```ts
// Wrong
class SceneEngine {
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas });
    this.renderer.setSize(window.innerWidth, window.innerHeight); // side effect
    window.addEventListener('resize', this.onResize); // side effect
  }
}

// Right
class SceneEngine {
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  public init() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this.onResize);
  }
}
```

---

## RULE CL-04 — Classes must implement a destroy method

Any class that adds event listeners, starts an animation loop, or allocates GPU/memory resources must implement a `destroy()` method that cleans all of them up.

---

## RULE CL-05 — Static classes are permitted for singletons

If a system should only ever have one instance (e.g. a router, a global event bus), a static class is the correct pattern. Static methods must still be named clearly and follow all other rules.
