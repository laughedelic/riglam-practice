// `test` for the PWA specs: every page starts with the data key stored on the device (as after opening the study group's link),
// or, with no key, with the unlock dialog already dismissed so that it does not cover the page. unlock.spec.js uses the plain test.
import { test as base, expect } from "@playwright/test";
import { dataKey } from "./data-key.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => {
      try {
        if (key) localStorage.setItem("riglam.dataKey", key);
        else sessionStorage.setItem("riglam.unlockDismissed", "1");
      } catch { /* storage unavailable */ }
    }, dataKey);
    await use(page);
  },
});
export { expect };
