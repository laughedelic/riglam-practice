// Hands-free as a steady conversation (src/app/shell/voice.js, "the beat"): the result stays on screen and the microphone listens for "next", "explain" and "stop"; in Sprint it goes
// on by itself after a bar of 3 s; "repeat" says the question again, "skip" sets the pair aside, "stop" pauses the run until the field is tapped; words that began as the microphone opened
// are met with "I may have missed the start". The browser's speech is stood in for (tests/support/voice.js).
import { test, expect } from "../../support/test.js";
import { goTo, ready } from "../../support/page.js";
import { voice, said, spoken, hearNext, earlyNext, mic, listening, idle, waiting } from "../../support/voice.js";

const verdict = (page) => page.locator("#path .pvline");
const state = (page) => page.locator("#vfield");
const current = (page) => page.evaluate(() => window.__t.cur.c.id);
/** Draws the next syllogism (without answering) until its right reply is `answer`. */
const drawSyllogism = (page, answer) => page.evaluate((a) => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === a) return true; window.__t.next(); } return false; }, answer);
const blitz = (page, ms) => page.addInitScript((t) => { try { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer", String(t)); localStorage.setItem("rd-timer-rel", String(t)); } catch { /* storage unavailable */ } }, ms);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
});

/** Hands-free in Syllogisms with a syllogism whose right reply is "the reason is not established", said, gone on, and its result on screen. */
async function toResult(page, { sprint = false } = {}) {
  await voice(page, { settings: { read: "0", answer: "auto" } });
  if (sprint) await blitz(page, 20000);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");   // moving on by hand: the screens after this one listen by themselves
  expect(await drawSyllogism(page, "reason")).toBe(true);
  await listening(page);
  await hearNext(page, "the reason is not established");
  await expect(verdict(page)).toContainText("Right", { timeout: 10_000 });   // heard, a bar of 1.5 s, and the check
}

test("Hands-free: the result stays until 'next', and the next question comes after it", async ({ page }) => {
  await toResult(page);
  await expect(state(page).locator(".vwhat small")).toHaveText("The result is on screen");
  await expect(state(page).locator(".vwhat b")).toHaveText("Next");
  await expect(state(page).locator(".vrunl")).toHaveCount(0);   // no bar: in a calm run it waits
  const id = await current(page);
  await page.waitForTimeout(2500);
  await expect(verdict(page)).toBeVisible();   // and it is still there
  await listening(page);   // the microphone listens for the word
  await hearNext(page, "next");
  await expect(verdict(page)).toHaveCount(0);
  expect(await current(page)).not.toBe(id);
  await listening(page);   // and the next question is listened to, with no tap
});

test("Hands-free: a tap on the field at the result goes on", async ({ page }) => {
  await toResult(page);
  const id = await current(page);
  await mic(page).click();
  await expect(verdict(page)).toHaveCount(0);
  expect(await current(page)).not.toBe(id);
});

test("Hands-free in Sprint: the result goes on by itself after a bar, with no tap", async ({ page }) => {
  await toResult(page, { sprint: true });
  const id = await current(page);
  await expect(state(page).locator(".vrunl")).toHaveCount(1);   // the bar runs
  await expect(verdict(page)).toHaveCount(0, { timeout: 8000 });
  expect(await current(page)).not.toBe(id);
});

test("Hands-free in Sprint: 'explain' stops the bar, and the result then waits for 'next'", async ({ page }) => {
  await toResult(page, { sprint: true });
  const id = await current(page);
  await hearNext(page, "explain");
  await expect(state(page).locator(".vrunl")).toHaveCount(0, { timeout: 5000 });   // Claude is not asked in a test run, but the bar has stopped
  await page.waitForTimeout(3500);
  await expect(verdict(page)).toBeVisible();   // longer than the bar
  expect(await current(page)).toBe(id);
  await listening(page);
  await hearNext(page, "go on");
  await expect(verdict(page)).toHaveCount(0);
});

test("Hands-free: 'stop' pauses the run until the field is tapped, and the clock of a question stands still", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto" } });
  await blitz(page, 20000);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await listening(page);
  await hearNext(page, "stop");
  await idle(page);
  await expect(state(page)).toContainText("Paused");
  expect(await page.evaluate(() => !!window.__t.ui.hold)).toBe(true);   // the Sprint clock waits
  await page.waitForTimeout(800);
  await idle(page);   // nothing listens by itself
  await mic(page).click();
  await listening(page);
  expect(await page.evaluate(() => !!window.__t.ui.hold)).toBe(false);
});

test("Hands-free: 'repeat' says the question again", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "auto" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await spoken(page, 1);
  await listening(page);
  await hearNext(page, "say it again");
  await spoken(page, 2);
  expect((await said(page))[1]).toBe((await said(page))[0]);
});

test("Hands-free: 'skip this syllogism' waits like an answer, then sets the syllogism aside", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  const id = await current(page);
  await listening(page);
  await hearNext(page, "skip this syllogism");
  await expect(waiting(page)).toBeVisible();
  await expect(state(page).locator(".vwhat b")).toHaveText("Skip this syllogism");
  expect(await current(page)).toBe(id);   // nothing is skipped before Yes
  await listening(page);
  await hearNext(page, "yes");
  await expect.poll(() => current(page)).not.toBe(id);
});

