# JS Standards — Naming Conventions

Read [js-standards.md](../js-standards.md) first for global rules. Rules below define naming conventions for all JavaScript files.

---

## RULE JS-N-01 — Variables use camelCase

All variable declarations use camelCase. No exceptions.

```js
// Wrong
const MyValue = 10;
const my_value = 10;

// Right
const myValue = 10;
```

---

## RULE JS-N-02 — Constants use SCREAMING_SNAKE_CASE

Values that are immutable and defined at module scope use SCREAMING_SNAKE_CASE. This includes numeric thresholds, configuration values, lookup maps, and any module-level constant.

```js
// Wrong
const lockPx = 6;
const planetOrder = ['mercury', 'venus'];

// Right
const LOCK_PX = 6;
const PLANET_ORDER = ['mercury', 'venus'];
const PLANET_META = { mercury: { name: 'Mercury' } };
```

---

## RULE JS-N-03 — Functions and methods use camelCase and start with a verb

All functions and methods are named in camelCase. The name must begin with a verb that describes what the function does.

```js
// Wrong
function camera() { ... }
function newAnimation() { ... }

// Right
function updateCamera() { ... }
function initAnimation() { ... }
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

## RULE JS-N-04 — Private properties and methods use underscore prefix

All private properties and methods are prefixed with a single underscore `_` in addition to any access modifier. The underscore makes private members visually identifiable at the call site without relying on an IDE.

```js
// Wrong
this.canvas = null;
setupScene() { ... }

// Right
this._canvas = null;
_setupScene() { ... }
```

---

## RULE JS-N-05 — Boolean variables use is, has, or can prefix

All boolean variables and properties are prefixed with `is`, `has`, or `can` to make their boolean nature immediately clear.

```js
// Wrong
let open = false;
let switching = false;
let dragging = false;

// Right
let isOpen = false;
let isSwitching = false;
let isDragging = false;
```

---

## RULE JS-N-06 — Event handlers use the _on prefix

Methods that respond to events are named with the `_on` prefix followed by the event name in PascalCase. Methods that bind event listeners are named with the `_bind` prefix.

```js
// Wrong
_resize() { ... }
_handleClick() { ... }
attachEvents() { ... }

// Right
_onWindowResize() { ... }
_onScroll() { ... }
_bindMouseMove() { ... }
_bindDoubleClick() { ... }
```

---

## RULE JS-N-07 — Classes use PascalCase with a descriptive suffix

All classes are named in PascalCase. The name must include a suffix that describes the class role. The suffix tells a reader immediately what kind of thing the class is.

```js
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

## RULE JS-N-08 — Parameters use camelCase and are descriptive

Function parameters follow camelCase. Parameter names must describe what they represent — not their type.

```js
// Wrong
function init(c, s, r) { ... }
function focusOnObject(obj, bool) { ... }

// Right
function init(canvas, scene, renderer) { ... }
function focusOnObject(target, isCarousel) { ... }
```
