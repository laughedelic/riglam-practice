// Voice: the questions read aloud and answers by voice (src/app/shell/voice.js), a feature on trial (src/ui/features.ts) that
// these specs turn on for the device unless they test the switch itself. A heard answer waits for Confirm (or "yes"), or goes on
// by itself after a pause when Options says so. The browser's speech is stood in for:
// speechSynthesis notes what it is asked to say and ends each utterance at once; SpeechRecognition answers each start
// with the next phrase the test queued (a phrase, or a list of guesses best first), or with "no-speech" when none comes.
import { test, expect } from "../../support/test.js";
import { ready, isPhone, overflow } from "../../support/page.js";

/** Stands in for the browser's speech. `settings` are the rd-voice-* values to start with; `heard` the phrases queued from the start; `trial` turns the feature on. */
async function voice(page, { settings = {}, heard = [], none = false, trial = true } = {}) {
  await page.addInitScript(({ settings, heard, none, trial }) => {
    if (trial && localStorage.getItem("riglam.features") === null) localStorage.setItem("riglam.features", "voice");
    for (const [k, v] of Object.entries(settings)) localStorage.setItem("rd-voice-" + k, v);
    if (none) {
      for (const k of ["speechSynthesis", "SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, k, { value: undefined, configurable: true });
      return;
    }
    const said = (window.__said = []);
    window.__heard = heard.slice();
    window.__listens = 0;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    const synth = {
      paused: false, cur: null,
      getVoices: () => [
        { name: "Daniel", lang: "en-GB", voiceURI: "Daniel", localService: true },
        { name: "Samantha", lang: "en-US", voiceURI: "Samantha", localService: true },
        { name: "Karen", lang: "en_AU", voiceURI: "Karen", localService: true },
        { name: "Google UK English Female", lang: "en-GB", voiceURI: "Google UK English Female", localService: false },
        { name: "Google US English", lang: "en-US", voiceURI: "Google US English", localService: false },
        { name: "Anna", lang: "de-DE", voiceURI: "Anna", localService: true },
      ],
      addEventListener() {}, resume() {},
      cancel() { const u = this.cur; this.cur = null; if (u && u.onerror) u.onerror({ error: "interrupted" }); },
      speak(u) { said.push(u.text); this.cur = u; setTimeout(() => { if (this.cur === u) { this.cur = null; if (u.onend) u.onend({}); } }, 20); },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    class Recognition {
      start() {
        window.__listens++;
        if (window.__dead) return;   // a recognizer that never says anything, not even that it ended
        const t0 = Date.now();
        const tick = () => {
          if (this.gone) return;
          if (!window.__heard.length && Date.now() - t0 < 3000) { setTimeout(tick, 30); return; }
          if (this.onaudiostart) this.onaudiostart();
          const next = window.__heard.shift();
          if (next == null) { if (this.onerror) this.onerror({ error: "no-speech" }); }
          else {
            const res = Object.assign([].concat(next).map((t) => ({ transcript: t, confidence: 0.9 })), { isFinal: true });
            if (this.onresult) this.onresult({ resultIndex: 0, results: [res] });
          }
          if (this.onend) this.onend();
        };
        setTimeout(tick, 30);
      }
      stop() {}
      abort() { this.gone = true; }
    }
    window.SpeechRecognition = Recognition;
    window.webkitSpeechRecognition = Recognition;
  }, { settings, heard, none, trial });
}
const said = (page) => page.evaluate(() => window.__said.slice());
const hearNext = (page, ...phrases) => page.evaluate((p) => window.__heard.push(...p), phrases);
const docs = (page, col) => page.evaluate(async (col) => (await (await window.__riglam.platform.db()).collection(col).get()).docs.map((d) => d.data()), col);
const openOptions = (page) => page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
const tab = (page, name) => page.getByRole("tab", { name }).filter({ visible: true }).first().click();
const mic = (page) => page.locator("#vbar .vmic");
const waiting = (page) => page.locator("#vbar .vtake");
const confirm = (page) => page.locator("#vbar .vok").click();
/** Waits until the recognizer has taken what was queued and the mic is idle again, so the next phrase never meets a listening mic. */
async function settle(page) {
  await page.waitForFunction(() => !window.__heard.length);
  await expect(mic(page)).not.toContainText("Listening");
}
/** Says a phrase with the mic button, and waits for the answer it was taken as to appear. */
async function hear(page, ...phrases) {
  await hearNext(page, ...phrases);
  await mic(page).click();
  await settle(page);
  await expect(waiting(page)).toBeVisible();
}

test("voice is off until its switch in Options turns it on; the switch stays there either way", async ({ page }) => {
  await voice(page, { trial: false, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  expect(await said(page)).toEqual([]);
  await openOptions(page);
  const sw = page.locator(".vopts").getByRole("switch", { name: /^voice/i });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // nothing else of the Voice row until it is on

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: /read aloud/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("riglam.features"))).toBe("voice");
  await page.reload();   // the choice is kept on the device
  await ready(page);
  await expect(page.locator("#vbar")).toBeVisible();

  await openOptions(page);
  await page.getByRole("switch", { name: /^voice/i }).click();
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /^voice/i })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("riglam.features"))).toBeNull();
});

