// The reference examples as references of a pair's cells, up to the level the learner chose in Options ("Examples"). The examples are
// invented (a plain and a second-level one for every term of the open data) and served by a stand-in for the server
// (tests/support/data-key.js); the row exists only on a device that holds examples, and the level decides which are drawn.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";
import { dataKey, KEY_STORE, serveCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const withKey = (page) => page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);
const part = () => ({
  version: "e1",
  part: {
    format: "riglam-examples-device", version: 2, sources: {},
    items: Object.keys(readOpen().terms).flatMap((term) => [
      { n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", s: [] },
      { n: `a ${term.toLowerCase()} second sample`, cls: [term], lv: 2, k: "thing", cf: "textbook", s: [] },
    ]),
  },
});
const openOptions = async (page) => {
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.locator("#opts")).toBeVisible();
};
// the references of 400 drawn pairs
const drawn = (page) => page.evaluate(() => {
  const out = new Set();
  for (let i = 0; i < 400; i++) { const p = window.__t.nextGenerated([]); for (const n of Object.values(p.ex)) if (n) out.add(n); }
  return [...out];
});

test.beforeEach(async ({ page }) => { await page.addInitScript(hook); });

test("Options has an Examples row with the levels when the device holds examples, and none without", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await openOptions(page);
  const row = page.locator(".orow").filter({ has: page.locator(".tl", { hasText: "Examples" }) });
  await expect(row.getByRole("button")).toHaveCount(4);
  await expect(row.getByRole("button", { name: "Level 2" })).toHaveAttribute("aria-pressed", "true"); // a new device starts at 2
  await row.getByRole("button", { name: "Level 3" }).click();
  await expect(row.getByRole("button", { name: "Level 3" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-exlevel"))).toBe("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("the row is not there without examples", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openOptions(page);
  await expect(page.locator(".orow .tl", { hasText: "Examples" })).toHaveCount(0);
});

test("the chosen level decides which reference examples are drawn into the cells, and it is kept", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);

  const pickLevel = async (level) => {
    await openOptions(page);
    await page.locator(".orow").filter({ has: page.locator(".tl", { hasText: "Examples" }) }).getByRole("button", { name: `Level ${level}` }).click();
    await page.keyboard.press("Escape");
  };
  await pickLevel(1);
  const one = await drawn(page);
  expect(one.some((n) => /sample$/.test(n) && !/second/.test(n)), "level 1 examples reach the cells").toBe(true);
  expect(one.filter((n) => /second sample$/.test(n)), "nothing above level 1").toEqual([]);

  await pickLevel(2);
  expect((await drawn(page)).some((n) => /second sample$/.test(n)), "level 2 examples join").toBe(true);

  await page.reload();
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await pickLevel(1); // the choice is a setting of this device: set it again to see the kept value is read at the start
  expect(await page.evaluate(() => localStorage.getItem("rd-exlevel"))).toBe("1");
  await page.reload();
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  expect((await drawn(page)).filter((n) => /second sample$/.test(n)), "level 1 is read back at the start").toEqual([]);
});
