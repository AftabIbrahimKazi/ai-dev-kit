# CSS Standards — Rule Examples

Code examples moved out of [css-standards.md](../css-standards.md) to keep that file small. The rule text there is authoritative; read the matching section here when applying the rule.

## RULE 11

```
[signature]-[semantic-name]
[signature]-[semantic-name]-[suffix]
```

```css
/* Wrong — no signature, no suffix where needed */
.card-wrapper {}
.hide {}

/* Right — pure UI */
.ex-card-wrapper {}
.ex-text-muted {}

/* Right — JS/TS touched */
.ex-hide-js {}
.ex-display-text-js-ts {}
```

```css
#ex-modal-js {}
#ex-sidebar-ts {}
```

## RULE 18

```html
<!-- Wrong — custom CSS written when framework class exists -->
<div class="ex-flex-center">...</div>

<!-- Right — framework class used first -->
<div class="d-flex align-items-center">...</div>
```

## RULE 19

```html
<!-- Wrong — Bootstrap's .text-truncate uses inline overflow: hidden -->
<p class="text-truncate">...</p>

<!-- Right — write a compliant custom class that achieves the same result -->
<p class="ex-text-truncate">...</p>
```

```css
/* ex-text-truncate in component CSS — no !important, no inline style */
.ex-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

## RULE 20

```css
/* PACKAGE EXCEPTION — Select2 v4
   Violation: injects inline styles for dropdown width
   Decision: accepted — no workaround available
   Reviewed by: [developer] */
.select2-container { ... }
```

## RULE 21

```html
<!-- Wrong — inline style applied by JS -->
<div id="ex-warp-veil"></div>
<script>veil.style.opacity = '1'; veil.style.transition = 'opacity 0.35s ease-in';</script>

<!-- Wrong — state CSS written in a component style block -->
<style is:global>
  #ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity 0.35s ease-in; }
</style>

<!-- Right — markup declares the initial state -->
<div id="ex-warp-veil" data-veil-state="hidden"></div>
```

```css
/* Right — state CSS in a named CSS file */
#ex-warp-veil[data-veil-state="hidden"]    { opacity: 0; }
#ex-warp-veil[data-veil-state="fading-in"] { opacity: 1; transition: opacity var(--ex-duration-veil-in) ease-in; }
```

```ts
/* Right — script updates only the attribute value */
veil.dataset.veilState = 'fading-in';
```
