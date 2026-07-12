/* Stylelint enforcement for coding-standards/css-standards.md
   Machine-checkable rules are enforced here so violations cannot be
   committed; judgement rules remain in the standards docs.

   Install:  npm i -D stylelint stylelint-order
   Run:      npx stylelint "public/css/**/*.css" --config coding-standards/tooling/stylelint.config.cjs
   (Adjust the glob to the project's CSS location; wire into pre-commit/CI.)

   Rule map — every entry cites the standard it enforces. */

module.exports = {
  plugins: ['stylelint-order'],
  rules: {
    /* RULE 12 — properties ordered alphabetically */
    'order/properties-alphabetical-order': true,

    /* RULE 14 — no !important, anywhere */
    'declaration-no-important': true,

    /* RULE 04 — font weights numeric only */
    'font-weight-notation': 'numeric',

    /* RULE 13 — shorthand always (base rules).
       The media-query carve-out for single-side overrides cannot be
       expressed in stylelint; longhand inside @media is therefore not
       flagged. Longhand groups outside media queries are. */
    'declaration-block-no-redundant-longhand-properties': true,

    /* RULE 10 — colors only from tokens (component/layout/overlay files).
       Token file is exempted via overrides below. */
    'color-no-hex': true,
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab'],

    /* RULE 05 — line-height only via leading tokens
       (body class + heading rules; value must be a --leading-* token) */
    'declaration-property-value-allowed-list': {
      'line-height': ['/^var\\(--(ex-)?leading-/'],
    },

    /* RULE 15 hygiene helpers */
    'declaration-block-no-duplicate-properties': true,
    'no-duplicate-selectors': true,
    'block-no-empty': true,

    /* RULE 23 — native nesting banned (flat selectors) */
    'selector-max-compound-selectors': 4,
    'max-nesting-depth': [
      0,
      { ignore: ['blockless-at-rules'], ignoreAtRules: ['media', 'container', 'layer', 'supports'] },
    ],
  },

  overrides: [
    {
      /* Token file — the one place raw color values are legal (RULES 01, 10, 23).
         Adjust the pattern to the project's token file name. */
      files: ['**/variables.css', '**/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
};
