# TS Standards — Naming Conventions

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below define naming conventions for all TypeScript files.

---

## RULE TS-N-01 — Variables use camelCase

All variable declarations use camelCase. No exceptions.

```ts
// Wrong
const MyValue: number = 10;
const my_value: number = 10;

// Right
const myValue: number = 10;
```

---

## RULE TS-N-02 — Constants use SCREAMING_SNAKE_CASE

Immutable module-scope values use SCREAMING_SNAKE_CASE. This includes numeric thresholds, configuration values, lookup maps, and typed constants.

```ts
// Wrong
const lockPx = 6;
const planetOrder = ['mercury', 'venus'];

// Right
const LOCK_PX = 6;
const PLANET_ORDER: string[] = ['mercury', 'venus'];
const PLANET_META: Record<string, { name: string }> = { mercury: { name: 'Mercury' } };
```

---

## RULE TS-N-03 — Functions and methods use camelCase and start with a verb

All functions and methods are named in camelCase. The name must begin with a verb that describes what the function does. Return types must be explicitly declared.

```ts
// Wrong
function camera(): void { ... }
function newAnimation(): void { ... }

// Right
function updateCamera(): void { ... }
function initAnimation(): void { ... }
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

## RULE TS-N-04 — Private properties and methods use underscore prefix plus private keyword

All private properties and methods use both the `private` keyword and a single underscore `_` prefix. The `private` keyword enforces access at the compiler level. The underscore makes private members visually identifiable at the call site without relying on an IDE.

```ts
// Wrong — private keyword only
private canvas: HTMLCanvasElement | null = null;
private setupScene(): void { ... }

// Wrong — underscore only
_canvas: HTMLCanvasElement | null = null;
_setupScene(): void { ... }

// Right — both together
private _canvas: HTMLCanvasElement | null = null;
private _setupScene(): void { ... }
```

---

## RULE TS-N-05 — Boolean variables use is, has, or can prefix

All boolean variables and properties are prefixed with `is`, `has`, or `can`.

```ts
// Wrong
private open: boolean = false;
private switching: boolean = false;

// Right
private _isOpen: boolean = false;
private _isSwitching: boolean = false;
```

---

## RULE TS-N-06 — Event handlers use the _on prefix

Methods that respond to events use the `_on` prefix followed by the event name in PascalCase. Methods that attach event listeners use the `_bind` prefix.

```ts
// Wrong
private _resize(): void { ... }
private _handleClick(): void { ... }

// Right
private _onWindowResize(): void { ... }
private _onScroll(): void { ... }
private _bindMouseMove(): void { ... }
private _bindDoubleClick(): void { ... }
```

---

## RULE TS-N-07 — Classes use PascalCase with a descriptive suffix

All classes use PascalCase. The name must include a suffix that describes the class role.

```ts
// Wrong
class Planets { ... }
class CamControl { ... }

// Right
class BasePlanet { ... }
class CameraController { ... }
```

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

## RULE TS-N-08 — Parameters use camelCase and are descriptive with explicit types

Function parameters follow camelCase. Parameter names must describe what they represent — not their type. All parameters must carry an explicit type annotation.

```ts
// Wrong
function init(c: HTMLCanvasElement, s: Scene, r: Renderer): void { ... }
function focusOnObject(obj: Object3D, bool: boolean): void { ... }

// Right
function init(canvas: HTMLCanvasElement, scene: Scene, renderer: Renderer): void { ... }
function focusOnObject(target: Object3D, isCarousel: boolean): void { ... }
```

---

## RULE TS-N-09 — Interfaces use PascalCase with no I prefix

Interface names use PascalCase. The `I` prefix convention (e.g. `IAnimation`) is not used.

```ts
// Wrong
interface IAnimation { update(delta: number): void; }

// Right
interface Animation { update(delta: number): void; }
interface ScrollCameraConfig { planetKey: string; waypoints: Waypoint[]; }
```

---

## RULE TS-N-10 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }
enum Status { Open, Closed }

// Right
enum Direction { LEFT = 'LEFT', RIGHT = 'RIGHT' }
enum OverlayStatus { OPEN = 'open', CLOSED = 'closed' }
```
