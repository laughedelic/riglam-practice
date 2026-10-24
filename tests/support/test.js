// `test` for the PWA specs: every page starts with the Magic Key stored on the device (as after opening the study group's link)
// and a stand-in server that accepts it (tests/support/data-key.js). unlock.spec.js uses the plain test. The tutor does not explain a checked
// answer by itself here (Options, `rd-autoexplain`): the specs click Explain, and the ones for the setting turn it on. Every course term has
// been met and is settled (`rd-terms`, src/domain/intro.ts), so the Path asks about any category as the specs expect; term-stops.spec.js
// starts from none.
import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { dataKey, serveCourse, KEY_STORE, withCourse } from "./data-key.js";

const DATA = JSON.parse(readFileSync(new URL("../../src/data/drill-data.json", import.meta.url), "utf8"));
/** Every course term met at its stop and settled. Its stop counts as just shown (`at` ahead of any count), so a mistake in a spec brings no stop back. */
export const SETTLED_TERMS = JSON.stringify({ n: 0, next: 3, terms: Object.fromEntries(DATA.cats.filter((c) => c.kind === "dudra" && c.term).map((c) => [c.id, { box: 3, shows: 1, at: 1e6 }])) });

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(([store, key, terms]) => {
      try {
        if (key) localStorage.setItem(store, key);
        if (localStorage.getItem("rd-autoexplain") === null) localStorage.setItem("rd-autoexplain", "0");
        if (localStorage.getItem("rd-terms") === null) localStorage.setItem("rd-terms", terms);
      } catch { /* storage unavailable */ }
    }, [KEY_STORE, withCourse ? dataKey : null, SETTLED_TERMS]);
    await serveCourse(page);
    await use(page);
  },
});
export { expect };
