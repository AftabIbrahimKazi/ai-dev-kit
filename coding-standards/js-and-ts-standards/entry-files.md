# JS Standards — Entry Files

**Role:** An entry file is the single boot point for a page or feature. It imports and initialises all systems needed for that page. It does not contain logic itself — it delegates everything to classes, controllers, and utilities.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to entry files only.

---

## RULE E-01 — Entry files only initialise, they do not implement

An entry file calls constructors and `init()` methods. It must not contain loops, conditionals, DOM queries, or business logic. All of that belongs in the classes and controllers it boots.

```ts
// Wrong
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.querySelector('#canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    // ... more logic
  }
});

// Right
import { SceneEngine } from './SceneEngine';
SceneEngine.init();
```

---

## RULE E-02 — One entry file per page

Each routable page has exactly one entry file. Entry files are not shared between pages.

---

## RULE E-03 — Entry files must be processed by the build tool

Entry files must be imported through the framework's build pipeline. They must not be loaded via raw `<script src>` tags.