test("the address can turn voice on for a device too, and is cleaned afterwards", async ({ page }) => {
  await voice(page, { trial: false, settings: { read: "1", answer: "tap" } });
  await page.goto("/?features=voice");
  await ready(page);
  await expect(page.locator("#vbar")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("with no speech in the browser there is no Voice row and no voice bar", async ({ page }) => {
  await voice(page, { none: true, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  await openOptions(page);
  await expect(page.getByRole("switch", { name: /^voice/i })).toHaveCount(0);
});

test("both settings are off at first; Options turns them on, lists the voices by accent, reads a sample and keeps the choice", async ({ page }) => {
  await voice(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  expect(await said(page)).toEqual([]);
  await openOptions(page);
  const row = page.locator(".vopts");
  await row.getByRole("switch", { name: /read aloud/i }).click();
  await expect(row.getByRole("switch", { name: /read aloud/i })).toHaveAttribute("aria-checked", "true");
  expect((await said(page)).at(-1)).toMatch(/^Do you accept that/);
  // the English voices, by accent, American and British first; the best (Google's) first in each; the German one is not listed
  const sel = row.getByLabel("Voice", { exact: true });
  await expect(sel).toBeVisible();
  expect(await sel.evaluate((s) => [...s.querySelectorAll("optgroup")].map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.textContent.split(" · ")[0])])))
    .toEqual([["American", ["Google US English"]], ["British", ["Google UK English Female", "Daniel"]], ["Australian", ["Karen"]]]);
  await expect(sel.locator("option").first()).toHaveText("Best on this device (Google US English)");
  await row.getByRole("button", { name: "Hands-free" }).click();
  await expect(row.getByRole("group", { name: "After an answer is heard" })).toBeVisible();
  await row.getByRole("button", { name: "Go on by itself" }).click();
  expect(await page.evaluate(() => ["read", "answer", "confirm"].map((k) => localStorage.getItem("rd-voice-" + k)))).toEqual(["1", "auto", "auto"]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Pervasions: each question is read aloud and answered with the mic; the answer waits on its own question for Confirm", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await expect(page.locator(".qcard")).toBeVisible();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^.+ and .+\. Do you accept that if it is .+, it follows it is not .+\?$/);

  // Why? with the example in one breath: it is shown with what it was taken as, on this question, and goes on at Confirm
  await hear(page, "Why? A wooden table.");
  await expect(page.locator(".qcard .qn")).toContainText("Question 1");
  await expect(page.locator("#vbar .vwhat small")).toHaveText("Heard");   // it is what was said, so there is no "taken as"
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Why? a wooden table");
  await confirm(page);
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#vbar .vst")).not.toContainText("Heard");   // nothing of the last answer on the next question
  for (const n of [3, 4]) {
    await hear(page, "I accept");
    await confirm(page);
    await expect(page.locator(".qcard .qn")).toContainText("Question " + n);
  }
  await hear(page, "except");   // how a recognizer often hears "accept"
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Accept");
  await expect(page.locator("#vbar .vwhat small")).toHaveText("Heard “except”, taken as");
  await confirm(page);
  await expect.poll(async () => (await said(page)).at(-1)).toBe("Which relation do your answers give?");

  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Four possibilities");
  await page.keyboard.press("Enter");   // Enter confirms too
  await expect(page.locator("#vbar")).toHaveCount(0);
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.chosen).toBe("4");
  expect(d.qs.map((q) => q.say)).toEqual(["why", "accept", "accept", "accept"]);
  expect(d.qs[0].text).toBe("a wooden table");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("a heard answer can be taken back with Change, with \"no\" or by saying another, and a wait is not counted in the response time", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await expect(page.locator(".qcard")).toBeVisible();

  await hear(page, "I accept");
  await page.waitForTimeout(1600);   // the answer waits; the time it waits is not the time the answer took
  await page.locator("#vbar .vno").click();   // Change: gone, and the mic is open again for the right answer
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#vbar .vmic")).toContainText("Listening");
  await expect(page.locator(".qcard .qn")).toContainText("Question 1");
  await hearNext(page, "why a gold ring");   // the open mic takes it
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Why? a gold ring");
  await hearNext(page, "wooden table");   // another answer replaces the waiting one ("why" is implied for an item named alone)
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Why? wooden table");
  await hearNext(page, "no");
  await page.keyboard.press("v");
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#vbar .vmic")).toContainText("Listening");   // and open again
  await hearNext(page, "yes");   // "yes" with nothing waiting is the answer Accept
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Accept");
  await hearNext(page, "yes");   // and with an answer waiting it confirms
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await expect(waiting(page)).toHaveCount(0);

  for (const n of [3, 4, 5]) {
    await hear(page, "accept");
    await page.keyboard.press("Enter");
    if (n < 5) await expect(page.locator(".qcard .qn")).toContainText("Question " + n);
  }
  await hear(page, "mutually exclusive");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.qs[0].ms).toBeLessThan(1200);
});

test("Relations, hands-free: the relation and each example are heard in turn, each confirmed by \"yes\", and the answer is checked", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["mutually exclusive", "yes", "a gold ring", "yes", "nothing", "yes", "the horn of a rabbit", "yes"] });
  await page.goto("/");
  await expect(page.locator("#stage .head .pair")).toBeVisible();   // not ready(): the relation may be heard before the list is looked at
  await expect.poll(() => docs(page, "answers").then((a) => a.length), { timeout: 10_000 }).toBe(1);
  const [a] = await docs(page, "answers");
  expect(a.chosen).toBe("con");
  expect([a.cells.anb.text, a.cells.bna.text, a.cells.nei.text]).toEqual(["a gold ring", "", "the horn of a rabbit"]);
  // the field never took the focus, so a phone keeps its keyboard down
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toBe("INPUT");
});

