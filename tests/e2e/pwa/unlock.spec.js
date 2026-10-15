// The course part of the term data in the installed app: locked without a key, opened by the key in the study group's link
// (kept on the device, also offline), and the dialog for a reader who has no link. Uses the plain Playwright test, so
// each page starts with nothing stored. The specs that need the real key skip when none is at hand (docs/DATA.md).
import { test, expect } from "@playwright/test";
import { dataKey } from "../../support/data-key.js";
import { ready, overflow } from "../../support/page.js";
import { readFull } from "../../../scripts/lib/course-files.mjs";
import { generateKey, LOCKED_TEXT } from "../../../src/data/course.js";

const withKey = dataKey ? test : test.skip; // no data key (RIGLAM_DATA_KEY or .data-key): the specs that need the real definitions are skipped

// lets the spec read the page's data without asking the build for it again
const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const firstTerm = (page) => page.evaluate(() => { const T = window.__t.DATA.terms; return T[Object.keys(T)[0]]; });
const hasNotes = (page) => page.evaluate(() => { const D = window.__t.DATA; return "notes" in D || Object.values(D.terms).some((t) => "note" in t); });
const storedKey = (page) => page.evaluate(() => localStorage.getItem("riglam.dataKey"));

test("without a key the terms work, the definitions are locked, and a dialog says how to open them", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const term = await firstTerm(page);
  expect(term.d).toBe(LOCKED_TEXT);
  expect(term.d_ru).toBeUndefined();
  expect(term.wylie).toBeTruthy();
  const dlg = page.locator("#unlock");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("definitions are locked");
  expect(await hasNotes(page)).toBe(false);
});

test("the dialog fits the screen and the page behind it does not scroll sideways", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const box = await page.locator("#unlock").boundingBox();
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  expect(box.y + box.height).toBeLessThanOrEqual(h);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Not now closes the dialog for this visit", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator("#unlock")).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(page.locator("#unlock")).toHaveCount(0);
});

test("after Not now, Options has a row that asks for the key again, and it is gone once the key is there", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Not now" }).click();
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.getByText("the tutor (Explain) is off")).toBeVisible();
  await page.getByRole("button", { name: "Enter the key" }).click();
  await expect(page.locator("#unlock")).toBeVisible();
  await expect(page.locator("#unlock")).toContainText("tutor");
});

withKey("with the key there is no key row in Options", async ({ page }) => {
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Enter the key" })).toHaveCount(0);
});

test("text that is not a key is refused in the dialog", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.fill("#unlock-key", "hello");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#unlock-err")).toContainText("not a key");
  expect(await storedKey(page)).toBeNull();
});

test("a key that does not fit is refused, in the dialog and in a link", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await page.fill("#unlock-key", `https://riglam.example/#k=${generateKey()}`);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#unlock-err")).toContainText("does not open");
  expect(await storedKey(page)).toBeNull();

  await page.goto(`/?again=1#k=${generateKey()}`);
  await ready(page);
  await expect(page.locator("#unlock-err")).toContainText("does not open");
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(await storedKey(page)).toBeNull();
});

test("a link without a usable key says so and leaves the address clean", async ({ page }) => {
  await page.goto("/#k=short");
  await ready(page);
  await expect(page.locator("#unlock-err")).toContainText("no valid key");
  expect(await page.evaluate(() => location.hash)).toBe("");
});

withKey("the key in a link opens the definitions, leaves the address bar, and stays on the device", async ({ page }) => {
  const full = await readFull(dataKey);
  const name = Object.keys(full.terms)[0];
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  expect(await page.evaluate(() => location.href)).not.toContain("k=");
  const term = await firstTerm(page);
  expect(term.name).toBe(full.terms[name].name);
  expect(term.d).toBe(full.terms[name].d);
  expect(term.d_ru).toBe(full.terms[name].d_ru);
  expect(await hasNotes(page)).toBe(false); // the notes are not in the app
  await expect(page.locator("#unlock")).toHaveCount(0);
  expect(await storedKey(page)).toBe(dataKey);

  await page.goto("/"); // a later visit without the link
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[name].d);
});

withKey("pasting the link into the dialog opens the definitions", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await page.fill("#unlock-key", `https://riglam.example/#k=${dataKey}`);
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Unlock" }).click()]);
  await ready(page);
  expect((await firstTerm(page)).d).not.toBe(LOCKED_TEXT);
  await expect(page.locator("#unlock")).toHaveCount(0);
});

withKey("once opened, the definitions are there with no network", async ({ page, context }) => {
  const full = await readFull(dataKey);
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[Object.keys(full.terms)[0]].d);
  await context.setOffline(false);
});
