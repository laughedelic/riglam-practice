// "Your data" in Options: export everything the app keeps to a file, and import it again (src/store/transfer.ts).
// The documents are written to collections the PWA never draws (labruns, flags), so the test does not depend on how the page shows an answer.
import { readFileSync } from "node:fs";
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const seeded = {
  labruns: { lr_one: { kind: "run", model: "m", at: "2026-10-01T10:00:00.000Z" }, lr_two: { kind: "run", model: "m", at: "2026-10-02T10:00:00.000Z" } },
  flags: { f_one: { id: "f_one", part: "cell", updatedAt: "2026-10-03T10:00:00.000Z", state: "new" } },
};

const open = async (page) => {
  // the support test starts every page with "Check every answer with AI" off; this spec counts the settings the page has stored
  await page.addInitScript(() => localStorage.removeItem("rd-autoexplain"));
  await page.goto("/");
  await ready(page);
};
const openOptions = (page) => page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
const exportBtn = (page) => page.getByRole("button", { name: "Export your data to a file" });
const importBtn = (page) => page.getByRole("button", { name: "Import data from a file" });
const status = (page) => page.locator(".xferbox .onote");

const seed = (page) =>
  page.evaluate(async (docs) => {
    const db = await window.__riglam.platform.db();
    for (const [col, byId] of Object.entries(docs)) for (const [id, doc] of Object.entries(byId)) await db.collection(col).doc(id).set(doc);
    localStorage.setItem("rd-wording", "plain");
  }, seeded);
const wipe = (page) =>
  page.evaluate(async (docs) => {
    const db = await window.__riglam.platform.db();
    for (const [col, byId] of Object.entries(docs)) for (const id of Object.keys(byId)) await db.collection(col).doc(id).delete();
    localStorage.removeItem("rd-wording");
  }, seeded);
const stored = (page) =>
  page.evaluate(async () => {
    const db = await window.__riglam.platform.db();
    const out = {};
    for (const col of ["labruns", "flags"]) out[col] = Object.fromEntries((await db.collection(col).get()).docs.map((d) => [d.id, d.data()]));
    return { docs: out, wording: localStorage.getItem("rd-wording") };
  });

async function exportFile(page) {
  const [download] = await Promise.all([page.waitForEvent("download"), exportBtn(page).click()]);
  expect(download.suggestedFilename()).toMatch(/^riglam-practice-\d{4}-\d{2}-\d{2}\.json$/);
  return { path: await download.path(), name: download.suggestedFilename() };
}
async function chooseFile(page, file) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importBtn(page).click()]);
  await chooser.setFiles(file);
}

test("what the app keeps is exported to one file and comes back through import", async ({ page }) => {
  await open(page);
  await seed(page);
  await openOptions(page);

  const { path } = await exportFile(page);
  await expect(status(page)).toContainText("3 documents and 1 setting saved");
  const file = JSON.parse(readFileSync(path, "utf8"));
  expect(file).toMatchObject({ format: "riglam-practice-data", version: 1 });
  expect(file.collections.labruns).toEqual(seeded.labruns);
  expect(file.collections.flags).toEqual(seeded.flags);
  expect(file.preferences).toEqual({ "rd-wording": "plain" });

  await wipe(page);
  expect((await stored(page)).docs.labruns).toEqual({});

  await chooseFile(page, path);
  const summary = page.getByRole("group", { name: "What the import would do" });
  await expect(summary).toContainText("Adds 2 Quorum runs, 1 flag.");
  await expect(summary).toContainText("Restores 1 setting");
  expect((await stored(page)).docs.labruns).toEqual({}); // nothing is written before the person confirms

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(status(page)).toContainText("Imported 3 documents and 1 setting. Reload to apply the settings.");
  expect(await stored(page)).toEqual({ docs: seeded, wording: "plain" });

  // the same file again has nothing to add
  await chooseFile(page, path);
  await expect(status(page)).toContainText("Nothing new in that file");
});

test("cancelling the preview writes nothing", async ({ page }) => {
  await open(page);
  await seed(page);
  await openOptions(page);
  const { path } = await exportFile(page);
  await wipe(page);
  await chooseFile(page, path);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("group", { name: "What the import would do" })).toHaveCount(0);
  expect((await stored(page)).docs.labruns).toEqual({});
});

test("a file that is not a data file is refused and changes nothing", async ({ page }) => {
  await open(page);
  await openOptions(page);
  await chooseFile(page, { name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
  await expect(status(page)).toContainText("not a data file from this app");
  await chooseFile(page, { name: "newer.json", mimeType: "application/json", buffer: Buffer.from('{"format":"riglam-practice-data","version":99,"collections":{}}') });
  await expect(status(page)).toContainText("newer version of the app");
  expect((await stored(page)).docs.labruns).toEqual({});
});

test("closing the phone's share sheet is not reported as a saved file", async ({ page }) => {
  // the share sheet is used where the main pointer is a finger (the phone project); elsewhere the file is downloaded
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(new DOMException("closed", "AbortError"));
  });
  await open(page);
  test.skip(!(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)), "needs a touch device");
  await openOptions(page);
  await exportBtn(page).click();
  await expect(exportBtn(page)).toBeFocused();
  await expect(page.locator(".xferbox .onote")).toHaveCount(0);
});

test("focus follows the steps: the summary, then the result, and back to Import after Cancel", async ({ page }) => {
  await open(page);
  await seed(page);
  await openOptions(page);
  const { path } = await exportFile(page);
  await expect(page.locator(".xferbox .onote[role=status]")).toBeFocused();
  await wipe(page);

  await chooseFile(page, path);
  await expect(page.getByRole("group", { name: "What the import would do" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(importBtn(page)).toBeFocused();

  await chooseFile(page, path);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".xferbox .onote[role=status]")).toBeFocused();
});
