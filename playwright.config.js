import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The legacy page tests use random pairs; a check or two can be flaky, so a failing file is run once more.
  retries: 1,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  // The PWA specs run against the production build served by `vite preview`; `npm run build` comes first.
  webServer: {
    command: `npm run preview -- --strictPort --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "legacy", testMatch: /legacy\.spec\.js/ },
    { name: "pwa-desktop", testMatch: /pwa\/.*\.spec\.js/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "pwa-phone", testMatch: /pwa\/.*\.spec\.js/, use: { ...devices["Pixel 7"] } },
  ],
});
