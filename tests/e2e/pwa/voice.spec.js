// Voice: the questions read aloud and answers by voice (src/app/shell/voice.js), a feature on trial: its switch in Settings is off in the
// real app (and so in this build) until it is turned on, and these specs turn it on for the device unless they test the switch itself.
// The choices are in the Practice options, the microphone is in the middle of the pair bar and a switch in the top bar pauses the reading.
// A heard answer waits for Confirm (or "yes"), or goes on by itself after a pause when the options say so. The browser's speech is stood in for:
// speechSynthesis notes what it is asked to say and ends each utterance at once; SpeechRecognition answers each start
// with the next phrase the test queued (a phrase, or a list of guesses best first), or with "no-speech" when none comes.
import { test, expect } from "../../support/test.js";
import { goTo, openSettings, ready, isPhone, overflow, relOptions } from "../../support/page.js";

/** Stands in for the browser's speech. `settings` are the rd-voice-* values to start with; `heard` the phrases queued from the start; `on` turns the Voice switch on for the device. */
async function voice(page, { settings = {}, heard = [], none = false, on = true } = {}) {
  await page.addInitScript(({ settings, heard, none, on }) => {
    if (on && localStorage.getItem("rd-voice") === null) localStorage.setItem("rd-voice", "1");
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
      speak(u) { said.push(u.text); this.cur = u; setTimeout(() => { if (this.cur === u) { this.cur = null; if (u.onend) u.onend({}); } }, window.__speakMs || 20); },
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
  }, { settings, heard, none, on });
}
const said = (page) => page.evaluate(() => window.__said.slice());
const hearNext = (page, ...phrases) => page.evaluate((p) => window.__heard.push(...p), phrases);
const docs = (page, col) => page.evaluate(async (col) => (await (await window.__riglam.platform.db()).collection(col).get()).docs.map((d) => d.data()), col);
const tab = (page, name) => goTo(page, name);
const mic = (page) => page.locator("#vmic");
const listening = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "true");
const idle = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "false");
const waiting = (page) => page.locator("#vbar .vtake");
const confirm = (page) => page.locator("#vbar .vok").click();
/** Waits until the recognizer has taken what was queued and the mic is idle again, so the next phrase never meets a listening mic. */
async function settle(page) {
  await page.waitForFunction(() => !window.__heard.length);
  await idle(page);
}
/** Says a phrase with the mic button, and waits for the answer it was taken as to appear. */
async function hear(page, ...phrases) {
  await hearNext(page, ...phrases);
  await mic(page).click();
  await settle(page);
  await expect(waiting(page)).toBeVisible();
}

const sheet = (page) => page.locator("#over .sheet");
const openPracticeOptions = async (page) => { await page.locator("#msess").click(); await expect(sheet(page)).toBeVisible(); };
const closeSheet = (page) => page.keyboard.press("Escape");

test("Voice is off in the real app until its switch in Settings turns it on; that switch is the only voice control there", async ({ page }) => {
  await voice(page, { on: false, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);   // nothing of it on the screen
  await expect(page.locator("#mrd")).toBeHidden();
  await expect(page.locator(".pbar .prow")).toHaveCSS("display", "flex");   // the pair bar is as it was: the grid is only for a bar with the microphone
  expect(await said(page)).toEqual([]);
  await openPracticeOptions(page);
  await expect(sheet(page).getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // and no Voice section in the Practice options
  await closeSheet(page);
  await openSettings(page);
  const sw = page.getByRole("switch", { name: /^voice/i });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".xchip")).toHaveText("Experimental");
  await expect(page.locator("#over")).toContainText("sent to Google");   // where the audio goes is said where voice is switched on
  await expect(page.locator("#over").getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // its choices are not in Settings
  await expect(page.locator("#over").getByLabel("Voice", { exact: true })).toHaveCount(0);

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#over").getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // still just the one switch
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("1");
  await page.reload();   // the choice is kept on the device
  await ready(page);
  await expect(mic(page)).toBeVisible();

  await openSettings(page);
  await page.getByRole("switch", { name: /^voice/i }).click();
  await expect(page.getByRole("switch", { name: /^voice/i })).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("0");
  await page.reload();
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);
  await expect(page.locator("#mrd")).toBeHidden();
  expect(await said(page)).toEqual([]);
});

