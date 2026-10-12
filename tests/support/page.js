// Helpers shared by the PWA specs. The page has one markup per layout: on a phone the relations are a list
// (.rels .rel), on a wide screen a row of chips (.strip .chip); only one of them is visible.
import { expect } from "@playwright/test";

export const relOptions = (page) => page.locator(".rels .rel, .strip .chip").filter({ visible: true });

/** The app has booted when the data is loaded and a pair is on screen. */
export async function ready(page) {
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await expect(relOptions(page)).toHaveCount(5);
}

export const isPhone = (testInfo) => testInfo.project.name === "pwa-phone";
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
