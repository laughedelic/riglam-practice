// The negation track of Relations (src/domain/universe.ts, `negation`): a choice in the practice options, off on a new device. With it on, some pairs negate a
// term ("non-(wooden things)") and offer a sixth answer, four possibilities without neither (key 6 on a wide screen).
import { test, expect } from "../../support/test.js";
import { isPhone, ready, relOptions } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const ORDER = ["mi", "3ab", "3ba", "4", "con", "4n"];
const fwd = (page) => page.locator("#stage .pbar .fwd");

test("the Negations choice is off on a new device, and a choice is kept", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  expect(await page.evaluate(() => window.__t.cur.p.neg)).toBeUndefined();
  await expect(relOptions(page)).toHaveCount(5);
  await page.locator("#msess").click();
  const seg = page.getByRole("group", { name: "Negations" });
  await expect(seg.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await seg.getByRole("button", { name: "Both sides" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-negation"))).toBe("both");
  await expect(seg.getByRole("button", { name: "Both sides" })).toHaveAttribute("aria-pressed", "true");
});

test("with negations on, a pair can negate a term, offers a sixth answer, and is checked with the negation", async ({ page }, testInfo) => {
  await page.addInitScript(() => { localStorage.setItem("rd-negation", "both"); localStorage.setItem("rd-stages", "1,2,3"); });
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  // about a third of the pairs negate a side: skip until one comes
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__t.cur.p.neg)); i++) await page.keyboard.press("s");
  const p = await page.evaluate(() => window.__t.cur.p);
  expect(p.neg).toMatch(/^(b|ab)$/);
  expect(p.b).toMatch(/^non-/);
  await expect(page.locator("#stage .pair .tb")).toContainText("non-");
  await expect(relOptions(page)).toHaveCount(6);
  await expect(relOptions(page).nth(5)).toContainText("Four possibilities without neither");
  if (!isPhone(testInfo)) {
    await page.keyboard.press("6");
    expect(await page.evaluate(() => window.__t.ui.rel)).toBe("4n");
  }
  await relOptions(page).nth(ORDER.indexOf(p.relation)).click();
  // the cells the relation leaves open, filled with anything, then checked
  if (isPhone(testInfo)) {
    for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) { await page.fill("#cin", "thing " + (i + 1)); await fwd(page).click(); }
  } else {
    const ids = await page.locator(".cell input:not([disabled])").evaluateAll((a) => a.map((x) => x.id));
    for (const id of ids) await page.fill("#" + id, "thing");
    await fwd(page).click();
  }
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  expect(await page.evaluate(() => window.__t.ui.res.relOk)).toBe(true);
  // the answer keeps the pair with its negation, under the relation's key
  expect(await page.evaluate(() => ({ key: window.__t.ui.doc.key, neg: window.__t.ui.doc.pair.neg, b: window.__t.ui.doc.b }))).toEqual({ key: p.relation, neg: p.neg, b: p.b });
});
