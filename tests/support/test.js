// `test` for the PWA specs: every page starts with the Magic Key stored on the device (as after opening the study group's link)
// and a stand-in server that accepts it (tests/support/data-key.js). unlock.spec.js uses the plain test.
import { test as base, expect } from "@playwright/test";
import { dataKey, serveCourse, KEY_STORE, withCourse } from "./data-key.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(([store, key]) => {
      try {
        if (key) localStorage.setItem(store, key);
      } catch { /* storage unavailable */ }
    }, [KEY_STORE, withCourse ? dataKey : null]);
    await serveCourse(page);
    await use(page);
  },
});
export { expect };
