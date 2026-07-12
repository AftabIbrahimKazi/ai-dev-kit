# TS Standards — Entry Files

**Role:** An entry file is the single boot point for a page or feature. It imports and initialises all systems. It does not contain logic itself.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to entry files only.

---

## RULE TS-E-01 — Entry files only initialise, they do not implement

An entry file calls constructors and `init()` methods only. No loops, conditionals, DOM queries, or business logic.

```ts
// Wrong
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
  canvas.width = window.innerWidth;
});

// Right
import { SceneEngine } from './SceneEngine';
SceneEngine.init();
```

---

## RULE TS-E-02 — One entry file per page

Each routable page has exactly one entry file. Entry files are not shared between pages.

---

## RULE TS-E-03 — Entry files must be processed by the build tool

Entry files must be imported through the framework's build pipeline, not loaded via raw `<script src>` tags.
