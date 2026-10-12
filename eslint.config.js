import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/", "legacy/", "tests/legacy/", "test-results/", "playwright-report/", "src/pwa/fonts/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, __APP_VERSION__: "readonly" } },
  },
  {
    // The page code was written as one artifact script; empty catch blocks are its deliberate way to ignore
    // storage failures, and a few leftovers are tracked as warnings instead of blocking CI.
    rules: {
      "no-empty": "off", // also used for side-effect-only branches: else if(adoptPair(...)){}
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "*.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
];
