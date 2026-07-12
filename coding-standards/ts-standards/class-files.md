# TS Standards — Class / Engine Files

**Role:** A class file defines a stateful system with explicit typed interfaces. An engine is a class that owns a major subsystem.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to class files only.

---

## RULE TS-CL-01 — Classes have a single responsibility

A class owns one system. The class name must describe exactly what it owns.

---

## RULE TS-CL-02 — Public interface is minimal and explicitly typed

Only methods that need to be called from outside the class are `public`. All others are `private`. Every public method must have explicit parameter and return types.

```ts
// Wrong
class SceneEngine {
  buildGeometry() { ... }
  attachLights() { ... }
  startLoop() { ... }
}

// Right
class SceneEngine {
  public init(): void { ... }
  private buildGeometry(): void { ... }
  private attachLights(): void { ... }
}
```

---

## RULE TS-CL-03 — Constructor only assigns, it does not run side effects

The constructor assigns typed dependencies and initial values only. DOM queries, event listeners, and render operations belong in an explicit `init()` method.

```ts
// Wrong
class SceneEngine {
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    window.addEventListener('resize', this.onResize); // side effect
  }
}

// Right
class SceneEngine {
  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  public init(): void {
    this.renderer = new Renderer(this.canvas);
    window.addEventListener('resize', this.onResize);
  }
}
```

---

## RULE TS-CL-04 — Classes must implement a destroy method

Any class that adds event listeners, starts an animation loop, or allocates GPU/memory resources must implement `destroy(): void`.

---

## RULE TS-CL-05 — Static classes are permitted for singletons

If a system should only ever have one instance, a static class is correct. All static methods must still carry explicit types.
