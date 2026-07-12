# TS Standards — Type Definition Files

**Role:** A type file defines TypeScript interfaces, types, and enums shared across the codebase. It contains no runtime code.

Read [ts-standards.md](../ts-standards.md) first for global rules. Rules below are specific to type files only.

---

## RULE TS-TY-01 — Type files contain no runtime code

Only `interface`, `type`, `enum`, and `const enum` declarations. No functions, classes, or variable assignments with runtime values.

---

## RULE TS-TY-02 — Prefer interface over type for object shapes

```ts
// Wrong
type UserConfig = { name: string; age: number; };

// Right
interface UserConfig { name: string; age: number; }
type Status = 'idle' | 'loading' | 'error';
```

---

## RULE TS-TY-03 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }

// Right
enum Direction { LEFT = 'LEFT', RIGHT = 'RIGHT' }
```

---

## RULE TS-TY-04 — No duplicate type definitions

If a type is used in more than one file it must be defined here and imported everywhere it is needed.

---

## RULE TS-TY-05 — Export every declaration

All types, interfaces, and enums in a type file must be exported. Private/internal types belong in the file that uses them.