test("words that began as the microphone opened are met with 'I may have missed the start'", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await listening(page);
  await earlyNext(page);
  await hearNext(page, "ton of potatoes");
  await expect(state(page)).toContainText("I may have missed the start. Say it again.");
  await listening(page);   // and a new try is open
});

test("a case that runs out of time does not raise the keyboard over the field on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "pwa-phone", "the keyboard rises on a touch screen");
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await blitz(page, 2500);
  await page.goto("/");
  await ready(page);
  await expect(mic(page)).toBeVisible();
  await hearNext(page, "four possibilities");
  await mic(page).click();
  await expect(waiting(page)).toBeVisible();
  await mic(page).click();   // Yes: the relation is taken, the first case begins its clock
  await expect(page.locator("#cin")).toBeVisible();
  await page.waitForTimeout(3500);   // the case runs out of time
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).not.toBe("cin");
  await expect(mic(page)).toBeVisible();
});

const chip = (page) => page.locator("#vfield .vchip");

test("Hands-free: 'stop' said while the last step can still be taken back pauses the run and does not take it back", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await listening(page);
  await hearNext(page, "there is no pervasion");
  await expect(chip(page)).toBeVisible({ timeout: 10_000 });   // it went on to the counter-example, and can be taken back for a few seconds
  await listening(page);
  await hearNext(page, "stop");
  await expect(state(page)).toContainText("Paused");
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);   // still at the counter-example
});

test("a pause belongs to Hands-free: an exercise that answers by tap does not inherit it, and its clock runs", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto" } });
  await page.addInitScript(() => { try { localStorage.setItem("rd-per-ex", JSON.stringify({ practice: { answer: "tap" } })); } catch { /* storage unavailable */ } });
  await blitz(page, 20000);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await listening(page);
  await hearNext(page, "stop");
  await expect(state(page)).toContainText("Paused");
  expect(await page.evaluate(() => !!window.__t.ui.hold)).toBe(true);
  await goTo(page, "Relations");   // its own Answer setting is Tap
  await expect(mic(page)).toBeVisible();
  await expect(state(page)).not.toContainText("Paused");
  await expect.poll(() => page.evaluate(() => !!window.__t.ui.hold)).toBe(false);   // the question is timed
});

test("Hands-free: 'skip it' at the counter-example leaves it out, and does not set the syllogism aside", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await listening(page);
  await hearNext(page, "there is no pervasion");
  await expect(waiting(page)).toBeVisible();
  await mic(page).click();   // Yes
  await expect(chip(page)).toBeVisible();
  await listening(page);
  await hearNext(page, "skip it");
  await expect(waiting(page)).toBeVisible();
  await expect(state(page).locator(".vwhat b")).toHaveText("no counter-example");
});

test("Hands-free: a passing 'right' at the result does not go on, 'okay' does", async ({ page }) => {
  await toResult(page);
  const id = await current(page);
  await listening(page);
  await hearNext(page, "right");
  await expect(state(page)).toContainText("Say “next”");
  expect(await current(page)).toBe(id);
  await expect(verdict(page)).toBeVisible();
  await listening(page);
  await hearNext(page, "okay");
  await expect(verdict(page)).toHaveCount(0);
});

for (const [what, set] of [["Claude's explanation arrives", () => { window.__t.ui.explained = true; }], ["a definition is opened", () => { window.__t.ui.dterm = "x"; }]]) test(`Hands-free in Sprint: when ${what} after the bar began, the bar holds`, async ({ page }) => {
  await toResult(page, { sprint: true });
  const id = await current(page);
  await page.evaluate(set);
  await page.waitForTimeout(3800);
  await expect(verdict(page)).toBeVisible();
  expect(await current(page)).toBe(id);
  await expect(state(page).locator(".vrunl")).toHaveCount(0);
});

test("Hands-free: after 'stop' at a result a tap listens again for 'next', and 'next' goes on", async ({ page }) => {
  await toResult(page);
  const id = await current(page);
  await listening(page);
  await hearNext(page, "stop");
  await expect(state(page)).toContainText("Paused");
  await idle(page);
  await mic(page).click();
  await expect(verdict(page)).toBeVisible();   // the tap resumed; it did not go on
  await listening(page);
  await hearNext(page, "next");
  await expect(verdict(page)).toHaveCount(0);
  expect(await current(page)).not.toBe(id);
});

test("Hands-free, waiting for Yes: 'again' says the question again and the answer keeps waiting; 'stop' and a tap listen for 'yes' again", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "auto", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await listening(page);
  await hearNext(page, "there is no pervasion");
  await expect(waiting(page)).toBeVisible();
  await listening(page);   // for "yes"
  await hearNext(page, "again");
  await expect(state(page)).toContainText("Read aloud is off");
  await expect(waiting(page)).toBeVisible();   // not taken back
  await listening(page);
  await hearNext(page, "stop");
  await expect(state(page)).toContainText("Paused");
  await idle(page);
  await mic(page).click();   // goes on: the answer still waits, and the microphone listens for "yes"
  await expect(waiting(page)).toBeVisible();
  await listening(page);
});
