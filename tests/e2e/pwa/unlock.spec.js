// The course part of the term data in the installed app: locked without a key, opened by the key in the study group's link
// (kept on the device, also offline), and the prompt for a reader who has no link. Uses the plain Playwright test, so
// each page starts with nothing stored. The specs that need the real key skip when none is at hand (docs/DATA.md).
import { test, expect } from "@playwright/test";
import { dataKey } from "../../support/data-key.js";
import { ready, overflow, relOptions, isPhone } from "../../support/page.js";
import { readFull } from "../../../scripts/lib/course-files.mjs";
import { generateKey, LOCKED_TEXT } from "../../../src/data/course.js";

const withKey = dataKey ? test : test.skip; // no data key (RIGLAM_DATA_KEY or .data-key): the specs that need the real definitions are skipped

// lets the spec read the page's data without asking the build for it again
const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const firstTerm = (page) => page.evaluate(() => { const T = window.__t.DATA.terms; return T[Object.keys(T)[0]]; });
const hasNotes = (page) => page.evaluate(() => { const D = window.__t.DATA; return "notes" in D || Object.values(D.terms).some((t) => "note" in t); });
const storedKey = (page) => page.evaluate(() => localStorage.getItem("riglam.dataKey"));

// the prompt is never shown on its own for a reader who has no key; Options, the definitions note and Explain open it
const openPrompt = async (page) => {
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Enter the Magic Key" }).click();
  await expect(page.locator("#unlock")).toBeVisible();
};

test("without a key the terms work, the definitions are locked, and nothing greets the reader with a prompt", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const term = await firstTerm(page);
  expect(term.d).toBe(LOCKED_TEXT);
  expect(term.d_ru).toBeUndefined();
  expect(term.wylie).toBeTruthy();
  await expect(page.locator("#unlock")).toHaveCount(0);
  expect(await hasNotes(page)).toBe(false);
});

test("Options has a Magic Key row that opens the prompt, and the prompt says what the key is for", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.getByText("so both need the Magic Key")).toBeVisible();
  await page.getByRole("button", { name: "Enter the Magic Key" }).click();
  const dlg = page.locator("#unlock");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Magic Key");
  await expect(dlg).toContainText("tutor");
  await expect(dlg).toContainText("definitions");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dlg).toBeHidden();
  await openPrompt(page); // and again
});

test("the prompt fits the screen and the page behind it does not scroll sideways", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
  const box = await page.locator("#unlock").boundingBox();
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  expect(box.y + box.height).toBeLessThanOrEqual(h);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("text that is not a key is refused in the prompt", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
  await page.fill("#unlock-key", "hello");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#unlock-err")).toContainText("not a Magic Key");
  expect(await storedKey(page)).toBeNull();
});

test("a key that does not fit is refused, in the prompt and in a link (a link opens the prompt by itself)", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
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

test("in the Terms panel a locked definition says where to look it up, and one note offers the Magic Key", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click(); // answer the pair: the result has the Terms panel
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  await page.getByRole("tab", { name: "Terms" }).click();
  const terms = page.locator(".tm-tog");
  await expect(terms.first()).toBeVisible();
  await terms.first().click();
  await expect(page.getByText(/Look it up in the booklet, chapter [IVX]+: /).first()).toBeVisible();
  await expect(page.getByText(/Locked: /)).toHaveCount(0); // no "locked" line under each term any more
  await expect(page.getByText("To read the full definitions here, enter the Magic Key")).toHaveCount(1);
  await page.locator(".tm-locked").getByRole("button", { name: "Enter the Magic Key" }).click();
  await expect(page.locator("#unlock")).toBeVisible();
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

withKey("pasting the link into the prompt opens the definitions", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
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