test("with no speech in the browser there is no Voice switch, no microphone and no voice bar", async ({ page }) => {
  await voice(page, { none: true, settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);
  await expect(page.locator("#mrd")).toBeHidden();
  await openSettings(page);
  await expect(page.getByRole("switch", { name: /^voice/i })).toHaveCount(0);
});

test("the Practice options have the key choices of Voice, and a page for the details: voices by accent, a sample, how an answer is taken", async ({ page }) => {
  await voice(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar")).toHaveCount(0);   // Read aloud and Answer by voice are both off at first: the mic is not there
  await expect(mic(page)).toHaveCount(0);
  expect(await said(page)).toEqual([]);
  await openPracticeOptions(page);
  await expect(sheet(page).getByText("Voice", { exact: true }).first()).toBeVisible();
  const read = sheet(page).getByRole("switch", { name: /read aloud/i });
  await expect(read).toHaveAttribute("aria-checked", "false");
  await read.click();
  await expect(read).toHaveAttribute("aria-checked", "true");
  expect((await said(page)).at(-1)).toMatch(/^Do you accept that/);   // a sample, to hear the voice
  await expect(sheet(page)).toContainText("sent to Google");   // beside the choice that sends it
  await sheet(page).getByRole("button", { name: "Tap the mic" }).click();
  expect(await page.evaluate(() => ["read", "answer"].map((k) => localStorage.getItem("rd-voice-" + k)))).toEqual(["1", "tap"]);

  await sheet(page).getByRole("button", { name: "Answer by voice: details" }).click();   // the page of details
  await expect(sheet(page).getByRole("heading", { name: "Voice" })).toBeVisible();
  // the English voices, by accent, American and British first; the best (Google's) first in each; the German one is not listed
  const sel = sheet(page).getByLabel("Voice", { exact: true });
  await expect(sel).toBeVisible();
  expect(await sel.evaluate((s) => [...s.querySelectorAll("optgroup")].map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.textContent.split(" · ")[0])])))
    .toEqual([["American", ["Google US English"]], ["British", ["Google UK English Female", "Daniel"]], ["Australian", ["Karen"]]]);
  await expect(sel.locator("option").first()).toHaveText("Best on this device (Google US English)");
  await sheet(page).getByRole("button", { name: /^Hands-free/ }).click();
  await expect(sheet(page).getByRole("group", { name: "After an answer is heard" })).toBeVisible();
  await sheet(page).getByRole("button", { name: /^Go on by itself/ }).click();
  expect(await page.evaluate(() => ["read", "answer", "confirm"].map((k) => localStorage.getItem("rd-voice-" + k)))).toEqual(["1", "auto", "auto"]);
  await expect(sheet(page).getByRole("button", { name: "Settings" })).toBeVisible();   // where Voice itself is switched off
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await sheet(page).getByRole("button", { name: "Back to the options" }).click();
  await expect(sheet(page).getByRole("button", { name: "Hands-free" })).toHaveAttribute("aria-pressed", "true");   // and the list shows the choice
});

test("Find a pair and Syllogisms have no Voice section: only Relations and Pervasions read and listen", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  for (const name of ["Pervasions", "Find a pair", "Syllogisms"]) {
    await tab(page, name);
    await expect(page.locator("#msess")).toBeVisible();
    await openPracticeOptions(page);
    await expect(sheet(page).getByRole("switch", { name: /read aloud/i })).toHaveCount(name === "Pervasions" ? 1 : 0);
    await closeSheet(page);
  }
});

test("the microphone is the middle button of the pair bar, an icon with no label, and it lights up while it listens", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(mic(page)).toBeVisible();
  await expect(mic(page)).toHaveText("");
  await expect(page.locator(".pbar .prow")).toHaveCSS("display", "grid");
  await expect(mic(page)).toHaveAttribute("aria-label", "Answer by voice");
  await expect(mic(page)).toHaveAttribute("title", /Say the relation, such as/);   // what it would take is its tooltip, not a line of text
  await expect(page.locator("#vbar")).toBeHidden();   // and nothing else is said until there is something to say
  const box = async (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, h: r.height }; });
  const m = await box(mic(page)), skip = await box(page.locator(".pbar .skipw")), bar = await box(page.locator(".pbar .prow"));
  expect(skip.r).toBeLessThan(m.l);
  expect(Math.abs((m.l + m.r) / 2 - (bar.l + bar.r) / 2)).toBeLessThan(8);   // in the middle of the bar
  expect(Math.abs(m.t + m.h / 2 - (skip.t + skip.h / 2))).toBeLessThan(4);   // on the line of the other buttons
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.evaluate(() => { window.__dead = true; });   // a recognizer that stays on, so that the lit microphone can be looked at
  await mic(page).click();
  await listening(page);   // lit while it listens (aria-pressed, the pulse)
  await expect(mic(page)).toHaveAttribute("aria-label", "Answer by voice");   // the name stays; the state is aria-pressed
  await expect(page.locator("#vbar .vst")).toHaveText("Listening…");
  expect(await mic(page).evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");   // filled, not an outline like the other buttons
  await mic(page).click();
  await idle(page);
  await page.evaluate(() => { window.__dead = false; });
  await hear(page, "mutually exclusive");
  await expect(waiting(page)).toBeVisible();
});

