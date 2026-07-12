# JS + TS Standards — Naming Conventions

Read [js-and-ts-standards.md](../js-and-ts-standards.md) first for global rules. Rules below define naming conventions for all JavaScript and TypeScript files in a combined project.

The conventions are identical across `.js` and `.ts` files. The only difference is that `.ts` files add explicit type annotations. Where a rule has a TS-specific addition it is marked.

---

## RULE JT-N-01 — Variables use camelCase

All variable declarations use camelCase in both `.js` and `.ts` files.

```ts
// Wrong
const MyValue = 10;
const my_value = 10;

// Right
const myValue = 10;
const myValue: number = 10; // TS — with type annotation
```

---

## RULE JT-N-02 — Constants use SCREAMING_SNAKE_CASE

Immutable module-scope values use SCREAMING_SNAKE_CASE in both `.js` and `.ts` files.

```ts
// Wrong
const lockPx = 6;

// Right — JS
const LOCK_PX = 6;
const PLANET_ORDER = ['mercury', 'venus'];

// Right — TS
const LOCK_PX = 6 as const;
const PLANET_ORDER: string[] = ['mercury', 'venus'];
const PLANET_META: Record<string, { name: string }> = { mercury: { name: 'Mercury' } };
```

---

## RULE JT-N-03 — Functions and methods use camelCase and start with a verb

All functions and methods use camelCase. The name must begin with a verb. In `.ts` files return types must be explicitly declared.

```ts
// Wrong
function camera() { ... }

// Right — JS
function updateCamera() { ... }

// Right — TS
function updateCamera(): void { ... }
```

**Approved verb prefixes:**

| Verb | Use for |
|---|---|
| `init` | Starting up or bootstrapping a system |
| `setup` | Configuring or preparing something |
| `build` | Constructing or assembling something |
| `update` | Changing the current state of something |
| `bind` | Attaching event listeners |
| `reset` | Returning to a default state |
| `focus` | Directing attention to an element or object |
| `navigate` | Moving between states, pages, or items |
| `inject` | Inserting content or data into something |
| `open` / `close` | Showing or hiding an interface element |
| `get` | Retrieving a value (pure, no side effects) |
| `set` | Assigning a value |
| `handle` / `on` | Responding to an event |

---

## RULE JT-N-04 — Private properties and methods use underscore prefix

All private properties and methods use a single underscore `_` prefix. In `.ts` files the `private` keyword is used alongside the underscore — both together, never one without the other.

```js
// JS — underscore prefix
this._canvas = null;
_setupScene() { ... }
```

```ts
// TS — underscore + private keyword together
private _canvas: HTMLCanvasElement | null = null;
private _setupScene(): void { ... }

// Wrong in TS — one without the other
private canvas: HTMLCanvasElement | null = null;
_canvas: HTMLCanvasElement | null = null;
```

---

## RULE JT-N-05 — Boolean variables use is, has, or can prefix

All boolean variables and properties use `is`, `has`, or `can` as a prefix in both `.js` and `.ts` files.

```ts
// Wrong
let open = false;
private switching: boolean = false;

// Right — JS
let isOpen = false;
this._isSwitching = false;

// Right — TS
private _isOpen: boolean = false;
private _isSwitching: boolean = false;
```

---

## RULE JT-N-06 — Event handlers use the _on prefix

Methods that respond to events use `_on` prefix. Methods that attach event listeners use `_bind` prefix. Both in `.js` and `.ts`.

```ts
// Wrong
_resize() { ... }
attachEvents() { ... }

// Right
_onWindowResize() { ... }
_onScroll() { ... }
_bindMouseMove() { ... }
_bindDoubleClick() { ... }
```

---

## RULE JT-N-07 — Classes use PascalCase with a descriptive suffix

All classes use PascalCase with a suffix that describes the class role. Same in `.js` and `.ts`.

**Approved class suffixes:**

| Suffix | Role |
|---|---|
| `Engine` | Core orchestrator that owns a major system |
| `Manager` | Domain orchestrator that groups related subsystems |
| `Controller` | Manages a specific behaviour or interaction |
| `Animation` | Drives animation for a specific subject |
| `Scene` | Owns and builds a Three.js or canvas scene |
| `Router` | Manages navigation or routing |
| `Transition` | Manages an animated transition between states |
| `Loader` | Responsible for loading assets or data |
| `Observer` | Watches for changes and reacts |

---

## RULE JT-N-08 — Parameters use camelCase and are descriptive

Parameter names describe what the value represents — not its type. In `.ts` files all parameters carry an explicit type annotation.

```ts
// Wrong
function init(c, s, r) { ... }
function focusOnObject(obj, bool) { ... }

// Right — JS
function init(canvas, scene, renderer) { ... }

// Right — TS
function init(canvas: HTMLCanvasElement, scene: Scene, renderer: Renderer): void { ... }
function focusOnObject(target: Object3D, isCarousel: boolean): void { ... }
```

---

## TS-Only Naming Rules

---

## RULE JT-N-09 — Interfaces use PascalCase with no I prefix

```ts
// Wrong
interface IAnimation { ... }

// Right
interface Animation { update(delta: number): void; }
interface ScrollCameraConfig { planetKey: string; waypoints: Waypoint[]; }
```

---

## RULE JT-N-10 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }

// Right
enum Direction { LEFT = 'LEFT', RIGHT = 'RIGHT' }
```
