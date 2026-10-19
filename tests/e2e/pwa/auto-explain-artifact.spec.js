// "Check every answer with AI" in the artifact build, where the page asks the host's own model (`sample`): a checked answer asks for its explanation
// at once, in Relations and in Pervasions, and not when the setting is off. The host is the mock of tests/support/claude-mock.js.
import { test, expect } from "@playwright/test";
import { routeArtifact } from "../../support/artifact-host.js";
import { goTo } from "../../support/page.js";

test.skip(({ viewport }) => !viewport || viewport.width < 1100, "the wide layout answers with keys and one click");

async function start(page, setting) {
  await page.addInitScript((v) => {
    window.__riglamTest = (t) => { window.__t = t; };
    try { if (v !== null) localStorage.setItem("rd-autoexplain", v); } catch { /* storage unavailable */ }
  }, setting);
  await routeArtifact(page, { ai: true });
  await page.goto("http://artifact.test/");
  await page.waitForFunction(() => window.__t && window.__t.cur);
  await goTo(page, "Relations");
}
const relations = async (page) => {
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await page.locator(".strip .chip").nth({ mi: 0, "3ab": 1, "3ba": 2, 4: 3, con: 4 }[rel]).click();
  const n = await page.locator(".grid input:not([disabled])").count();
  for (let i = 0; i < n; i++) await page.locator(".grid input:not([disabled])").nth(i).fill("thing " + (i + 1));
  await page.locator("#stage .actions .btn", { hasText: /show result/i }).click();
};
const pervasions = async (page) => {
  await goTo(page, "Pervasions");
  for (let i = 0; i < 4; i++) { await page.keyboard.press("a"); await page.waitForTimeout(50); }
  await page.keyboard.press("1");
};
const explainBtn = (page) => page.locator("#stage .actions .btn, #coach .btn").filter({ hasText: /^explain$|check and explain/i });

test("a checked Relations answer is explained by itself, once", async ({ page }) => {
  await start(page, null);
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

test("with the setting off the answer waits for Explain", async ({ page }) => {
  await start(page, "0");
  await relations(page);
  await expect(explainBtn(page).first()).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__sampleDone)).toBe(0);
  await explainBtn(page).first().click();
  await page.waitForFunction(() => window.__sampleDone === 1);
});