test("the Read aloud switch in the top bar, next to Blitz, pauses and resumes the reading", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const sw = page.locator("#mrd");
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  const x = (loc) => loc.evaluate((e) => e.getBoundingClientRect().left);
  expect(await x(sw)).toBeLessThan(await x(page.locator("#mbz")));   // next to the Blitz switch
  expect(await x(page.locator("#mbz")) - await x(sw)).toBeLessThan(80);
  await tab(page, "Pervasions");
  await expect.poll(async () => (await said(page)).length).toBe(1);   // read by itself (the first question the app opened on was held back)
  await sw.click();   // paused
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toHaveAttribute("title", /paused/);
  await hear(page, "I accept");
  await confirm(page);
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await page.waitForTimeout(300);
  expect(await said(page)).toHaveLength(1);   // nothing more was read
  await sw.click();   // resumed: the question on the screen is read
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await said(page)).length).toBe(2);
  expect((await said(page)).at(-1)).toMatch(/Do you accept that/);
  // it is for this visit only: the choice in the options is still Read aloud on
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-read"))).toBe("1");
  await page.reload();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

test("pausing in the middle of a reading cuts it off; the switch is not there with Read aloud off, or off Relations and Pervasions", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__speakMs = 4000; });   // a long reading
  await tab(page, "Pervasions");
  await expect.poll(async () => (await said(page)).length).toBe(1);
  await page.locator("#mrd").click();
  expect(await page.evaluate(() => window.speechSynthesis.cur)).toBeNull();   // stopped
  await tab(page, "Syllogisms");
  await expect(page.locator("#mrd")).toBeHidden();
  await tab(page, "Relations");
  await page.locator("#mrd").click();
  await openPracticeOptions(page);
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();   // turning Read aloud off takes the switch away
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();   // and on again puts it back, not paused
  await closeSheet(page);
  await expect(page.locator("#mrd")).toHaveAttribute("aria-checked", "true");
  await openPracticeOptions(page);
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();
  await closeSheet(page);
  await expect(page.locator("#mrd")).toBeHidden();
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
  await expect(page.locator("#vbar .vst")).toHaveCount(0);   // nothing of the last answer on the next question
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
  await listening(page);
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
  await listening(page);   // and open again
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
  // the question the app opens on waits for the person: nothing listens until the microphone is tapped
  await expect(page.locator("#vbar .vst")).toHaveText("Tap the microphone to start answering.");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__listens)).toBe(0);
  await mic(page).click();
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
  const bar = page.locator(".tbar i");
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

const bar = (page) => page.locator(".tbar i");
const elapsed = (page) => page.locator(".tbar").evaluate((e) => parseFloat(e.style.getPropertyValue("--e")));

test("Blitz: an answer given by hand while a spoken one waits leaves the next question with its own countdown", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await expect(bar(page)).toHaveCount(1);
  await hear(page, "accept");
  await expect(bar(page)).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand, not Confirm
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeLessThan(1500);   // the next question's own time, not the one the held question had used

  // and Why? by hand while another waits: the same question goes on from where it stopped, with its bar
  await page.waitForTimeout(1200);
  await hear(page, "accept");
  await page.getByRole("button", { name: /^Why\?/ }).click();
  await expect(page.locator("#dex")).toBeVisible();
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeGreaterThan(1000);
});

test("Blitz: an attempt put aside with a spoken answer waiting gets its countdown back when it returns", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await hear(page, "accept");
  await tab(page, "Relations");
  await tab(page, "Pervasions");
  await expect(page.locator(".qcard .qn")).toContainText("Question 1");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
});

test("Blitz: a question's countdown starts when its reading ends, not before", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer", "2000"); });
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__speakMs = 3200; });   // a long question
  await tab(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  await page.waitForTimeout(2600);   // longer than the countdown, but the question is still being read
  await expect(page.locator(".qcard .qn")).toContainText("Question 1");
  await expect(mic(page)).toBeVisible();
  await expect(page.locator(".qcard .qn")).toContainText("Question 2", { timeout: 6000 });   // then it runs out after its own 2 seconds
});

test("Blitz in Relations: the examples countdown goes on from where it stopped when a cell is answered by hand", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the cell view is the phone's");
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "mutually exclusive");
  await confirm(page);
  await expect(bar(page)).toHaveCount(1);
  await page.waitForTimeout(1500);
  await hear(page, "a gold ring");   // waits
  await page.locator("#cin").fill("a clay pot");
  await page.locator("#cin").press("Enter");   // by hand: the next cell
  await expect(page.locator(".cwho .n")).toContainText("Cell 2");
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page)).toBeGreaterThan(1200);   // it did not start over
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
  await expect(mic(page)).toHaveAttribute("title", new RegExp(hint));   // the hint is the tooltip of the microphone: nothing is written under the options
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
  await expect(page.locator("#vbar .vst")).toHaveCount(0);
});

