// The course part of the term data in the installed app: locked without the Magic Key, fetched from the server with the key in
// the study group's link (kept on the device with the key, also offline), and Settings' Magic Key page for a reader who has no link. Uses the
// plain Playwright test, so each page starts with nothing stored; the server is a stand-in (tests/support/data-key.js). The specs
// that need the real definitions skip when data-private/ is not here (docs/DATA.md).
import { test, expect } from "@playwright/test";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { testMagicKey } from "../../support/magic-key.ts";
import { ready, overflow, openMenu, roadmap, openSettingsPage, keyField, enterKey } from "../../support/page.js";
import { readFull } from "../../../scripts/lib/course-files.mjs";
import { LOCKED_TEXT } from "../../../src/data/course.js";

const withKey = withCourse ? test : test.skip; // no data-private/: the specs that need the real definitions are skipped
const generateKey = testMagicKey; // a Magic Key the stand-in server does not know

test.beforeEach(async ({ page }) => { await serveCourse(page); });

// lets the spec read the page's data without asking the build for it again
const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const firstTerm = (page) => page.evaluate(() => { const T = window.__t.DATA.terms; return T[Object.keys(T)[0]]; });
const hasNotes = (page) => page.evaluate(() => { const D = window.__t.DATA; return "notes" in D || Object.values(D.terms).some((t) => "note" in t); });
const storedKey = (page) => page.evaluate(() => localStorage.getItem("riglam.magicKey"));

// the Magic Key page is never opened on its own for a reader who has no key; the roadmap's Magic Key, Explain and a flag open it, and so does a key that went wrong at the start
const openKeyPage = async (page) => {
  await openMenu(page);
  await roadmap(page).locator(".rfoot").getByRole("button", { name: "Magic Key" }).click();
  await expect(keyField(page)).toBeVisible();
};
const said = (page) => page.locator(".ppage [role=alert]");

test("without a key the terms work, the definitions are locked, and nothing greets the reader with the Magic Key", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const term = await firstTerm(page);
  expect(term.d).toBe(LOCKED_TEXT);
  expect(term.d_ru).toBeUndefined();
  expect(term.wylie).toBeTruthy();
  await expect(roadmap(page)).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
  expect(await hasNotes(page)).toBe(false);
});

test("the roadmap's Magic Key opens the Magic Key page: what the key is, its field ready to type in, and the way back to the roadmap", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  const pg = page.locator(".ppage");
  await expect(pg).toContainText("The Magic Key is a phrase that unlocks the definitions");
  await expect(pg).toContainText("open the app’s link again or paste it here");
  await expect(keyField(page)).toHaveAttribute("placeholder", "the phrase or the link");
  await expect(keyField(page), "the field is ready, so a phone's keyboard comes up with the tap").toBeFocused();
  await pg.getByText("Why “Magic Key”?").click();
  await expect(pg).toContainText("The Magic Key to the Path of Reasoning");
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();
  await expect(roadmap(page)).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
  await openKeyPage(page); // and again
});

// Opened where the key is needed, the page is one step: Escape and the system Back go back to where it was opened, not to the list of Settings.
test("Escape and Back on the Magic Key page go straight back to the roadmap it was opened from", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  await page.keyboard.press("Escape");
  await expect(roadmap(page)).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
  await openKeyPage(page);
  await page.goBack();
  await expect(roadmap(page)).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
});

// A device with no key has a fourth link in the roadmap's foot: on a narrow phone the links move into the space at the left rather than wrap.
test("the roadmap's Magic Key stays on one line with Review and Settings, also on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await ready(page);
  await openMenu(page);
  const foot = roadmap(page).locator(".rfoot");
  const tops = await Promise.all(["Review", "Settings", "Magic Key"].map(async (name) => (await foot.getByRole("button", { name: new RegExp("^" + name) }).boundingBox()).y));
  expect(new Set(tops).size, JSON.stringify(tops)).toBe(1);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("text that is not a key is refused on the Magic Key page", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  await enterKey(page, "hello");
  await expect(said(page)).toContainText("does not look like the Magic Key");
  expect(await storedKey(page)).toBeNull();
});

