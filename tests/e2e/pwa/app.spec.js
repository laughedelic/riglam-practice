// The page running in the installed app: the practice flow against the real local storage, no AI features
// while no server answers (tutor.spec.js has the server), and no sideways scrolling.
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";

// The phone layout takes one example at a time in a single field; the wide layout has four boxes. The flow runs on the phone.
async function answerOnPhone(page) {
  await relOptions(page).first().click(); // whichever relation: the page grades it either way
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
const savedAnswers = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).size);

test("the first screen fits the width", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("a pair is answered, saved on the device, and still there after a reload", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  await expect.poll(() => savedAnswers(page)).toBe(1);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.reload();
  await ready(page);
  expect(await savedAnswers(page)).toBe(1);
});

test("features that need Claude are absent, not broken", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  if (isPhone(testInfo)) {
    await answerOnPhone(page);
    await expect(page.getByRole("button", { name: /explain/i })).toHaveCount(0);
  }
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.getByText(/check lab/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Options says which build this is, and that it is the newest", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText(/Version \d+\.\d+\.\d+ · build [0-9a-f]{7}|unknown/);
  await expect(row).toContainText("This is the newest version.");
});

// Appending a null child to a node writes the text "null": the wide Pervasions result put one between the relation chips and
// their description (the relation timer is absent once the result is shown).
test("the wide Pervasions result has no stray text between the relation chips and their description", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the chips and their description are the wide layout's");
  await page.goto("/");
  await ready(page);
  await page.locator('.rail .nv:has-text("Pervasions")').click();
  const card = page.locator(".qcard");
  for (let i = 0; i < 4; i++) {
    await card.locator(".btn").first().click(); // accept each question
    await page.waitForTimeout(150);
  }
  await relOptions(page).first().click();
  await expect(page.locator(".vchip").first()).toBeVisible();
  const between = await page.evaluate(() => {
    const strip = document.querySelector("#stage .strip");
    return [...strip.parentNode.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent);
  });
  expect(between).toEqual([]);
  expect(await page.locator("#stage").innerText()).not.toMatch(/\bnull\b/);
});
