import js from "@eslint/js";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";

const stylisticRules = {
  "@stylistic/indent": ["error", 2, { SwitchCase: 1 }],
  "@stylistic/quotes": [
    "error",
    "double",
    { avoidEscape: true, allowTemplateLiterals: "always" },
  ],
  "@stylistic/semi": ["error", "always"],
  "@stylistic/comma-dangle": ["error", "always-multiline"],
  "@stylistic/no-trailing-spaces": "error",
  "@stylistic/eol-last": ["error", "always"],
  "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],
  "@stylistic/object-curly-spacing": ["error", "always"],
  "@stylistic/array-bracket-spacing": ["error", "never"],
  "@stylistic/space-before-blocks": ["error", "always"],
  "@stylistic/keyword-spacing": ["error", { before: true, after: true }],
  "@stylistic/space-infix-ops": "error",
  "@stylistic/arrow-spacing": ["error", { before: true, after: true }],
  "@stylistic/comma-spacing": ["error", { before: false, after: true }],
  "@stylistic/nonblock-statement-body-position": ["error", "below"],
};

export default [
  {
    ignores: ["node_modules/**"],
  },
  js.configs.recommended,
  {
    plugins: { "@stylistic": stylistic },
    rules: stylisticRules,
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Browser-side landing page served from public/.
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser },
    },
  },
];
