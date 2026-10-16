// `test` for the PWA specs: every page starts with the data key stored on the device (as after opening the study group's link),
// or, with no key, none (the Magic Key prompt only opens when asked for). unlock.spec.js uses the plain test.
import { test as base, expect } from "@playwright/test";
import { dataKey } from "./data-key.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => {
      try {
        if (key) localStorage.setItem("riglam.dataKey", key);
      } catch { /* storage unavailable */ }
    }, dataKey);
    await use(page);
  },
});
export { expect };
