# JS Standards — Controller Files

**Role:** A controller manages a specific subsystem or user interaction on behalf of an engine. It receives a reference to the resources it needs (scene, camera, DOM elements) and is responsible for one behaviour domain (e.g. camera movement, user input, scroll).

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to controller files only.

---

## RULE CT-01 — Controllers do not own the scene

A controller receives a reference to scene objects (camera, renderer, etc.). It must not create or destroy them. Ownership stays with the engine that instantiated the controller.

```ts
// Wrong
class CameraController {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(...); // owns the camera
  }
}

// Right
class CameraController {
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera; // receives it
  }
}
```

---

## RULE CT-02 — Controllers communicate upward via callbacks or events

A controller must not directly call methods on sibling controllers. Cross-controller communication must go through the engine or a shared event bus.

```ts
// Wrong
class InputController {
  onZoom() {
    this.cameraController.zoom(delta); // direct sibling call
  }
}

// Right
class InputController {
  onZoom() {
    this.onZoomCallback(delta); // callback provided by engine
  }
}
```

---

## RULE CT-03 — Controllers implement enable() and disable()

Controllers that respond to user input must have `enable()` and `disable()` methods that add and remove their event listeners respectively, so they can be toggled by the engine without being destroyed.
