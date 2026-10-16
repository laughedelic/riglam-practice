// The course part of the term data in the installed app: locked without the Magic Key, fetched from the server with the key in
// the study group's link (kept on the device with the key, also offline), and the prompt for a reader who has no link. Uses the
// plain Playwright test, so each page starts with nothing stored; the server is a stand-in (tests/support/data-key.js). The specs
// that need the real definitions skip when data-private/ is not here (docs/DATA.md).
import { test, expect } from "@playwright/test";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { testMagicKey } from "../../support/magic-key.ts";
import { ready, overflow, relOptions, isPhone } from "../../support/page.js";
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
  await expect(page.locator("#unlock-err")).toContainText("does not look like a Magic Key");
  expect(await storedKey(page)).toBeNull();
});

test("a key that does not fit is refused, in the prompt and in a link (a link opens the prompt by itself)", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
  await page.fill("#unlock-key", `https://riglam.example/#k=${generateKey()}`);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#unlock-err")).toContainText("not the Magic Key");
  expect(await storedKey(page)).toBeNull();

  await page.goto(`/?again=1#k=${generateKey()}`);
  await ready(page);
  await expect(page.locator("#unlock-err")).toContainText("does not fit");
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(await storedKey(page)).toBeNull();
});

test("a link without a usable key says so and leaves the address clean", async ({ page }) => {
  await page.goto("/#k=short"); // one word is not a Magic Key
  await ready(page);
  await expect(page.locator("#unlock-err")).toContainText("no Magic Key in it");
  expect(await page.evaluate(() => location.hash)).toBe("");
});

// answers the pair on the screen far enough to get the result
const answerFirstPair = async (page) => {
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
};

// answers the first pair far enough to get the result with its Terms panel, and opens the list of definitions
const openTermDefinitions = async (page) => {
  await page.goto("/");
  await ready(page);
  await answerFirstPair(page); // the result has the Terms panel
  await page.getByRole("tab", { name: "Terms" }).click();
  const terms = page.locator(".tm-tog");
  await expect(terms.first()).toBeVisible();
  await terms.first().click();
};

test("in the Terms panel a locked definition says where to look it up, and one note offers the Magic Key", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await openTermDefinitions(page);
  await expect(page.getByText(/Look it up in the booklet, chapter [IVX]+: /).first()).toBeVisible();
  await expect(page.getByText(/Locked: /)).toHaveCount(0); // no "locked" line under each term any more
  await expect(page.getByText("To read the full definitions here, enter the Magic Key")).toHaveCount(1);
  await page.locator(".tm-locked").getByRole("button", { name: "Enter the Magic Key" }).click();
  await expect(page.locator("#unlock")).toBeVisible();
});

test("locked definitions still show the Russian name of each term when English + Russian is chosen, and only then", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(hook);
  await openTermDefinitions(page);
  await expect(page.locator(".tm-locked .tm-d").first()).toBeVisible();
  await expect(page.locator(".tm-locked .tm-ru")).toHaveCount(0); // English only: the name alone
  await page.evaluate(() => window.__t.setDefLang("enru"));
  const names = page.locator(".tm-locked .tm-d dt");
  const russian = page.locator(".tm-locked .tm-d dt .tm-ru");
  await expect(russian.first()).toBeVisible();
  expect(await russian.count()).toBe(await names.count()); // the open data names every term in Russian
  await expect(russian.first()).toHaveAttribute("lang", "ru");
});

test("a locked term from every booklet section says where to look it up", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const lines = await page.evaluate(() => {
    const T = window.__t.DATA.terms, first = {};
    for (const n of Object.keys(T)) if (T[n].ch && !first[T[n].ch]) first[T[n].ch] = n;
    return Object.entries(first).map(([ch, n]) => [ch, window.__t.lockedDefs([n]).querySelector(".src")?.textContent ?? ""]);
  });
  expect(lines.length).toBeGreaterThan(10); // the chapters I to XI, the Dampilon tables and the sections without a numeral
  for (const [ch, line] of lines) expect(line, ch).toMatch(/^Look it up in /);
  expect(lines.map(([, line]) => line)).toContain("Look it up in the booklet, section Debate.");
});

test("the page opens without waiting for the server to say whether it has a tutor, and grays Explain when it does", async ({ page }, testInfo) => {
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
  await expect(page.locator("button.needs-key")).toHaveCount(0);
  release();
  if (!isPhone(testInfo)) return; // the answer flow is exercised in the phone layout
  await answerFirstPair(page);
  await expect(page.locator("button.needs-key")).toHaveText("Explain");
  await expect(page.locator("button.needs-key")).toHaveAttribute("aria-disabled", "true");
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
  await expect(page.locator("#unlock")).toHaveCount(0);
  expect(await storedKey(page)).toBe(dataKey);

  await page.goto("/"); // a later visit without the link
  await ready(page);
  expect((await firstTerm(page)).d).toBe(full.terms[name].d);
});

withKey("the words typed with spaces, in any case, open the definitions", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await openPrompt(page);
  await page.fill("#unlock-key", dataKey.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(", "));
  await Promise.all([page.waitForLoadState("load"), page.getByRole("button", { name: "Unlock" }).click()]);
  await ready(page);
  expect((await firstTerm(page)).d).not.toBe(LOCKED_TEXT);
  expect(await storedKey(page)).toBe(dataKey);
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
  await expect(page.locator("#unlock")).toHaveCount(0);
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
  await ready(page);
  await expect(page.locator("#unlock-err")).toContainText(/Too many tries from this network\. Try again in \d+ minutes?\./);
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
  await ready(page);
  expect((await firstTerm(page)).d).toBe(LOCKED_TEXT);
  await expect(page.locator("#unlock")).toBeVisible();
  await expect(page.locator("#unlock-err")).toContainText("The Magic Key was changed");
  await page.goto("/?again=4"); // and then leaves the reader alone
  await ready(page);
  await expect(page.locator("#unlock")).toHaveCount(0);
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
  await ready(page);
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
