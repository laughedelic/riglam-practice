// Helpers shared by the PWA specs. The page is the Path (src/app/path): the choices of an exercise are the rows of `.chs` (`#path .chs .crow`), the roadmap
// is a dialog over the exercise, and Review and Settings are pages of their own.
import { expect } from "@playwright/test";

/** The choices of the exercise on screen (the five relations in Relations). */
export const relOptions = (page) => page.locator("#path .chs .crow").filter({ visible: true });

/** The Path's exercise is in its place: it slides in from the right when the roadmap lets go of it, so a spec that measures where things stand waits for this first. */
export const exerciseAtRest = (page) => expect.poll(
  () => page.locator("#path .lay").evaluate((n) => Math.round(n.getBoundingClientRect().x - n.parentElement.getBoundingClientRect().x - n.parentElement.clientLeft)),
  { message: "the exercise has come in over the roadmap" },
).toBe(0);

/** The app has booted when the data is loaded and a pair is on screen: the exercise (Relations, or the one used last) is drawn, under the roadmap when that is the first screen. */
export async function ready(page) {
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
}

/** The roadmap, the dialog over the exercise (the station in the top bar opens it). */
export const roadmap = (page) => page.getByRole("dialog", { name: "Roadmap" });

/** Opens the roadmap if it is not showing. */
export async function openMenu(page) {
  const road = roadmap(page);
  if (!(await road.isVisible())) await page.locator(".tstn").click();
  await expect(road).toBeVisible();
}

/** Goes to a screen as a learner would: from the roadmap. */
export async function goTo(page, name) {
  await openMenu(page);
  const road = roadmap(page);
  if (name === "Settings") await road.locator(".rfoot").getByRole("button", { name: "Settings" }).click();
  else await road.getByRole("button", { name: new RegExp("^" + name) }).click();
}

/** Opens Settings (the Magic Key, the account, your data, the version) from the menu. */
export const openSettings = (page) => goTo(page, "Settings");

/** Opens a page of Settings (Account, Export and import, Magic Key ...) from the list: the line's "more" button. */
export async function openSettingsPage(page, title) {
  await openSettings(page);
  await page.getByRole("button", { name: title + ": more" }).click();
}

export const isPhone = (testInfo) => testInfo.project.name === "pwa-phone";
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** Sets the stages the page reads at its next start, as a device would have them before it kept a progress document: in localStorage, with the
 *  document removed, since the page takes the document's stages over its own (src/app/practice/progress.ts). */
export const setStoredStages = (page, v) => page.evaluate(async (x) => {
  localStorage.setItem("rd-stages", x);
  await (await window.__riglam.platform.db()).collection("progress").doc("learner").delete();
}, v);
