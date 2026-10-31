import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/", "src/pwa/fonts/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, __APP_VERSION__: "readonly" } },
  },
  {
    // TypeScript: the recommended rules; the compiler (npm run typecheck) does the type checking.
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // the stored shapes are typed module by module; tightened as they are
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
    },
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
    files: ["scripts/social/*.js"], // runs in the page of scripts/make-social.mjs
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser } },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
]);
