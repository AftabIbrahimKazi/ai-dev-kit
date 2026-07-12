# JS Standards — Controller Files

**Role:** A controller manages a specific subsystem or user interaction on behalf of an engine.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to controller files only.

---

## RULE JS-CT-01 — Controllers do not own the scene

A controller receives references to scene objects. It must not create or destroy them.

```js
// Wrong
class CameraController {
  constructor() {
    this.camera = new Camera(); // owns it
  }
}

// Right
class CameraController {
  constructor(camera) {
    this.camera = camera; // receives it
  }
}
```

---

## RULE JS-CT-02 — Controllers communicate upward via callbacks

A controller must not directly call methods on sibling controllers. Cross-controller communication goes through the engine or a shared event bus.

---

## RULE JS-CT-03 — Controllers implement enable() and disable()

Controllers that respond to user input must have `enable()` and `disable()` methods that add and remove their event listeners respectively.
