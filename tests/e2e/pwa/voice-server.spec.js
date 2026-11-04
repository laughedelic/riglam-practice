// The server's natural voices for read aloud (src/pwa/speak.ts, worker/speak.ts, src/ui/speech.ts): the Read aloud page lists them, a sentence is read with the
// clip the real Worker makes (on a fake database, through the bridge, with a stand-in for Google's Text-to-Speech), the device's voice reads when the server cannot,
// and the clips of what a screen asks next are fetched while one is answered. The browser's own speech is stood in for as in voice.spec.js.
import { test, expect } from "../../support/test.js";
import { readFileSync } from "node:fs";
import { answerFirst, goTo, openSettings, ready } from "../../support/page.js";
import { voice, said } from "../../support/voice.js";
import { KEY_STORE, dataKey } from "../../support/data-key.js";
import { bridge, serverWorld } from "../../support/server-bridge.js";

/** The question of Pervasions on the path now: "Q1" to "Q4". */
const qNow = (page) => page.locator("#path .sb.now .qnm");
const sheet = (page) => page.getByRole("dialog", { name: "Practice options" });
const openPracticeOptions = async (page) => { await page.getByRole("button", { name: "Practice options" }).click(); await expect(sheet(page)).toBeVisible(); };
const readPage = (page) => sheet(page).getByRole("button", { name: "Read aloud: more" });
/** The Read aloud page: the voice and its speed (the control at the line's edge: the line itself holds the switch). */
const openReadPage = async (page) => { await openPracticeOptions(page); await readPage(page).click(); };

/* ---------- the server's natural voices (src/pwa/speak.ts, worker/speak.ts) ---------- */
// The page, the real Worker (on a fake database, through the bridge) and a stand-in for Google's Text-to-Speech, which makes a short silent clip and keeps what it was asked.
const CLIP = readFileSync(new URL("../../support/speak-clip.mp3", import.meta.url)).toString("base64");
function googleVoices() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ audioContent: CLIP }), { headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
/** The device has the Magic Key, the server has Google's voices (unless `key` is left out), and the page counts the clips the audio element starts. Read aloud is off unless `settings` has it: the Voice page's Try is what speaks. */
async function serverVoices(page, { key = "google-test-key", env = {}, settings = {} } = {}) {
  const google = googleVoices();
  const world = await serverWorld({ ...(key ? { GOOGLE_TTS_API_KEY: key } : {}), ...env }, { stubCourse: true, fetch: google.fetch });
  const device = await bridge(page, world);
  await page.addInitScript(([store, k]) => localStorage.setItem(store, k), [KEY_STORE, dataKey]);
  await page.addInitScript(() => {
    window.__plays = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!String(this.src).startsWith("data:")) window.__plays++; return play.apply(this, arguments); };
  });
  await voice(page, { settings: { natural: "1", ...settings } });   // the Natural voices switch is on unless a spec says otherwise (off in the real app)
  return { google, world, device };
}
const voiceSelect = (page) => sheet(page).getByRole("combobox", { name: "Voice" });
const plays = (page) => page.evaluate(() => window.__plays);