test("\"Go on by itself\": the answer shows a running bar, goes on after the pause, and Change stops it", async ({ page }, testInfo) => {
  await voice(page, { settings: { answer: "tap", confirm: "auto" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vrun")).toBeVisible();
  await expect(page.locator("#vbar .vok")).toHaveCount(0);
  await page.locator("#vbar .vno").click();   // stopped before the pause ran out
  await expect(waiting(page)).toHaveCount(0);
  await page.waitForTimeout(4600);
  await expect(page.locator(".strip .chip[aria-pressed=true], #cin")).toHaveCount(0);   // nothing was chosen

  await hearNext(page, "mutually exclusive");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Mutually exclusive");
  await expect(page.locator(".strip .chip[aria-pressed=true], #cin")).toHaveCount(0);   // still waiting
  await page.waitForTimeout(4600);   // 4 seconds without Blitz
  if (isPhone(testInfo)) await expect(page.locator("#cin")).toBeVisible();
  else await expect(page.locator(".strip .chip[aria-pressed=true]")).toHaveCount(1);
  await expect(waiting(page)).toHaveCount(0);
});

test("with Blitz on the countdown stops while an answer waits, and goes on when it is taken back", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  const bar = page.locator(".qcard .tbar i");
  await expect(bar).toHaveCount(1);   // the question's countdown runs
  await expect(bar).toHaveCSS("animation-play-state", "running");
  await hear(page, "accept");
  await expect(bar).toHaveCSS("animation-play-state", "paused");   // stands still while the answer waits
  await page.locator("#vbar .vno").click();
  await expect(bar).toHaveCSS("animation-play-state", "running");   // and runs again
  await hearNext(page, "accept");
  await page.keyboard.press("v");
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await confirm(page);
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await expect(bar).toHaveCount(1);   // the next question has its own
});

test("the relation said as what is written under the option, or three possibilities and then which is inside", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const [a, b] = await page.locator("#stage .head .pair .tx").allTextContents();
  await hear(page, `all ${b} are ${a}, but not the reverse`);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Three possibilities, B in A");
  // the same through "three possibilities", whose direction the page asks for; the recognizer writes "A in B" as it likes
  await hearNext(page, "three possibilities");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vst")).toHaveText(`Three possibilities: which is inside the other, ${a} or ${b}?`);
  await hearNext(page, "ANB");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Three possibilities, A in B");
  await hearNext(page, "A & B");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Three possibilities, A in B");
  await hearNext(page, "three possibilities");   // asked again, and this time the term that is inside is the answer
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat")).toHaveCount(0);
  await hearNext(page, b);
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Three possibilities, B in A");
});

test("words that are not an answer are said back, and the mic stays for another try", async ({ page }, testInfo) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const hint = "Say the relation, such as “four possibilities”, or what is written under it.";
  await expect(page.locator("#vbar .vst")).toHaveText(hint);
  await hearNext(page, "good morning");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vbar .vst")).toHaveText("Heard “good morning”. " + hint);
  await hearNext(page, "three possibilities");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vbar .vst")).toContainText("which is inside the other");
  await hearNext(page, "B in A");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Three possibilities, B in A");
  await expect(page.locator("#vbar .vwhat small")).toHaveText("Heard “B in A”, taken as");
  await confirm(page);
  if (isPhone(testInfo)) await expect(page.locator("#cin")).toBeVisible();
  else await expect(page.locator(".strip .chip[aria-pressed=true]")).toHaveCount(1);
  // the next screen asks for the first example and shows nothing of the last answer
  await expect(page.locator("#vbar .vst")).not.toContainText("Heard");
});

test("a recognizer that never ends does not leave the mic stuck: the next tap ends it and the one after listens", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__dead = true; });
  await mic(page).click();
  await expect(mic(page)).toContainText("Listening");
  await mic(page).click();   // stop it; the recognizer does not answer, so the page ends the listening itself
  await expect(mic(page)).toContainText("Speak");
  await expect(page.locator("#vbar .vst")).toContainText("Nothing was heard");
  await page.evaluate(() => { window.__dead = false; });
  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Four possibilities");
});
