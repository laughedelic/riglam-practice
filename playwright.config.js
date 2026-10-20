import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The legacy page tests use random pairs; a check or two can be flaky, so a failing file is run once more.
  retries: 1,
  workers: process.env.CI ? 2 : 3,
  // CI writes no HTML report and no traces: both record page content and step arguments (URLs, typed text), which can include the course definitions and the data key (ci.yml).
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  // No motion by default: panels that slide would leave a copy of themselves for a moment (src/app/shell/motion.js) and a step would have to wait for it; the motion
  // specs (tests/e2e/pwa/motion.spec.js) ask for it.
  use: { baseURL: `http://localhost:${PORT}`, trace: process.env.CI ? "off" : "retain-on-failure", reducedMotion: "reduce" },
  // The PWA specs run against the production build served by `vite preview`; `npm run build` comes first.
  webServer: {
    command: `npm run preview -- --strictPort --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "legacy", testMatch: /legacy\.spec\.js/ },
    // the layout matrix: the artifact build with a mocked `window.claude`, one test per size, flow and pair; sizes are set in the spec
    { name: "layout", testMatch: /layout\/.*\.spec\.js/ },
    { name: "pwa-desktop", testMatch: /pwa\/.*\.spec\.js/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "pwa-phone", testMatch: /pwa\/.*\.spec\.js/, use: { ...devices["Pixel 7"] } },
  ],
});
