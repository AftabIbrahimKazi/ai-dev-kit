# TS Standards — Orchestrator Files

**Role:** An orchestrator is a class that initialises and wires together a set of related subsystems. It owns the dependency graph for its domain. It does not implement behaviour itself — everything it touches is delegated to the classes it instantiates.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to orchestrator files only.

---

## RULE TS-O-01 — Orchestrators initialise, they do not implement

An orchestrator instantiates classes, passes dependencies between them, and stores references. It must contain no business logic, no DOM manipulation, no calculations, and no event handling. All of that belongs in the classes it composes.

```ts
// Wrong — orchestrator doing work itself
class SceneOrchestrator {
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.renderer.setSize(window.innerWidth, window.innerHeight); // logic
    window.addEventListener('resize', () => { ... }); // behaviour
  }
}

// Right — orchestrator only wires
class SceneOrchestrator {
  constructor(canvas: HTMLCanvasElement) {
    this.engine   = new RenderEngine(canvas);
    this.scene    = new SceneBuilder(this.engine);
    this.controls = new ControlManager(this.engine.camera);
  }
}
```

---

## RULE TS-O-02 — Dependencies are injected via constructor with explicit types

An orchestrator receives typed dependencies as constructor parameters. It must not reach into global scope or instantiate dependencies it was not given.

```ts
// Wrong — reaching into global scope
class AnimationOrchestrator {
  constructor() {
    this.objects = window.sceneObjects; // global dependency
  }
}

// Right — injected and typed
class AnimationOrchestrator {
  constructor(objects: SceneObjects) {
    this.playerAnimation = new PlayerAnimation(objects.player);
  }
}
```

---

## RULE TS-O-03 — Subsystems are stored as typed public readonly properties

Every subsystem an orchestrator creates must be stored as a `public readonly` typed property. `readonly` enforces that the orchestrator owns the reference — consumers can read it but cannot reassign it.

```ts
// Wrong — private, hidden behind getter, or untyped
class AnimationOrchestrator {
  private _anim: any;
  get playerAnim() { return this._anim; }
}

// Right — public readonly with explicit type
class AnimationOrchestrator {
  readonly playerAnimation: PlayerAnimation;
  readonly enemyAnimation: EnemyAnimation;

  constructor(objects: SceneObjects) {
    this.playerAnimation = new PlayerAnimation(objects.player);
    this.enemyAnimation  = new EnemyAnimation(objects.enemy);
  }
}
```

---

## RULE TS-O-04 — One orchestrator per domain

Each orchestrator owns one clearly named domain. An orchestrator must not span multiple unrelated domains. If it grows beyond one domain, split it.

---

## RULE TS-O-05 — Orchestrators can nest

A top-level orchestrator may take domain orchestrators as typed dependencies. Each level only knows about the level directly below it.

```ts
class AppOrchestrator {
  readonly engine:     EngineOrchestrator;
  readonly animations: AnimationOrchestrator;
  readonly loop:       RenderLoop;

  constructor(canvas: HTMLCanvasElement) {
    this.engine     = new EngineOrchestrator(canvas);
    this.animations = new AnimationOrchestrator(this.engine.objects);
    this.loop       = new RenderLoop(this.engine, this.animations);
  }
}
```

---

## RULE TS-O-06 — Initialisation order is explicit and top-to-bottom

Dependencies must be instantiated before the things that consume them. The constructor reads top-to-bottom in dependency order.

---

## RULE TS-O-07 — The entry file is the top-level orchestrator

The top-level orchestrator for a page lives in or is called directly from the entry file. It is the single place where the full dependency graph of that page is visible.
