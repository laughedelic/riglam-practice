// Unit tests: logic, data files and build outputs, no browser. The browser tests are Playwright's (playwright.config.js).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
