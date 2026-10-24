// The reference examples under a definition in the Terms panel: a few examples of the term, with their stage and how well they are
// confirmed, and on a tap the reason they are good examples. The examples are invented (one pair for every term of the open data) and
// served by a stand-in for the server (tests/support/data-key.js, which also holds the Magic Key of every page); the definitions need the
// course data of the run.
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";

const withKey = withCourse ? test : test.skip; // no data-private/: the course definitions are not here

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };

// for every term, a plain example with a reason and a commentary-only one, at levels 1 and 2 (stages 6 and 7)
const part = () => ({
  version: "e1",
  part: {
    format: "riglam-examples-device", version: 2, sources: {},
    items: Object.keys(readOpen().terms).flatMap((term) => [
      { n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", gloss: `Why the ${term.toLowerCase()} sample is a good one.`, s: [] },
      { n: `a second ${term.toLowerCase()} sample`, cls: [term], lv: 2, k: "thing", cf: "commentator", s: [] },
    ]),
  },
});

async function openTerms(page, testInfo, examples) {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(hook);
  await serveCourse(page, dataKey, { examples });
  await page.goto("/");
  await ready(page);
  if (examples) await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  await page.getByRole("tab", { name: "Terms" }).click();
  await expect(page.locator(".terms")).toBeVisible();
}

withKey("a definition shows examples of its term, the plainest first, and a tap says why one is a good example", async ({ page }, testInfo) => {
  await openTerms(page, testInfo, part());
  await page.locator(".terms .dterm").first().click();
  const card = page.locator(".terms .ddef");
  const ex = card.locator(".tm-ex");
  await expect(ex).toBeVisible();
  const rows = ex.locator("li");
  expect(await rows.count()).toBeLessThanOrEqual(3); // the term's own two, and a subclass's when it has one (the pair is drawn at random)
  await expect(rows.first()).toContainText("stage 6 · in two or more sources");
  await expect(rows.nth(1)).toContainText("stage 7 · from a commentary");
  await expect(ex.locator(".tm-why")).toHaveCount(0);

  const why = rows.first().locator("button");
  await why.click();
  await expect(ex.locator(".tm-why")).toContainText("is a good one");
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(why).toBeFocused();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await why.click();
  await expect(ex.locator(".tm-why")).toHaveCount(0);
  await expect(rows.nth(1).locator("button")).toHaveCount(0); // an example with no reason is not a button
});

withKey("without examples the definition is as it was", async ({ page }, testInfo) => {
  await openTerms(page, testInfo, null);
  await page.locator(".terms .dterm").first().click();
  await expect(page.locator(".terms .ddef")).toBeVisible();
  await expect(page.locator(".tm-ex")).toHaveCount(0);
});