test("with the server's natural voices: the Read aloud page lists them first with Charon as the default, Try plays the clip, a sentence heard again is not asked for again", async ({ page }) => {
  const { google } = await serverVoices(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  const select = voiceSelect(page);
  await expect(select).toHaveValue("server:charon");
  await expect(select.locator("optgroup").first()).toHaveAttribute("label", "Natural voices · online");
  await expect(select.locator("optgroup").first().locator("option")).toHaveText(["Charon · recommended", "Kore", "Achird", "Sulafat"]);
  await expect(sheet(page)).toContainText("made by Google");
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(() => plays(page)).toBe(1);
  expect(google.calls).toHaveLength(1);
  expect(google.calls[0].body.voice.name).toBe("en-US-Chirp3-HD-Charon");
  expect(google.calls[0].body.input.text).toMatch(/^Do you accept that if it is a product/);
  expect(await said(page)).toEqual([]);   // the device's voice did not read as well
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(() => plays(page)).toBe(2);
  expect(google.calls).toHaveLength(1);   // kept for the visit
});

test("choosing another natural voice reads the sample with it, 'Best on this device' puts the device's voice back, and the choice is kept", async ({ page }) => {
  const { google } = await serverVoices(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  await voiceSelect(page).selectOption("server:kore");
  await expect.poll(() => google.calls.length).toBe(1);
  expect(google.calls[0].body.voice.name).toBe("en-US-Chirp3-HD-Kore");
  await expect.poll(() => plays(page)).toBe(1);
  await voiceSelect(page).selectOption("best");
  await expect.poll(async () => (await said(page)).length).toBe(1);   // the sample, by the device
  expect(google.calls).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-name"))).toBe("best");
  await page.reload();
  await page.locator("#path .chs .crow").first().waitFor();   // started again, in the exercise it was in (Pervasions)
  await openReadPage(page);
  await expect(voiceSelect(page)).toHaveValue("best");
});

test("when the server's characters for the day are used up the device's voice reads, and the server is not asked again until it starts over", async ({ page }) => {
  const { google, device } = await serverVoices(page, { env: { SPEAK_DEVICE_DAILY_CHARS: "10" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  const asked = () => device.seen.filter((r) => r === "POST /api/speak").length;
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(1);   // refused, so the device reads
  expect(asked()).toBe(1);
  expect(google.calls).toHaveLength(0);
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(2);
  expect(asked()).toBe(1);   // not asked a second time
  expect(await plays(page)).toBe(0);
  // and the page says why the device's voice reads, where the voice is chosen
  await expect(sheet(page).getByText("reached today’s limit")).toBeVisible();
});

test("when the server is unreachable the device's voice reads", async ({ page }) => {
  const { world } = await serverVoices(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  world.offline = true;
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(1);
  expect(await plays(page)).toBe(0);
  await expect(sheet(page).getByText("could not be reached just now")).toBeVisible();
});

test("the natural voices are an experiment: with the switch off, the real app's default, the server's voices are not offered or asked for; Experiments has the switch, and turning it on lists them", async ({ page }) => {
  const { google } = await serverVoices(page, { settings: { natural: "0" } });
  await page.addInitScript(() => localStorage.setItem("rd-exp", "1"));   // Experiments shown on this device
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  await expect(voiceSelect(page)).toHaveValue("");
  await expect(voiceSelect(page).locator("option", { hasText: "Charon" })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(1);   // the device's voice read the sample
  expect(google.calls).toHaveLength(0);
  await page.keyboard.press("Escape");
  await openSettings(page);
  const natural = page.getByRole("switch", { name: "Natural voices", exact: true });
  await expect(natural).toHaveAttribute("aria-checked", "false");
  await natural.click();
  await expect(natural).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-natural"))).toBe("1");
  await goTo(page, "Pervasions");
  await openReadPage(page);
  await expect(voiceSelect(page)).toHaveValue("server:charon");
});

test("a server without Google's key has only the device's voices", async ({ page }) => {
  await serverVoices(page, { key: "" });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  await expect(voiceSelect(page)).toHaveValue("");
  await expect(voiceSelect(page).locator("option", { hasText: "Charon" })).toHaveCount(0);
  await expect(sheet(page)).not.toContainText("made by Google");
});

test("a device without the Magic Key has only the device's voices", async ({ page }) => {
  await voice(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openReadPage(page);
  await expect(voiceSelect(page)).toHaveValue("");
  await expect(voiceSelect(page).locator("option", { hasText: "Charon" })).toHaveCount(0);
});

test("with the server's natural voices the questions that come next are fetched while one is answered, so that each is read at once", async ({ page }) => {
  const { google } = await serverVoices(page, { settings: { read: "1" } });
  await page.goto("/");
  await ready(page);
  // Relations asks the relation first: the four examples that may follow it are fetched behind it (which of them is asked depends on the relation)
  await expect.poll(() => google.calls.length).toBe(4);
  expect(google.calls.map((c) => c.body.input.text).every((t) => /^Name something that is /.test(t))).toBe(true);
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect.poll(() => plays(page)).toBe(1);   // Q1 is read, as it comes
  // behind it: Q2 to Q4, the counter-example after Why? and the relation, all asked for while Q1 is answered
  await expect.poll(() => google.calls.length).toBe(10);
  const texts = google.calls.slice(4).map((c) => c.body.input.text);
  expect(texts.filter((t) => /^(.* and .*\. )?Do you accept that/.test(t))).toHaveLength(4);
  expect(texts).toContain("Posit a counter-example.");
  expect(texts).toContain("Which relation do your answers give?");
  await page.getByRole("button", { name: /^Accept/ }).click();
  await expect(qNow(page)).toHaveText("Q2");
  await expect.poll(() => plays(page)).toBe(2);   // read from what was fetched
  expect(google.calls).toHaveLength(10);   // no new request, for it or for what comes after it
  expect(await said(page)).toEqual([]);
});

test("with the server's natural voices the pair that comes next is drawn at the result and its first question fetched, so that it is read at once when it comes", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  const { google } = await serverVoices(page, { settings: { read: "1" } });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => google.calls.length).toBe(4);   // the examples of the pair on screen, behind the relation that is not read (the first question the app shows is not read)
  const texts = () => google.calls.map((c) => c.body.input.text);
  const relationQ = (t) => /\. What is the relation\?$/.test(t);
  await answerFirst(page);   // the result is on screen
  // the next pair is drawn now: its relation question and the four examples that may follow are asked for while the result is read
  await expect.poll(() => google.calls.length).toBeGreaterThanOrEqual(9);
  expect(texts().filter(relationQ)).toHaveLength(1);
  const key = () => page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b);
  const old = await key();
  const had = texts(), playsThen = await plays(page);
  await page.locator("#stn").click();
  await expect.poll(async () => (await key()) !== old).toBe(true);
  const p = await page.evaluate(() => ({ a: window.__t.cur.p.a, b: window.__t.cur.p.b }));
  expect(p.a + "|" + p.b).not.toBe(old);
  expect(had).toContain(p.a + " and " + p.b + ". What is the relation?");   // fetched before the pair was shown
  await expect.poll(() => plays(page)).toBe(playsThen + 1);   // and read from the clip that was fetched
  expect(texts()).toHaveLength(had.length);   // nothing was asked for again, for it or for what comes after it
});

test("and at the stop of a new term, which comes before the question: the pair is drawn again once the term is met, and its first question fetched behind the stop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // a device that has just come to stage 1 and met no term yet: the next pull brings the stop of Form (as in term-stops.spec.js)
  await page.addInitScript(() => {
    window.__riglamTest = (t) => { window.__t = t; };
    localStorage.setItem("rd-stages", "0,1"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms: {} }));
  });
  const { google } = await serverVoices(page, { settings: { read: "1" } });
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  const texts = () => google.calls.map((c) => c.body.input.text);
  await expect.poll(() => google.calls.length).toBeGreaterThanOrEqual(9);   // drawn at the result, before the stop is known to the draw
  const old = await page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b);
  await page.locator("#stn").click();
  await expect(page.locator("#path .tstop")).toBeVisible();
  expect(await page.evaluate(() => !!window.__t.ui.stop)).toBe(true);
  await page.waitForTimeout(600);   // behind the stop the pair is drawn again, now that Form is met, and its words are asked for (the same ones if it is the same pair)
  const had = texts(), playsThen = await plays(page);
  await page.locator("#stn").click();
  await expect.poll(() => page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b)).not.toBe(old);
  const p = await page.evaluate(() => ({ a: window.__t.cur.p.a, b: window.__t.cur.p.b }));
  expect(had).toContain(p.a + " and " + p.b + ". What is the relation?");   // fetched before the pair was shown
  await expect.poll(() => plays(page)).toBe(playsThen + 1);
  expect(texts()).toHaveLength(had.length);
});
