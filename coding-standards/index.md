# Coding Standards — Index

## Purpose

This folder contains the complete coding standards for this project. These standards are **universal** — they are framework-agnostic and portable across projects. Framework-specific rules live in the `frameworks/` layer and sit on top of the universal rules without contradicting them.

Both humans and AI must read and follow these standards to the letter.

---

## How to Read This System

The standards are organised in three layers. Always read from the top layer down:

### Layer 1 — Universal Global Rules
Each standard file at the root of `coding-standards/` defines global laws for that discipline. These apply to **every file of that type**, regardless of framework or project.

### Layer 2 — Universal File-Type Rules
Each standard file has a matching subfolder containing partials. Each partial defines laws specific to a **role/type** of file within that discipline.

### Layer 3 — Framework Rules
The `frameworks/` folder contains framework-specific additions or overrides. A framework file may extend a universal rule (add implementation detail) or override it (with an explicit note). Framework files mirror the same subfolder structure as the universal standards.

---

## Reading Order (per file you are editing)

1. Open `coding-standards/index.md` — understand the system (this file)
2. Open the relevant `{discipline}-standards.md` — read global laws for that discipline
3. Open the relevant `{discipline}-standards/{file-role}.md` — read laws for that file type
4. Check `frameworks/{framework}.md` — read framework-level additions/overrides
5. Check `frameworks/{framework}/{file-role}.md` — read framework + file-type specific rules
6. Check the project's own `CLAUDE.md` or `handover.md` — apply project-specific context (file names, prefixes, conventions)

---

## QA Is an Umbrella, Not One File

QA spans several unrelated concerns (definition of done, branch gates, logic
checks, security, E2E testing, bug reporting) rather than varying by file
role like CSS/HTML/script do. It follows its own index pattern rather than
the file-role-subfolder pattern above — see [qa/index.md](qa/index.md) for
its reading order and rule-ID scheme. Any standard that grows past a single
flat file (multiple unrelated concerns, not multiple file roles) should
follow this same index-plus-siblings shape rather than the file-role
subfolder shape.

---

## Script Standard Selection

A project uses exactly one script standard. The project's `CLAUDE.md` or `handover.md` declares which applies.

| Project uses | Standard to read |
|---|---|
| JavaScript only | `js-standards.md` + `js-standards/` partials |
| TypeScript only | `ts-standards.md` + `ts-standards/` partials |
| JS and TS together | `js-and-ts-standards.md` + `js-and-ts-standards/` partials |

Each standard is standalone. Never read more than one script standard at a time.

---

## File-to-Role Mapping

When editing a file, identify its role first, then load the correct partial from whichever script standard applies to this project.

**CSS roles:**

| File Role | Description | Partial |
|---|---|---|
| Token file | Defines design tokens / CSS variables | `css-standards/token-files.md` |
| Layout file | Controls page/structural layout | `css-standards/layout-files.md` |
| Component file | Scoped styles for a reusable UI component | `css-standards/component-files.md` |
| Overlay file | Scoped styles for modals, panels, drawers | `css-standards/overlay-files.md` |
| Utility file | Helper/atomic classes | `css-standards/utility-files.md` |

**HTML roles:**

| File Role | Description | Partial |
|---|---|---|
| Layout template | Wrapping page shell (head, slots) | `html-standards/layout-templates.md` |
| Page file | A routable page | `html-standards/page-files.md` |
| Component markup | Reusable HTML fragment | `html-standards/component-files.md` |

**Script roles** (read from the active script standard folder):

| File Role | Description | Partial |
|---|---|---|
| Entry script | Boots/initialises the application | `{script-standard}/entry-files.md` |
| Orchestrator | Initialises and wires subsystems, owns the dependency graph for a domain | `{script-standard}/orchestrator-files.md` |
| Class / Engine | A stateful class or system | `{script-standard}/class-files.md` |
| Controller | Manages a subsystem or interaction | `{script-standard}/controller-files.md` |
| Preset | Parameterised, reusable class or function for a repeating use case | `{script-standard}/preset-files.md` |
| Utility / Helper | Pure functions, shared logic | `{script-standard}/utility-files.md` |
| Type definitions | Interfaces, types, enums (TS and JS+TS only) | `{script-standard}/type-files.md` |

**Cross-cutting references (read for any script file):**

| Reference | Covers | File |
|---|---|---|
| Naming conventions | Variables, functions, classes, events, constants | `{script-standard}/naming-conventions.md` |
| Decisions | When to use a function, class, or constructor | `{script-standard}/decisions.md` |

---

## Standards Files

| File | Covers |
|---|---|
| [css-standards.md](css-standards.md) | Global CSS laws |
| [html-standards.md](html-standards.md) | Global HTML/markup laws |
| [js-standards.md](js-standards.md) | JS only projects |
| [ts-standards.md](ts-standards.md) | TS only projects |
| [js-and-ts-standards.md](js-and-ts-standards.md) | JS + TS combined projects |
| [git-standards.md](git-standards.md) | Commit, branch, and PR conventions |
| [versioning-standards.md](versioning-standards.md) | Package and changelog versioning |
| [seo-standards.md](seo-standards.md) | SEO — titles, meta, structure, schema |
| [performance-standards.md](performance-standards.md) | Performance — assets, scripts, CSS, Core Web Vitals |
| [accessibility-standards.md](accessibility-standards.md) | Accessibility — WCAG 2.1 AA, keyboard, ARIA, contrast |
| [qa/index.md](qa/index.md) | QA umbrella — definition of done, branch gates, logic/error checks, security, E2E testing, bug reporting |
| [ai-standards.md](ai-standards.md) | AI behaviour — hallucination detection, token efficiency |
| [frameworks/astro.md](frameworks/astro.md) | Astro-specific additions and overrides |
| [frameworks/bootstrap.md](frameworks/bootstrap.md) | Bootstrap conflicts, violations, and workarounds |
| [frameworks/strata-css.md](frameworks/strata-css.md) | Strata CSS — mandatory utility-first framework, coverage discipline |
| [tooling/](tooling/README.md) | Machine enforcement — lint configs that enforce the checkable rules |

---

## Override Notation

When a framework file overrides a universal rule, it must state this explicitly:

```
OVERRIDES [filename] RULE [number]
Reason: [why the framework requires a different approach]
```

A rule that is merely extended (implementation detail added) does not need override notation.

---

## Principles

- **Universal rules define intent. Framework rules define implementation.**
- **Rules must be testable.** If you cannot verify a rule by reading the code, rewrite it.
- **Rules must be declarative.** State what is required, not what is preferred.
- **Wrong/right examples are mandatory** wherever a rule could be misread.
- **No rule may conflict with another** at the same layer. Conflicts between layers must use override notation.
