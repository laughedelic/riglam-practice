// The Terms panel of a result: the terms and categories that have a definition on this device are dot-underlined, every time they
// occur, and a tap opens the definition under the text. A definition shows where its term sits, and the categories above it open
// in the same card. Without the Magic Key the panel has no underlines (unlock.spec.js); these specs need the real definitions.
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

const withKey = withCourse ? test : test.skip; // no data-private/: the course definitions are not here

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };

// answers the first pair far enough to get the result, and opens its Terms panel
async function openTerms(page, testInfo) {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  await page.getByRole("tab", { name: "Terms" }).click();
  await expect(page.locator(".terms")).toBeVisible();
}

withKey("the Terms panel has no Definitions fold: the terms with a definition are underlined and open it in place", async ({ page }, testInfo) => {
  await openTerms(page, testInfo);
  const marks = page.locator(".terms .dterm");
  expect(await marks.count()).toBeGreaterThan(0);
  await expect(page.locator(".tm-tog")).toHaveCount(0);
  await expect(page.locator(".terms .tm-locked")).toHaveCount(0);

  await marks.first().click();
  const def = page.locator(".terms .ddef");
  await expect(def).toHaveCount(1);
  await expect(marks.first()).toHaveAttribute("aria-expanded", "true");
  expect((await def.locator("dd").last().innerText()).length).toBeGreaterThan(10);
  await expect(def).not.toContainText(/booklet/i); // a definition is shown as it is, without remarks on where it is from
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await marks.first().click(); // a second tap closes it
  await expect(def).toHaveCount(0);
});

withKey("in the Terms panel a term is underlined every time it occurs", async ({ page }, testInfo) => {
  await openTerms(page, testInfo);
  const count = await page.evaluate(() => {
    const T = window.__t.DATA.terms;
    const named = Object.keys(T).filter((n) => /^[A-Za-z]{6,12}$/.test(n) && window.__t.defParts(T[n].d).body).slice(0, 2);
    const p = { ...window.__t.cur.p, note: `${named[0]} and ${named[1]}, then ${named[0]} and ${named[1]} again.` };
    return window.__t.termsNode(p).querySelectorAll(".tm-sum .dterm").length;
  });
  expect(count).toBe(4); // the second mention of each is underlined as well
});

withKey("a definition shows where its term sits, and a higher category opens in the same card, with the way back", async ({ page }, testInfo) => {
  await openTerms(page, testInfo);
  const marks = page.locator(".terms .dterm"), def = page.locator(".terms .ddef"), up = def.locator(".tm-up .dterm");
  let at = -1;
  for (let i = 0, n = await marks.count(); i < n && at < 0; i++) {
    await marks.nth(i).click();
    if ((await up.count()) > 0) at = i;
  }
  expect(at, "some term of the pair has a higher category with a definition").toBeGreaterThanOrEqual(0);
  const first = await def.locator("dt").innerText();
  const parent = (await up.first().innerText()).toLowerCase();
  await expect(def.locator(".tm-up b")).toHaveText(first.split(" · ")[0].toLowerCase()); // the term itself, plain, then its categories

  await up.first().click();
  await expect(def).toHaveCount(1); // the card is replaced in its place, never stacked
  expect((await def.locator("dt").innerText()).toLowerCase()).toContain(parent);
  await expect(marks.nth(at)).toHaveAttribute("aria-expanded", "true");
  const back = def.locator(".ddback");
  await expect(back).toHaveText(new RegExp(first.split(" · ")[0], "i"));
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await back.click();
  await expect(def.locator("dt")).toHaveText(first);
  await expect(def.locator(".ddback")).toHaveCount(0);

  await up.first().click(); // and Escape closes the whole card, with the focus back on the term that opened it
  await page.keyboard.press("Escape");
  await expect(def).toHaveCount(0);
  await expect(marks.nth(at)).toBeFocused();
});