test("a recognizer that never ends does not leave the mic stuck: the next tap ends it and the one after listens", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__dead = true; });
  await mic(page).click();
  await listening(page);
  await mic(page).click();   // stop it; the recognizer does not answer, so the page ends the listening itself
  await idle(page);
  await expect(page.locator("#vbar .vst")).toContainText("Nothing was heard");
  await page.evaluate(() => { window.__dead = false; });
  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Four possibilities");
});

test("the question the app opens on is not read until it is asked for; later ones are read by themselves", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const hear = page.getByRole("button", { name: "Hear the question" });
  await expect(hear).toBeVisible();
  await page.waitForTimeout(500);
  expect(await said(page)).toEqual([]);   // nothing was said, and nothing is waiting to be said
  await hear.click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/What is the relation\?$/);
  await expect(hear).toHaveCount(0);   // and the way to hear it goes away
  const before = (await said(page)).length;
  await tab(page, "Pervasions");   // moving on by hand: this screen is read by itself
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(before);
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  await expect(hear).toHaveCount(0);
});

test("the first question can also be read with the R key, or by pausing and resuming Read aloud", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  expect(await said(page)).toEqual([]);
  await page.locator("#mrd").click();   // pause
  await page.locator("#mrd").click();   // and resume: reads the question on the screen
  await expect.poll(async () => (await said(page)).length).toBe(1);
  expect((await said(page)).at(-1)).toMatch(/What is the relation\?$/);
  await page.keyboard.press("r");
  await expect.poll(async () => (await said(page)).length).toBe(2);
});

test("\"I don't know\" gets a friendly nudge, said too with Read aloud, and nothing is taken as an answer", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  const nudge = "It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
  for (const phrase of ["I don't know", "no idea"]) {   // "no idea" starts with "no", which would otherwise be Why?
    await hearNext(page, phrase);
    await mic(page).click();
    await expect.poll(async () => (await said(page)).at(-1)).toBe(nudge);
    await expect(page.locator("#vbar .vst")).toHaveText(nudge);
    await expect(waiting(page)).toHaveCount(0);
    await expect(page.locator(".qcard .qn")).toContainText("Question 1");
  }
  await hear(page, "I accept");   // and the next try is taken as usual
  await confirm(page);
  await expect(page.locator(".qcard .qn")).toContainText("Question 2");
});

/* ---------- what a second review of the Blitz clock found ---------- */

test("Blitz: an answer given by hand while a spoken one waits is timed by the clock that stood still", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer", "8000"); });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await hear(page, "accept");
  await page.waitForTimeout(2200);   // the answer waits; the clock is stopped
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand
  for (const n of [2, 3, 4]) {
    await expect(page.locator(".qcard .qn")).toContainText("Question " + n);
    await page.getByRole("button", { name: /^Accept/ }).click();
  }
  await relOptions(page).first().click();
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.qs[0].ms).toBeLessThan(1500);   // not the 2 seconds it waited
});

test("Blitz switched on while an answer waits: the question gets its full time when the answer is taken back", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await page.waitForTimeout(1500);   // thinking time from before Blitz was on
  await hear(page, "accept");
  await page.locator("#mbz").click();
  await page.locator("#vbar .vno").click();
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeLessThan(900);
});

test("Blitz: going to Review with an answer waiting leaves no countdown on the Review screen", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");
  await hear(page, "accept");
  await tab(page, "Review");
  await page.waitForTimeout(300);
  await expect(page.locator(".tbar")).toHaveCount(0);
});

test("Blitz in Relations: going back to the relation list does not start the examples countdown over", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the steps to go back by are the phone's");
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();   // by hand: the examples, with their countdown
  await expect(bar(page)).toHaveCount(1);
  await page.waitForTimeout(1500);
  await page.locator(".steps button").first().click();   // back to the relation list, which is read as a new screen
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/What is the relation\?$/);
  await page.waitForTimeout(200);
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page)).toBeGreaterThan(1200);   // it went on, as it does without voice
});

test("Hands-free: after the nudge for \"I don't know\" the microphone opens again, with Read aloud off", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["I don't know", "I accept"] });
  await page.goto("/");
  await ready(page);
  await tab(page, "Pervasions");   // moving on by hand: this screen listens by itself
  await expect(waiting(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Accept");
  expect(await page.evaluate(() => window.__listens)).toBeGreaterThanOrEqual(2);
});

test("on the Path the microphone is in the top bar, and the answer heard waits above the foot until it is confirmed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-design", "path"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await expect(mic(page)).toHaveCount(1);
  await expect(page.locator("#path .ptb #vmic")).toBeVisible();
  await hear(page, "four possibilities");
  await expect(page.locator("#path .pvoice #vbar")).toContainText("Four possibilities");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
  await expect(page.locator("#path .pstrip")).toContainText("They overlap");
});