test("a key that does not fit is refused, on the page and in a link (a link opens the page by itself)", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  await enterKey(page, `https://riglam.example/#k=${generateKey()}`);
  await expect(said(page)).toContainText("not the Magic Key");
  expect(await storedKey(page)).toBeNull();

  await page.goto(`/?again=1#k=${generateKey()}`);
  await expect(said(page)).toContainText("does not fit"); // the Magic Key page, over the roadmap
  await expect(keyField(page), "with no tap the field waits: a phone's keyboard would not come up").not.toBeFocused();
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(await storedKey(page)).toBeNull();
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();
  await expect(roadmap(page)).toBeVisible();
});

test("a link without a usable key says so and leaves the address clean", async ({ page }) => {
  await page.goto("/#k=short"); // one word is not a Magic Key
  await expect(said(page)).toContainText("no Magic Key in it");
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test("the page opens without waiting for the server to say whether it has a tutor", async ({ page }) => {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route("**/api/health", async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }).catch(() => {});
  });
  const start = Date.now();
  await page.goto("/");
  await ready(page);
  expect(Date.now() - start).toBeLessThan(3000); // the probe gives up after 4 s: the page must not wait for it
  release();
});

withKey("the key in a link opens the definitions, leaves the address bar, and stays on the device", async ({ page }) => {
  const full = readFull();
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
  await expect(keyField(page)).toHaveCount(0);
  expect(await storedKey(page)).toBe(dataKey);

  await page.goto("/"); // a later visit without the link
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[name].d);
});

withKey("the words typed with spaces, in any case, open the definitions, and the page goes back to the roadmap", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  await page.evaluate(() => { window.__sameDocument = true; });
  await enterKey(page, dataKey.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(", "));
  await expect(roadmap(page)).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
  await expect(roadmap(page).locator(".rfoot").getByRole("button", { name: "Magic Key" })).toHaveCount(0);
  expect((await firstTerm(page)).d).not.toBe(LOCKED_TEXT);
  expect(await storedKey(page)).toBe(dataKey);
  expect(await page.evaluate(() => window.__sameDocument), "the key is taken in place, the page is not reloaded").toBe(true);
});

withKey("a key entered while another one is held replaces it in place", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await page.evaluate(() => { window.__sameDocument = true; });
  await openSettingsPage(page, "Magic Key");
  await page.getByRole("button", { name: "Enter another key" }).click();
  const another = page.getByRole("textbox", { name: "Another Magic Key or link" });
  await expect(another).toBeFocused();
  await another.fill(dataKey.split("-").join(" "));
  await another.press("Enter");
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  expect((await firstTerm(page)).d).not.toBe(LOCKED_TEXT);
  expect(await storedKey(page)).toBe(dataKey);
});

withKey("pasting the link on the Magic Key page opens the definitions", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openKeyPage(page);
  await enterKey(page, `https://riglam.example/#k=${dataKey}`);
  await expect(keyField(page)).toHaveCount(0);
  expect((await firstTerm(page)).d).not.toBe(LOCKED_TEXT);
});

withKey("opening the shared link again offline shows the definitions kept for that key", async ({ page, context }) => {
  const full = readFull();
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  // the stand-in server would still answer a page that is offline, so the way to the definitions is cut here too
  await page.route("**/api/course**", (route) => route.abort("internetdisconnected"));
  await page.goto(`/?again=1#k=${dataKey}`);
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[Object.keys(full.terms)[0]].d);
  await expect(keyField(page)).toHaveCount(0);
  await context.setOffline(false);
});

withKey("once opened, the definitions are there with no network", async ({ page, context }) => {
  const full = readFull();
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

test("too many wrong tries from one network are told as such, with the wait, and the key in a link is kept for later", async ({ page }) => {
  await page.route("**/api/course**", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "later", resetsAt: new Date(Date.now() + 25 * 60_000).toISOString() } }) }));
  await page.goto(`/#k=${dataKey}`);
  await expect(said(page)).toContainText(/Too many tries from this network\. Try again in \d+ minutes?\./);
  expect(await storedKey(page)).toBe(dataKey);
});

