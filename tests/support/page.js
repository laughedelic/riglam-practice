// Helpers shared by the PWA specs. The page is the Path (src/app/path): the choices of an exercise are the rows of `.chs` (`#path .chs .crow`), the roadmap
// is a dialog over the exercise, and Review and Settings are pages of their own.
import { expect } from "@playwright/test";
import { REL } from "../../src/ai-shared/relations.ts";

const CELLS = ["both", "anb", "bna", "nei"];

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

/** The field of Settings' Magic Key page, on a device without the key: the roadmap's Magic Key, Explain and a flag open the page, and so does a key that went wrong at the start. */
export const keyField = (page) => page.getByRole("textbox", { name: "Magic Key or link", exact: true });
/** Enters `key` on the Magic Key page, which is open. (Enter, not the button: on a phone the field's keyboard goes at the first press on the button, and the button moves from under it.) */
export async function enterKey(page, key) {
  await keyField(page).fill(key);
  await keyField(page).press("Enter");
}

/** Answers the pair on screen as far as the result: the first relation (with `own`, the pair's own, which needs the spec's `window.__t`, so that every example is
 *  one the page can check against a cell), `text(i, cell)` in each case the page asks for (`cell` only with `own`; null says nothing exists, where the page
 *  lets it), and the Check. Leaves the result's page on screen. */
export async function answerFirst(page, { own = false, text = (i) => "thing " + (i + 1) } = {}) {
  let cells = [];
  if (own) {
    const rel = await page.evaluate(() => window.__t.cur.p.relation);
    cells = CELLS.filter((c) => !REL[rel].empty.includes(c));
    await page.locator(`#path .chs [data-k="${rel}"]`).click();
  } else await relOptions(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    const t = text(i, cells[i]);
    if (t === null) { await page.getByRole("button", { name: "nothing exists" }).click(); continue; }
    await field.fill(t);
    if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; }
    await field.press("Enter");
  }
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Check/);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
}
/** Explain on the result: the choice beside the line (it says "Check & explain" when the page asks Claude for the examples it could not check). */
export const explainChoice = (page) => page.locator(".cwex .crow").filter({ hasText: /explain/i });

export const isPhone = (testInfo) => testInfo.project.name === "pwa-phone";
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** Sets the stages the page reads at its next start, as a device would have them before it kept a progress document: in localStorage, with the
 *  document removed, since the page takes the document's stages over its own (src/app/practice/progress.ts). */
export const setStoredStages = (page, v) => page.evaluate(async (x) => {
  localStorage.setItem("rd-stages", x);
  await (await window.__riglam.platform.db()).collection("progress").doc("learner").delete();
}, v);
