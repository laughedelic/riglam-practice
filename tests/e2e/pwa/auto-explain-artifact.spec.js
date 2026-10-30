// "Explanations by Claude" set to Every answer in the artifact build, where the page asks the host's own model (`sample`): a checked answer asks for its
// explanation at once, in Relations and in Pervasions, and not when the setting is When I ask. The host is the mock of tests/support/claude-mock.js.
import { test, expect } from "@playwright/test";
import { routeArtifact } from "../../support/artifact-host.js";
import { answerFirst, explainChoice, goTo, ready } from "../../support/page.js";

async function start(page, setting) {
  await page.addInitScript((v) => {
    window.__riglamTest = (t) => { window.__t = t; };
    try { localStorage.setItem("rd-start", "exercise"); if (v !== null) localStorage.setItem("rd-autoexplain", v); } catch { /* storage unavailable */ }
  }, setting);
  await routeArtifact(page, { ai: true });
  await page.goto("http://artifact.test/");
  await ready(page);
}
const relations = (page) => answerFirst(page);
const pervasions = async (page) => {
  await goTo(page, "Pervasions");
  const done = page.locator("#path .sb.done");
  for (let i = 1; i <= 4; i++) {   // accept each question, then the relation the answers give
    await page.locator("#path .chs .crow").filter({ hasText: "Accept" }).first().click();
    if (i < 4) await expect(done).toHaveCount(i);
  }
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator("#path .chs .crow").first().click();
};
const explainBtn = (page) => explainChoice(page);

test("with Every answer a checked Relations answer is explained by itself, once", async ({ page }) => {
  await start(page, "1");
  await relations(page);
  await page.waitForFunction(() => window.__sampleDone === 1);
  expect(await page.evaluate(() => window.__t.ui.explained)).toBe(true);
  await expect(explainBtn(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sampleDone)).toBe(1);
});

test("a checked Pervasions answer is explained by itself", async ({ page }) => {
  await start(page, "1");
  await pervasions(page);
  await page.waitForFunction(() => window.__t.ui.checked && window.__sampleDone === 1);
  expect(await page.evaluate(() => window.__t.ui.explained)).toBe(true);
});

test("with When I ask, which is the default, the answer waits for Explain", async ({ page }) => {
  await start(page, null);
  await relations(page);
  await expect(explainBtn(page)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__sampleDone)).toBe(0);
  await explainBtn(page).click();
  await page.waitForFunction(() => window.__sampleDone === 1);
});
