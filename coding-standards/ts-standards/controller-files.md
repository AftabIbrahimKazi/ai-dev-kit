# TS Standards — Controller Files

**Role:** A controller manages a specific subsystem or user interaction on behalf of an engine.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to controller files only.

---

## RULE TS-CT-01 — Controllers do not own the scene

A controller receives typed references to scene objects. It must not create or destroy them.

```ts
// Wrong
class CameraController {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(); // owns it
  }
}

// Right
class CameraController {
  private camera: THREE.PerspectiveCamera;
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera; // receives it
  }
}
```

---

## RULE TS-CT-02 — Controllers communicate upward via typed callbacks

Cross-controller communication must go through the engine or a shared event bus. Callbacks must be typed.

```ts
// Wrong
class InputController {
  onZoom(delta: number) {
    this.cameraController.zoom(delta); // direct sibling call
  }
}

// Right
class InputController {
  private onZoomCallback: (delta: number) => void;
  constructor(onZoom: (delta: number) => void) {
    this.onZoomCallback = onZoom;
  }
  onZoom(delta: number) {
    this.onZoomCallback(delta);
  }
}
```

---

## RULE TS-CT-03 — Controllers implement enable() and disable()

```ts
public enable(): void { window.addEventListener('pointermove', this.onMove); }
public disable(): void { window.removeEventListener('pointermove', this.onMove); }
```
