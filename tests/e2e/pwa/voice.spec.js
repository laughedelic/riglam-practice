// Voice: the questions read aloud and answers by voice (src/app/shell/voice.js), a feature on trial (src/ui/features.ts) that
// these specs turn on for the device unless they test the switch itself. The browser's speech is stood in for:
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
        { name: "Google US English", lang: "en-US", voiceURI: "Google US English", localService: false },
        { name: "Samantha", lang: "en-US", voiceURI: "Samantha", localService: true },
        { name: "Daniel", lang: "en-GB", voiceURI: "Daniel", localService: true },
      ],
      addEventListener() {}, resume() {},
      cancel() { const u = this.cur; this.cur = null; if (u && u.onerror) u.onerror({ error: "interrupted" }); },
      speak(u) { said.push(u.text); this.cur = u; setTimeout(() => { if (this.cur === u) { this.cur = null; if (u.onend) u.onend({}); } }, 20); },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    class Recognition {
      start() {
        window.__listens++;
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

test("voice is off until the address turns it on for the device; Options turns it off again", async ({ page }) => {
  await voice(page, { trial: false, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  await openOptions(page);
  await expect(page.locator(".vopts")).toHaveCount(0);
  expect(await said(page)).toEqual([]);

  await page.goto("/?features=voice");
  await ready(page);
  await expect(page.locator("#vbar")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");   // the parameter is taken out of the address
  await page.reload();
  await ready(page);
  await expect(page.locator("#vbar")).toBeVisible();   // and the choice is kept on the device

  await openOptions(page);
  await page.getByRole("switch", { name: /^voice/i }).click();
  await expect(page.locator(".vopts")).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("riglam.features"))).toBeNull();
});

test("with no speech in the browser there is no Voice row and no voice bar", async ({ page }) => {
  await voice(page, { none: true, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);
  await openOptions(page);
  await expect(page.locator(".vopts")).toHaveCount(0);
});

test("both are off at first; Options turns them on, reads a sample and keeps the choice", async ({ page }) => {
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
  await expect(row.getByLabel("Voice", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Hands-free" }).click();
  expect(await page.evaluate(() => [localStorage.getItem("rd-voice-read"), localStorage.getItem("rd-voice-answer")])).toEqual(["1", "auto"]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Pervasions: each question is read aloud, and answered by voice with the mic", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await expect(page.locator(".qcard")).toBeVisible();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^.+ and .+\. Do you accept that if it is .+, it follows it is not .+\?$/);

  // Why? with the example in one breath, then Accept three times; each new question is read
  await hearNext(page, "Why? A wooden table.");
  await mic(page).click();
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await expect(page.locator("#vbar .vst")).toHaveText("Heard “Why? A wooden table”.");
  for (const n of [3, 4]) {
    await hearNext(page, "I accept");
    await mic(page).click();
    await expect(page.locator(".qcard .qn")).toContainText("Question " + n);
  }
  await hearNext(page, "except");   // how a recognizer often hears "accept"
  await mic(page).click();
  await expect.poll(async () => (await said(page)).at(-1)).toBe("Which relation do your answers give?");

  await hearNext(page, "four possibilities");
  await mic(page).click();
  await expect(page.locator("#vbar")).toHaveCount(0);
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.chosen).toBe("4");
  expect(d.qs.map((q) => q.say)).toEqual(["why", "accept", "accept", "accept"]);
  expect(d.qs[0].text).toBe("a wooden table");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Relations, hands-free: the relation and each example are heard in turn, and the answer is checked", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["mutually exclusive", "a gold ring", "nothing", "the horn of a rabbit"] });
  await page.goto("/");
  await expect(page.locator("#stage .head .pair")).toBeVisible();   // not ready(): the relation may be heard before the list is looked at
  await expect.poll(() => docs(page, "answers").then((a) => a.length), { timeout: 10_000 }).toBe(1);
  const [a] = await docs(page, "answers");
  expect(a.chosen).toBe("con");
  expect([a.cells.anb.text, a.cells.bna.text, a.cells.nei.text]).toEqual(["a gold ring", "", "the horn of a rabbit"]);
  // the field never took the focus, so a phone keeps its keyboard down
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toBe("INPUT");
});

test("words that are not an answer are said back, and the mic stays for another try", async ({ page }, testInfo) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar .vst")).toHaveText("Say the relation, such as “four possibilities”.");
  await hearNext(page, "good morning");
  await mic(page).click();
  await expect(page.locator("#vbar .vst")).toHaveText("Heard “good morning”. Say the relation, such as “four possibilities”.");
  await hearNext(page, "three possibilities");
  await mic(page).click();
  await expect(page.locator("#vbar .vst")).toContainText("which way?");
  await hearNext(page, "B in A");
  await page.keyboard.press("v");
  if (isPhone(testInfo)) await expect(page.locator("#cin")).toBeVisible();
  else await expect(page.locator(".strip .chip[aria-pressed=true]")).toHaveCount(1);
  await expect(page.locator("#vbar .vst")).toHaveText("Heard “B in A”, taken as “Three possibilities, B in A”. Next: Both A and B.");
});