withKey("a kept copy opens the page at once; the server is asked in the background, and a key it stops accepting is forgotten with the copy, and the reader is told once", async ({ page }) => {
  const full = readFull();
  await page.addInitScript(hook);
  const first = await serveCourse(page);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  expect(first.map((c) => c.have)).toEqual([null]);

  await page.goto("/?again=1"); // later visit: the copy is there, the server is only asked whether it is current
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[Object.keys(full.terms)[0]].d);
  await expect.poll(() => first.length).toBe(2);
  expect(first[1]).toEqual({ have: "v1", fits: true });
  expect(await storedKey(page)).toBe(dataKey);

  await serveCourse(page, testMagicKey()); // the study group has a new key now
  await page.goto("/?again=2");
  await ready(page);
  expect((await firstTerm(page)).d, "this visit still shows the kept copy").toBe(full.terms[Object.keys(full.terms)[0]].d);
  await expect.poll(() => storedKey(page)).toBeNull();
  await page.goto("/?again=3"); // the next visit says once that the key was changed, and asks for the new one
  await expect(said(page)).toContainText("The Magic Key has changed");
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  await page.goto("/?again=4"); // and then leaves the reader alone
  await ready(page);
  await expect(keyField(page)).toHaveCount(0);
});

withKey("with the key, the Magic Key page can take another one (the old one stays until the new one fits) or forget it, after a question", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await openSettingsPage(page, "Magic Key");
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  await expect(page.getByRole("button", { name: "Enter the Magic Key" })).toHaveCount(0);

  // another key goes in a field of the page; one that does not fit changes nothing
  await page.getByRole("button", { name: "Enter another key" }).click();
  const another = page.getByRole("textbox", { name: "Another Magic Key or link" });
  await another.fill(generateKey());
  await another.press("Enter"); // (on a phone the field's keyboard goes at the first press on the button, and the button moves from under it)
  await expect(page.locator(".ppage [role=alert]")).toContainText("not the Magic Key");
  expect(await storedKey(page)).toBe(dataKey);
  await another.blur();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // forgetting asks first, and "Keep it" leaves everything as it was
  await page.getByRole("button", { name: "Forget the key" }).click();
  await expect(page.locator(".ppage")).toContainText("Forget the Magic Key on this device?");
  await page.getByRole("button", { name: "Keep it" }).click();
  expect(await storedKey(page)).toBe(dataKey);

  await page.getByRole("button", { name: "Forget the key" }).click();
  await page.getByRole("button", { name: "Forget the key" }).click(); // the confirmation
  await ready(page);
  expect(await storedKey(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("riglam.course"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("riglam.keyDeclined")), "an account that carries the key must not hand it back").toBe("1");
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  await openSettingsPage(page, "Magic Key");
  await expect(page.getByRole("textbox", { name: "Magic Key or link", exact: true })).toBeVisible();
});

withKey("forgetting the key stays forgotten when only session storage works", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } }));
  await page.addInitScript(hook);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  await openSettingsPage(page, "Magic Key");
  await page.getByRole("button", { name: "Forget the key" }).click();
  await page.getByRole("button", { name: "Forget the key" }).click(); // the confirmation
  await ready(page);
  expect(await page.evaluate(() => sessionStorage.getItem("riglam.magicKey"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("riglam.keyDeclined"))).toBe("1");
});

withKey("a link with another key, opened when the server cannot be asked, does not let the copy kept for the old key pass as that key's", async ({ page }) => {
  const full = readFull();
  await page.addInitScript(hook);
  await serveCourse(page);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[Object.keys(full.terms)[0]].d);

  const other = testMagicKey();
  await page.route("**/api/course**", (route) => route.abort("internetdisconnected"));
  await page.goto(`/?again=1#k=${other}`);
  await expect(page.locator(".ppage [role=alert]")).toContainText("only be checked online");
  expect((await firstTerm(page)).d, "the other key is not accepted yet, so nothing is open").toBe(LOCKED_TEXT);
  expect(await storedKey(page)).toBe(other); // kept for the next visit, to be asked again

  await page.goto("/?again=2");
  await ready(page);
  expect((await firstTerm(page)).d, "the copy of the old key is gone, not shown as this key's").toBe(LOCKED_TEXT);
});

withKey("an answer about an old key does not undo the key another tab has set in the meantime", async ({ page }) => {
  await page.addInitScript(hook);
  await serveCourse(page);
  await page.goto(`/#k=${dataKey}`);
  await ready(page);

  let hold = (_route) => {};
  const asked = new Promise((resolve) => { hold = resolve; });
  await page.route("**/api/course**", (route) => hold(route)); // the background check of the kept copy waits here
  await page.goto("/?again=1");
  await ready(page);
  const request = await asked;

  const newer = testMagicKey();
  await page.evaluate((key) => localStorage.setItem("riglam.magicKey", key), newer); // another tab unlocked with the new key
  await request.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "not_granted", message: "the Magic Key does not match" } }) });
  await page.waitForTimeout(300);
  expect(await storedKey(page)).toBe(newer);
});
