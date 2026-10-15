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

test("Options says which build this is, and when the server has a newer one", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText(/Version \d+\.\d+\.\d+ · build [0-9a-f]{7}|unknown/);
  await expect(row).toContainText("This is the newest version.");

  await page.route("**/build.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "9.9.9", commit: "fffffff", builtAt: new Date().toISOString() }) }));
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.locator(".orow", { hasText: "Version" })).toContainText("A newer version is out");
});
