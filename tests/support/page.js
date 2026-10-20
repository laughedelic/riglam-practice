// Helpers shared by the PWA specs. The page has one markup per layout: on a phone the relations are a list
// (.rels .rel), on a wide screen a row of chips (.strip .chip); only one of them is visible.
import { expect } from "@playwright/test";

export const relOptions = (page) => page.locator(".rels .rel, .strip .chip").filter({ visible: true });

/** The app has booted when the data is loaded and a pair is on screen: it opens on the exercise (Relations, or the one used last). */
export async function ready(page) {
  const pair = page.locator("#stage .head .pair");
  await expect(pair).toBeVisible();
  await expect(relOptions(page)).toHaveCount(5);
}

/** Opens the menu if it is not showing: the drawer on a phone, the pinned panel on a wide screen. */
export async function openMenu(page) {
  const menu = page.locator("#menu");
  if (!(await menu.isVisible())) {
    // Review has no menu button on a phone (the back arrow returns to the exercise)
    if (!(await page.locator("#menubtn").isVisible())) await page.locator("#mback").click();
    await page.locator("#menubtn").click();
  }
  await expect(menu).toBeVisible();
}

const SCREENS = { Relations: "practice", Pervasions: "debate", "Find a pair": "find", Review: "review", Settings: "settings" };
/** Goes to a screen as a learner would: from the menu. */
export async function goTo(page, name) {
  if (await page.locator("#over").isVisible()) await page.keyboard.press("Escape");
  await openMenu(page);
  await page.locator(`#menu :is(.mrow, .fbtn)[data-go="${SCREENS[name]}"]`).click();
}

/** Opens Settings (the Magic Key, the account, your data, the version) from the menu. */
export const openSettings = (page) => goTo(page, "Settings");

export const isPhone = (testInfo) => testInfo.project.name === "pwa-phone";
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
