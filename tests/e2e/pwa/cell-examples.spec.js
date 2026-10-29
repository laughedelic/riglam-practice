// The stages of the learning ladder in the practice options ("Stages"), and the reference examples as references of a pair's cells, from the stages
// that are on. The examples are invented (a plain and a second-level one for every term of the open data, at stages 8 and 10) and served by a stand-in
// for the server (tests/support/data-key.js). The specs' devices are not new (the fixture stores a setting), so they start with stages 0 to 9.
import { test, expect } from "../../support/test.js";
import { ready, setStoredStages } from "../../support/page.js";
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
const stagesCard = (page) => page.locator(".ocard").filter({ hasText: "Stages" });
// the page of the Stages card: the switches of the stages
const intoStages = async (page) => {
  await stagesCard(page).getByRole("button", { name: "Stages: details" }).click();
  return page.locator(".lvls");
};
const openStages = async (page) => { await openOptions(page); return intoStages(page); };
const stageSwitch = (row, n) => row.getByRole("switch", { name: new RegExp(`^Stage ${n} `) });
// switches on the stages asked for and the others off (the last stage on cannot be switched off, so the ones to add go first)
const stagesOn = async (page, wanted) => {
  const row = await openStages(page);
  for (const off of [false, true]) {
    for (let n = 0; n <= 12; n++) {
      if (wanted.includes(n) === off) continue;
      const sw = stageSwitch(row, n);
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

test("the practice options have a Stages card with a switch for each stage, what it adds and how many things it has", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await openOptions(page);
  await expect(stagesCard(page), "the card says which stages are on: a device used before the stages keeps what it had").toContainText("Stages 0–9");
  const row = await intoStages(page);
  await expect(row.getByRole("switch")).toHaveCount(13);
  await expect(row.locator(".lvl").first()).toContainText("Things around you");
  await expect(stageSwitch(row, 1)).toContainText("things"); // how many it has
  await expect(stageSwitch(row, 9)).toHaveAttribute("aria-checked", "true");
  await expect(stageSwitch(row, 10)).toHaveAttribute("aria-checked", "false");
  await stageSwitch(row, 11).click();
  await expect(stageSwitch(row, 11)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3,4,5,6,7,8,9,11");
  expect(await page.evaluate(() => localStorage.getItem("rd-stage-lean")), "the next pairs lean to three possibilities").toBe("5");
  await setStoredStages(page, "3");
  await page.reload();
  await ready(page);
  const one = await openStages(page);
  await expect(stageSwitch(one, 3), "the last stage on stays on").toHaveAttribute("aria-disabled", "true");
  await stageSwitch(one, 3).click({ force: true }); // marked disabled, which Playwright does not click otherwise
  await expect(stageSwitch(one, 3)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("a new device starts at stage 0, and the card is there without the reference examples too", async ({ browser }) => {
  const page = await browser.newPage(); // without the fixture's stored setting: a device opened for the first time
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openOptions(page);
  await expect(stagesCard(page)).toContainText("Stage 0");
  const row = await intoStages(page);
  await expect(stageSwitch(row, 9)).toContainText("0 things");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages")), "nothing chosen yet: an import may still bring the stages").toBeNull();
  // the settings it stores from now on do not make it look like a device from before the stages
  await page.evaluate(() => localStorage.setItem("rd-notation", "sets"));
  await page.reload();
  await ready(page);
  await openOptions(page);
  await expect(stagesCard(page)).toContainText("Stage 0");
  await page.close();
});

test("a device that drew the reference examples by level gets the stages up to that level's", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-exlevels", "1,3"); });
  await page.goto("/");
  await ready(page);
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3,4,5,6,7,8,9,10,11");
});

test("the stages that are on decide which reference examples are drawn into the cells, and they are kept", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);

  await stagesOn(page, [8]);
  const one = await drawn(page);
  expect(one.some((n) => /sample$/.test(n) && !/second/.test(n)), "the examples of stage 8 reach the cells").toBe(true);
  expect(one.filter((n) => /second sample$/.test(n)), "nothing of stage 10").toEqual([]);

  await stagesOn(page, [8, 10]);
  expect((await drawn(page)).some((n) => /second sample$/.test(n)), "the examples of stage 10 join").toBe(true);

  await stagesOn(page, [10]); // a set, not a ceiling: stage 8 can be left out
  const two = await drawn(page);
  expect(two.some((n) => /second sample$/.test(n)), "the examples of stage 10 are drawn").toBe(true);
  expect(two.filter((n) => /sample$/.test(n) && !/second/.test(n)), "nothing of stage 8").toEqual([]);

  await page.reload();
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("10");
  expect((await drawn(page)).filter((n) => /sample$/.test(n) && !/second/.test(n)), "the stages are read back at the start").toEqual([]);
});
