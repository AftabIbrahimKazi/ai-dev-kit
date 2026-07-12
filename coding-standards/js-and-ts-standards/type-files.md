# JS Standards — Type Definition Files

**Role:** A type file defines TypeScript interfaces, types, and enums that are shared across the codebase. Type files contain no runtime code.

Read [js-standards.md](../js-standards.md) first for global rules. Rules below are specific to type definition files only.

---

## RULE TY-01 — Type files contain no runtime code

A type file must only contain `interface`, `type`, `enum`, and `const enum` declarations. No functions, classes, or variable assignments with runtime values.

---

## RULE TY-02 — Prefer interface over type for object shapes

Use `interface` to define the shape of an object. Use `type` for unions, intersections, and aliases of primitives.

```ts
// Wrong
type UserConfig = {
  name: string;
  age: number;
};

// Right
interface UserConfig {
  name: string;
  age: number;
}

// Right — type is correct for unions
type Status = 'idle' | 'loading' | 'error';
```

---

## RULE TY-03 — Enums use PascalCase names and SCREAMING_SNAKE values

```ts
// Wrong
enum direction { left, right }

// Right
enum Direction {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}
```

---

## RULE TY-04 — No duplicate type definitions

If a type is used in more than one file, it must be defined in a type file and imported everywhere it is needed. Never copy-paste a type definition.
