# JS + TS Standards — Orchestrator Files

**Role:** An orchestrator is a class that initialises and wires together a set of related subsystems. It owns the dependency graph for its domain. It does not implement behaviour itself — everything it touches is delegated to the classes it instantiates.

Read [js-and-ts-standards.md](../js-and-ts-standards.md) first for global rules. Rules below are specific to orchestrator files only.

---

## RULE JT-O-01 — Orchestrators initialise, they do not implement

An orchestrator instantiates classes, passes dependencies between them, and stores references. It must contain no business logic, no DOM manipulation, no calculations, and no event handling. All of that belongs in the classes it composes.

```js
// Wrong — orchestrator doing work itself
class SceneOrchestrator {
  constructor(canvas) {
    this.renderer = new Renderer(canvas);
    this.renderer.setSize(window.innerWidth, window.innerHeight); // logic
    window.addEventListener('resize', () => { ... }); // behaviour
  }
}

// Right — orchestrator only wires
class SceneOrchestrator {
  constructor(canvas) {
    this.engine   = new RenderEngine(canvas);
    this.scene    = new SceneBuilder(this.engine);
    this.controls = new ControlManager(this.engine.camera);
  }
}
```

---

## RULE JT-O-02 — Dependencies are injected via constructor

An orchestrator receives the resources it needs as constructor parameters. It must not reach into global scope or instantiate dependencies it was not given. In `.ts` files all parameters must be explicitly typed.

---

## RULE JT-O-03 — Subsystems are stored as public properties

Every subsystem an orchestrator creates must be stored as a public property. In `.ts` files these must be `public readonly` with an explicit type.

```js
// JS — public property
class AnimationOrchestrator {
  constructor(objects) {
    this.playerAnimation = new PlayerAnimation(objects.player);
    this.enemyAnimation  = new EnemyAnimation(objects.enemy);
  }
}
```

```ts
// TS — public readonly with explicit type
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

## RULE JT-O-04 — One orchestrator per domain

Each orchestrator owns one clearly named domain. An orchestrator must not span multiple unrelated domains. If it grows beyond one domain, split it.

---

## RULE JT-O-05 — Orchestrators can nest

A top-level orchestrator may take domain orchestrators as dependencies. Each level only knows about the level directly below it.

```js
class AppOrchestrator {
  constructor(canvas) {
    this.engine     = new EngineOrchestrator(canvas);
    this.animations = new AnimationOrchestrator(this.engine.objects);
    this.loop       = new RenderLoop(this.engine, this.animations);
  }
}
```

---

## RULE JT-O-06 — Initialisation order is explicit and top-to-bottom

Dependencies must be instantiated before the things that consume them. The constructor reads top-to-bottom in dependency order.

---

## RULE JT-O-07 — The entry file is the top-level orchestrator

The top-level orchestrator for a page lives in or is called directly from the entry file. It is the single place where the full dependency graph of that page is visible.

---

## RULE JT-O-08 — Orchestrator files must not mix JS and TS

An orchestrator file must be entirely `.js` or entirely `.ts`. A `.js` orchestrator must not import from `.ts` files. A `.ts` orchestrator may only import from other `.ts` files or compiled JS packages.
