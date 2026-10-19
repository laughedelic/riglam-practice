// Helpers shared by the PWA specs. The page has one markup per layout: on a phone the relations are a list
// (.rels .rel), on a wide screen a row of chips (.strip .chip); only one of them is visible.
import { expect } from "@playwright/test";

export const relOptions = (page) => page.locator(".rels .rel, .strip .chip").filter({ visible: true });

/** The app has booted when the data is loaded and a pair is on screen. It opens on Home; this opens Relations from there. */
export async function ready(page) {
  const row = page.locator('.exr[data-go="practice"]'), pair = page.locator("#stage .head .pair");
  await expect(row.or(pair)).toBeVisible();
  if (await row.isVisible()) {
    await expect(row).toBeEnabled();
    // a spec that starts under a dialog (the Magic Key prompt) only needs the exercise open behind it
    if (await page.locator("dialog[open]").count()) await row.dispatchEvent("click");
    else await row.click();
  }
  await expect(pair).toBeVisible();
  await expect(relOptions(page)).toHaveCount(5);
}

const SCREENS = { Home: "home", Relations: "practice", Pervasions: "debate", Review: "review" };
/** Goes to a screen as a learner would: the rail on a wide screen; on a phone the tab bar (Home, Review), and an exercise from Home. */
export async function goTo(page, name) {
  const k = SCREENS[name], b = page.locator(`[data-go="${k}"]`).filter({ visible: true });
  if (await b.count()) return b.first().click();
  const back = page.locator("#mback"); // in an exercise the tab bar hides while a field has the keyboard; the back arrow stays
  if (await back.isVisible()) await back.click();
  else await page.locator('[data-go="home"]').filter({ visible: true }).first().click();
  if (k !== "home") await page.locator(`.exr[data-go="${k}"]`).click();
}

export const isPhone = (testInfo) => testInfo.project.name === "pwa-phone";
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
