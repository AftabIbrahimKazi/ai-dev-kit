# JS Standards — Orchestrator Files

**Role:** An orchestrator is a class that initialises and wires together a set of related subsystems. It owns the dependency graph for its domain. It does not implement behaviour itself — everything it touches is delegated to the classes it instantiates.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to orchestrator files only.

---

## RULE JS-O-01 — Orchestrators initialise, they do not implement

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

## RULE JS-O-02 — Dependencies are injected via constructor

An orchestrator receives the resources it needs as constructor parameters. It must not reach into global scope or instantiate dependencies it was not given.

---

## RULE JS-O-03 — Subsystems are stored as public properties

Every subsystem an orchestrator creates must be stored as a public property so consumers can access it directly without going through getters or methods.

```js
// Wrong — hidden behind a getter
class AnimationOrchestrator {
  constructor(objects) {
    this._anim = new PlayerAnimation(objects.player);
  }
  get playerAnim() { return this._anim; }
}

// Right — directly accessible
class AnimationOrchestrator {
  constructor(objects) {
    this.playerAnimation = new PlayerAnimation(objects.player);
    this.enemyAnimation  = new EnemyAnimation(objects.enemy);
  }
}
```

---

## RULE JS-O-04 — One orchestrator per domain

Each orchestrator owns one clearly named domain (graphics, animations, controllers, audio, etc.). An orchestrator must not span multiple unrelated domains. If it grows beyond one domain, split it.

---

## RULE JS-O-05 — Orchestrators can nest

A top-level orchestrator may take domain orchestrators as dependencies. This creates a hierarchy: top-level → domain → subsystem. Each level only knows about the level directly below it.

```js
// Top-level wires domain orchestrators together
class AppOrchestrator {
  constructor(canvas) {
    this.engine     = new EngineOrchestrator(canvas);
    this.animations = new AnimationOrchestrator(this.engine.objects);
    this.loop       = new RenderLoop(this.engine, this.animations);
  }
}
```

---

## RULE JS-O-06 — Initialisation order is explicit and top-to-bottom

Dependencies must be instantiated before the things that consume them. The constructor reads top-to-bottom in dependency order. No reordering that makes the dependency flow implicit.

---

## RULE JS-O-07 — The entry file is the top-level orchestrator

The top-level orchestrator for a page lives in or is called directly from the entry file. It is the single place where the full dependency graph of that page is visible.
