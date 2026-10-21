// The reference examples as references of a pair's cells, from the levels the learner switched on in the practice options ("Examples"). The examples are
// invented (a plain and a second-level one for every term of the open data) and served by a stand-in for the server
// (tests/support/data-key.js); the card exists only on a device that holds examples, and the levels that are on decide which are drawn.
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
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(page.locator("#opts")).toBeVisible();
};
const examplesCard = (page) => page.locator(".ocard").filter({ hasText: "Examples" });
// the page of the Examples card: the switches of the levels
const intoLevels = async (page) => {
  await examplesCard(page).getByRole("button", { name: "Examples: details" }).click();
  return page.locator(".lvls");
};
const openLevels = async (page) => { await openOptions(page); return intoLevels(page); };
const levelSwitch = (row, level) => row.getByRole("switch", { name: new RegExp(`^Level ${level} `) });
// switches on the levels asked for and the others off (the last level on cannot be switched off, so the ones to add go first)
const levelsOn = async (page, wanted) => {
  const row = await openLevels(page);
  for (const off of [false, true]) {
    for (const l of [1, 2, 3, 4]) {
      if (wanted.includes(l) === off) continue;
      const sw = levelSwitch(row, l);
      if ((await sw.getAttribute("aria-checked")) === String(!off)) continue;
      await sw.click();
    }
  }
  await page.locator("#over .oc").click();
};
// the references of 400 drawn pairs
const drawn = (page) => page.evaluate(() => {
  const out = new Set();
  for (let i = 0; i < 400; i++) { const p = window.__t.nextGenerated([]); for (const n of Object.values(p.ex)) if (n) out.add(n); }
  return [...out];
});

test.beforeEach(async ({ page }) => { await page.addInitScript(hook); });

test("the practice options have an Examples card with a switch and an explanation for each level when the device holds examples, and none without", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await openOptions(page);
  await expect(examplesCard(page), "the card says which levels are on").toContainText("Level 1");
  const row = await intoLevels(page);
  await expect(row.getByRole("switch")).toHaveCount(4);
  await expect(row.locator(".lvl")).toHaveCount(4);
  await expect(row.locator(".lvl").first()).toContainText("Plain things");
  await expect(levelSwitch(row, 1)).toContainText("examples"); // how many it has
  await expect(levelSwitch(row, 1)).toHaveAttribute("aria-checked", "true"); // a new device draws from level 1 alone
  await expect(levelSwitch(row, 2)).toHaveAttribute("aria-checked", "false");
  await expect(levelSwitch(row, 3)).toHaveAttribute("aria-checked", "false");
  await levelSwitch(row, 3).click();
  await expect(levelSwitch(row, 3)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-exlevels"))).toBe("1,3");
  await levelSwitch(row, 1).click();
  await expect(levelSwitch(row, 3), "the last level on stays on").toHaveAttribute("aria-checked", "true");
  await expect(levelSwitch(row, 3)).toHaveAttribute("aria-disabled", "true");
  await levelSwitch(row, 3).click({ force: true }); // marked disabled, which Playwright does not click otherwise
  await expect(levelSwitch(row, 3)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-exlevels"))).toBe("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("the card is not there without examples", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openOptions(page);
  await expect(examplesCard(page)).toHaveCount(0);
});

test("the levels that are on decide which reference examples are drawn into the cells, and they are kept", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);

  await levelsOn(page, [1]);
  const one = await drawn(page);
  expect(one.some((n) => /sample$/.test(n) && !/second/.test(n)), "level 1 examples reach the cells").toBe(true);
  expect(one.filter((n) => /second sample$/.test(n)), "nothing of level 2").toEqual([]);

  await levelsOn(page, [1, 2]);
  expect((await drawn(page)).some((n) => /second sample$/.test(n)), "level 2 examples join").toBe(true);

  await levelsOn(page, [2]); // a set, not a ceiling: level 1 can be left out
  const two = await drawn(page);
  expect(two.some((n) => /second sample$/.test(n)), "level 2 examples are drawn").toBe(true);
  expect(two.filter((n) => /sample$/.test(n) && !/second/.test(n)), "nothing of level 1").toEqual([]);

  await page.reload();
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("rd-exlevels"))).toBe("2");
  expect((await drawn(page)).filter((n) => /sample$/.test(n) && !/second/.test(n)), "the levels are read back at the start").toEqual([]);
});
