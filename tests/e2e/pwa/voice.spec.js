// Voice: the questions read aloud and answers by voice (src/app/shell/voice.js), a feature on trial: its switch in Settings is off in the
// real app (and so in this build) until it is turned on, and these specs turn it on for the device unless they test the switch itself.
// The choices are in the Practice options, the microphone and a switch that pauses the reading are in the top bar of the Path, and what was heard waits above the foot.
// A heard answer waits for Confirm (or "yes"), or goes on by itself after a pause when the options say so. The browser's speech is stood in for:
// speechSynthesis notes what it is asked to say and ends each utterance at once; SpeechRecognition answers each start
// with the next phrase the test queued (a phrase, or a list of guesses best first), or with "no-speech" when none comes.
import { test, expect } from "../../support/test.js";
import { readFileSync } from "node:fs";
import { exerciseAtRest, goTo, openSettings, ready, overflow, relOptions } from "../../support/page.js";
import { KEY_STORE, dataKey } from "../../support/data-key.js";
import { bridge, serverWorld } from "../../support/server-bridge.js";

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
const mic = (page) => page.locator("#vmic");
const listening = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "true");
const idle = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "false");
const waiting = (page) => page.locator("#vbar .vtake");
/** The question of Pervasions on the path now: "Q1" to "Q4". */
const qNow = (page) => page.locator("#path .sb.now .qnm");
const readSwitch = (page) => page.getByRole("switch", { name: "Read aloud" });
const blitzSwitch = (page) => page.getByRole("switch", { name: /^Sprint/ });
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

const sheet = (page) => page.getByRole("dialog", { name: "Practice options" });
const openPracticeOptions = async (page) => { await page.getByRole("button", { name: "Practice options" }).click(); await expect(sheet(page)).toBeVisible(); };
/** The Voice page of the practice options (its line "Voice: more"). */
const openVoicePage = async (page) => { await openPracticeOptions(page); await sheet(page).getByRole("button", { name: "Voice: more" }).click(); };
const closeSheet = async (page) => { for (let i = 0; i < 3 && (await sheet(page).isVisible()); i++) await page.keyboard.press("Escape"); await expect(sheet(page)).toBeHidden(); };
/** The experiments of Settings are shown on this device (a hold on Version does it in the released app). */
const showExperiments = (page) => page.addInitScript(() => localStorage.setItem("rd-exp", "1"));

test("Voice is off in the real app until its switch in Settings turns it on; that switch is the only voice control there", async ({ page }) => {
  await voice(page, { on: false, settings: { read: "1", answer: "tap" } });
  await showExperiments(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);   // nothing of it on the screen
  await expect(readSwitch(page)).toHaveCount(0);
  expect(await said(page)).toEqual([]);
  await openPracticeOptions(page);
  await expect(sheet(page).getByRole("button", { name: "Voice: more" })).toHaveCount(0);   // and no Voice page in the Practice options
  await closeSheet(page);
  await openSettings(page);
  const sw = page.getByRole("switch", { name: "Voice features", exact: true });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".ppage")).toContainText("sent to Google");   // where the audio goes is said where voice is switched on
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // its choices are not in Settings

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // still just the one switch
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("1");
  await page.reload();   // the choice is kept on the device
  await ready(page);
  await expect(mic(page)).toBeVisible();

  await openSettings(page);
  await page.getByRole("switch", { name: "Voice features", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Voice features", exact: true })).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("0");
  await page.reload();
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);
  await expect(readSwitch(page)).toHaveCount(0);
  expect(await said(page)).toEqual([]);
});

test("with no speech in the browser there is no Voice switch, no microphone and no voice bar", async ({ page }) => {
  await voice(page, { none: true, settings: { read: "1", answer: "tap" } });
  await showExperiments(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vbar, #vmic")).toHaveCount(0);
  await expect(readSwitch(page)).toHaveCount(0);
  await openSettings(page);
  await expect(page.locator(".ppage .sgh")).toContainText(["Experiments"]);
  await expect(page.getByRole("switch", { name: "Voice features", exact: true })).toHaveCount(0);
});

test("Find a pair and Syllogisms have no Voice page: only Relations and Pervasions read and listen", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  for (const name of ["Pervasions", "Find a pair", "Syllogisms"]) {
    await goTo(page, name);
    await openPracticeOptions(page);
    await expect(sheet(page).getByRole("button", { name: "Voice: more" })).toHaveCount(name === "Pervasions" ? 1 : 0);
    await closeSheet(page);
  }
});

test("the microphone is a button of the top bar, an icon with no label, and it lights up while it listens", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#path .ptb #vmic")).toBeVisible();
  await expect(mic(page)).toHaveText("");
  await expect(mic(page)).toHaveAttribute("aria-label", "Answer by voice");
  await expect(page.locator("#vbar")).toBeHidden();   // nothing else is said until there is something to say
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.evaluate(() => { window.__dead = true; });   // a recognizer that stays on, so that the lit microphone can be looked at
  await mic(page).click();
  await listening(page);   // lit while it listens (aria-pressed, the pulse)
  await expect(mic(page)).toHaveClass(/\bon\b/);
  await expect(mic(page)).toHaveAttribute("aria-label", "Answer by voice");   // the name stays; the state is aria-pressed
  await expect(page.locator("#vbar .vst")).toHaveText("Listening…");
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
  const sw = readSwitch(page);
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await goTo(page, "Pervasions");
  await exerciseAtRest(page);   // the top bar is measured once the exercise has come in over the roadmap
  const x = (loc) => loc.evaluate((e) => e.getBoundingClientRect().left);
  expect(await x(sw)).toBeLessThan(await x(blitzSwitch(page)));   // next to the Sprint switch
  expect(await x(blitzSwitch(page)) - await x(sw), "with the microphone between them").toBeLessThan(100);
  await expect.poll(async () => (await said(page)).length).toBe(1);   // read by itself (the first question the app opened on was held back)
  await sw.click();   // paused
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await hear(page, "I accept");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await page.waitForTimeout(300);
  expect(await said(page)).toHaveLength(1);   // nothing more was read
  await sw.click();   // resumed: the question on the screen is read
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await said(page)).length).toBe(2);
  expect((await said(page)).at(-1)).toMatch(/Do you accept that/);
  // it is for this visit only: the choice in the options is still Read aloud on
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-read"))).toBe("1");
  await page.reload();
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

test("pausing in the middle of a reading cuts it off; the switch is not there with Read aloud off, or off Relations and Pervasions", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__speakMs = 4000; });   // a long reading
  await goTo(page, "Pervasions");
  await expect.poll(async () => (await said(page)).length).toBe(1);
  await readSwitch(page).click();
  expect(await page.evaluate(() => window.speechSynthesis.cur)).toBeNull();   // stopped
  await goTo(page, "Syllogisms");
  await expect(readSwitch(page)).toHaveCount(0);
  await goTo(page, "Relations");
  await readSwitch(page).click();
  await openVoicePage(page);
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();   // turning Read aloud off takes the switch away
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();   // and on again puts it back, not paused
  await closeSheet(page);
  await expect(readSwitch(page)).toHaveAttribute("aria-checked", "true");
  await openVoicePage(page);
  await sheet(page).getByRole("switch", { name: /read aloud/i }).click();
  await closeSheet(page);
  await expect(readSwitch(page)).toHaveCount(0);
});

test("Pervasions: each question is read aloud and answered with the mic; the answer waits on its own question for Confirm", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^.+ and .+\. Do you accept that if it is .+, it follows it is not .+\?$/);

  // Why? with the example in one breath: it is shown with what it was taken as, on this question, and goes on at Confirm
  await hear(page, "Why? A wooden table.");
  await expect(qNow(page)).toHaveText("Q1");
  await expect(page.locator("#vbar .vwhat small")).toHaveText("Heard");   // it is what was said, so there is no "taken as"
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Why? a wooden table");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#vbar .vst")).toHaveCount(0);   // nothing of the last answer on the next question
  for (const n of [3, 4]) {
    await hear(page, "I accept");
    await confirm(page);
    await expect(qNow(page)).toHaveText("Q" + n);
  }
  await hear(page, "except");   // how a recognizer often hears "accept"
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Accept");
  await expect(page.locator("#vbar .vwhat small")).toHaveText("Heard “except”, taken as");
  await confirm(page);
  await expect.poll(async () => (await said(page)).at(-1)).toBe("Which relation do your answers give?");

  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Four possibilities");
  await page.keyboard.press("Enter");   // Enter confirms too
  await expect(page.locator("#vbar")).toBeHidden();
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
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");

  await hear(page, "I accept");
  await page.waitForTimeout(1600);   // the answer waits; the time it waits is not the time the answer took
  await page.locator("#vbar .vno").click();   // Change: gone, and the mic is open again for the right answer
  await expect(waiting(page)).toHaveCount(0);
  await listening(page);
  await expect(qNow(page)).toHaveText("Q1");
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
  await expect(qNow(page)).toHaveText("Q2");
  await expect(waiting(page)).toHaveCount(0);

  for (const n of [3, 4, 5]) {
    await hear(page, "accept");
    await page.keyboard.press("Enter");
    if (n < 5) await expect(qNow(page)).toHaveText("Q" + n);
  }
  await hear(page, "mutually exclusive");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.qs[0].ms).toBeLessThan(1200);
});

test("Relations, hands-free: the relation and each example are heard in turn, each confirmed by \"yes\", and the answer is checked", async ({ page }) => {
  // "nothing" is refused for a case the relation asks for (the second one), and taken for the neither case
  await voice(page, { settings: { answer: "auto" }, heard: ["mutually exclusive", "yes", "a gold ring", "yes", "nothing", "a red apple", "yes", "nothing", "yes"] });
  await page.goto("/");
  await ready(page);
  // the question the app opens on waits for the person: nothing listens until the microphone is tapped
  await expect(page.locator("#vbar .vst")).toHaveText("Tap the microphone to start answering.");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__listens)).toBe(0);
  await mic(page).click();
  await expect.poll(() => docs(page, "answers").then((a) => a.length), { timeout: 10_000 }).toBe(1);
  const [a] = await docs(page, "answers");
  expect(a.chosen).toBe("con");
  expect([a.cells.anb.text, a.cells.bna.text, a.cells.nei.text]).toEqual(["a gold ring", "a red apple", ""]);
  // the field never took the focus, so a phone keeps its keyboard down
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toBe("INPUT");
});

test("\"Go on by itself\": the answer shows a running bar, goes on after the pause, and Change stops it", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "auto" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(page.locator("#vbar .vrun")).toBeVisible();
  await expect(page.locator("#vbar .vok")).toHaveCount(0);
  await page.locator("#vbar .vno").click();   // stopped before the pause ran out
  await expect(waiting(page)).toHaveCount(0);
  await page.waitForTimeout(4600);
  await expect(page.locator("#cin")).toHaveCount(0);   // nothing was chosen
  await expect(relOptions(page)).toHaveCount(5);

  await hearNext(page, "mutually exclusive");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Mutually exclusive");
  await expect(page.locator("#cin")).toHaveCount(0);   // still waiting
  await page.waitForTimeout(4600);   // 4 seconds without Blitz
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
  await expect(page.locator("#path .pstrip")).toContainText("Mutually exclusive");
  await expect(waiting(page)).toHaveCount(0);
});

test("with Blitz on the countdown stops while an answer waits, and goes on when it is taken back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });   // (the bar does not move with reduced motion, so it has no play state to look at)
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(bar(page)).toHaveCount(1);   // the question's countdown runs
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  await hear(page, "accept");
  await expect(bar(page)).toHaveCSS("animation-play-state", "paused");   // stands still while the answer waits
  await page.locator("#vbar .vno").click();
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");   // and runs again
  await hearNext(page, "accept");
  await page.keyboard.press("v");
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(bar(page)).toHaveCount(1);   // the next question has its own
});

const bar = (page) => page.locator("#path .pclock i");
// how much of the countdown the bar shows as gone, in ms (the bar's own offset, `--e`, is set once when it is drawn: clock.tsx)
const elapsed = (page) => page.locator("#path .pclock").evaluate((e) => { const a = e.querySelector("i").getAnimations()[0]; return a ? a.effect.getComputedTiming().progress * parseFloat(e.style.getPropertyValue("--t")) : parseFloat(e.style.getPropertyValue("--e")); });

test("Blitz: an answer given by hand while a spoken one waits leaves the next question with its own countdown", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(bar(page)).toHaveCount(1);
  await hear(page, "accept");
  await expect(bar(page)).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand, not Confirm
  await expect(qNow(page)).toHaveText("Q2");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeLessThan(1500);   // the next question's own time, not the one the held question had used

  // and Why? by hand while another waits: the example is a step of its own, with its own bar from full
  await page.waitForTimeout(1200);
  await hear(page, "accept");
  const why = Date.now();
  await page.getByRole("button", { name: /^Why\?/ }).click();
  await expect(page.locator("#dex")).toBeVisible();
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page), "no more than the time since Why? was taken").toBeLessThan(Date.now() - why + 300);
});

test("Blitz: an attempt put aside with a spoken answer waiting gets its countdown back when it returns", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await goTo(page, "Relations");
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
});

test("Blitz: a question's countdown starts when its reading ends, not before", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-q", "2000"); });
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__speakMs = 3200; });   // a long question
  await goTo(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  await page.waitForTimeout(2600);   // longer than the countdown, but the question is still being read
  await expect(qNow(page)).toHaveText("Q1");
  await expect(mic(page)).toBeVisible();
  await expect(qNow(page)).toHaveText("Q2", { timeout: 6000 });   // then it runs out after its own 2 seconds
});

test("Blitz in Relations: a case answered by hand while a spoken one waits leaves the next case with a countdown of its own", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); window.__riglamTest = (t) => { window.__t = t; }; });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "mutually exclusive");
  await confirm(page);
  await expect(bar(page)).toHaveCount(1);
  const first = await page.evaluate(() => window.__t.ui.tq.key);
  await page.waitForTimeout(1500);
  await hear(page, "a gold ring");   // waits
  await page.locator("#cin").fill("a clay pot");
  await page.locator("#cin").press("Enter");   // by hand: the next case
  await expect(page.locator("#path .sb.done")).toHaveCount(1);
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page), "the next case begins with its own time, not the stopped one's").toBeLessThan(900);
  expect(await page.evaluate(() => window.__t.ui.tq.key), "a case of its own").not.toBe(first);
});

test("the relation said as what is written under the option, or three possibilities and then which is inside", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const [a, b] = await page.evaluate(() => [window.__t.cur.p.a, window.__t.cur.p.b]);
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

test("words that are not an answer are said back, and the mic stays for another try", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const hint = "Say the relation, such as “four possibilities”, or what is written under it.";
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
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
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
  await goTo(page, "Pervasions");   // moving on by hand: this screen is read by itself
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(before);
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  await expect(hear).toHaveCount(0);
});

test("the first question can also be read with the R key, or by pausing and resuming Read aloud", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  expect(await said(page)).toEqual([]);
  await readSwitch(page).click();   // pause
  await readSwitch(page).click();   // and resume: reads the question on the screen
  await expect.poll(async () => (await said(page)).length).toBe(1);
  expect((await said(page)).at(-1)).toMatch(/What is the relation\?$/);
  await page.keyboard.press("r");
  await expect.poll(async () => (await said(page)).length).toBe(2);
});

test("\"I don't know\" gets a friendly nudge, said too with Read aloud, and nothing is taken as an answer", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  const nudge = "It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
  for (const phrase of ["I don't know", "no idea"]) {   // "no idea" starts with "no", which would otherwise be Why?
    await hearNext(page, phrase);
    await mic(page).click();
    await expect.poll(async () => (await said(page)).at(-1)).toBe(nudge);
    await expect(page.locator("#vbar .vst")).toHaveText(nudge);
    await expect(waiting(page)).toHaveCount(0);
    await expect(qNow(page)).toHaveText("Q1");
  }
  await hear(page, "I accept");   // and the next try is taken as usual
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
});

/* ---------- what a second review of the Blitz clock found ---------- */

test("Blitz: an answer given by hand while a spoken one waits is timed by the clock that stood still", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-q", "8000"); });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await page.waitForTimeout(2200);   // the answer waits; the clock is stopped
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand
  for (const n of [2, 3, 4]) {
    await expect(qNow(page)).toHaveText("Q" + n);
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
  await goTo(page, "Pervasions");
  await page.waitForTimeout(1500);   // thinking time from before Blitz was on
  await hear(page, "accept");
  await blitzSwitch(page).click();
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
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await goTo(page, "Review");
  await page.waitForTimeout(300);
  await expect(page.locator("#path .pclock")).toHaveCount(0);
});

test("Blitz in Relations: the examples countdown waits while the relation list is shown, and goes on from where it stood", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();   // by hand: the examples, with their countdown
  await expect(bar(page)).toHaveCount(1);
  await page.waitForTimeout(1500);
  await page.locator("#cin").blur();   // (on a phone the strip is out of the way while the keyboard is up)
  await page.locator("#path .pstrip").click();   // look back at the relation, and pick another: the relation list, which is read as a new screen
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/What is the relation\?$/);
  await page.waitForTimeout(200);
  await expect(bar(page), "no countdown behind the list").toHaveCount(0);
  await relOptions(page).first().click();   // the same relation again: back to the first case
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page), "it went on from where it stood").toBeGreaterThan(1200);
});

test("Hands-free: after the nudge for \"I don't know\" the microphone opens again, with Read aloud off", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["I don't know", "I accept"] });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");   // moving on by hand: this screen listens by itself
  await expect(waiting(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#vbar .vwhat b")).toHaveText("Accept");
  expect(await page.evaluate(() => window.__listens)).toBeGreaterThanOrEqual(2);
});

test("on the Path the answer heard waits above the foot until it is confirmed, and the thread goes on", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#path .ptb #vmic")).toBeVisible();
  await hear(page, "four possibilities");
  await expect(page.locator("#path .pvoice #vbar")).toContainText("Four possibilities");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
  await expect(page.locator("#path .pstrip")).toContainText("Four possibilities");
});

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
  await voice(page, { settings });
  return { google, world, device };
}
const voiceSelect = (page) => sheet(page).getByRole("combobox", { name: "Voice" });
const plays = (page) => page.evaluate(() => window.__plays);

test("with the server's natural voices: the Voice page lists them first with Charon as the default, Try plays the clip, a sentence heard again is not asked for again", async ({ page }) => {
  const { google } = await serverVoices(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openVoicePage(page);
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
  await openVoicePage(page);
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
  await openVoicePage(page);
  await expect(voiceSelect(page)).toHaveValue("best");
});

test("when the server's characters for the day are used up the device's voice reads, and the server is not asked again until it starts over", async ({ page }) => {
  const { google, device } = await serverVoices(page, { env: { SPEAK_DEVICE_DAILY_CHARS: "10" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openVoicePage(page);
  const asked = () => device.seen.filter((r) => r === "POST /api/speak").length;
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(1);   // refused, so the device reads
  expect(asked()).toBe(1);
  expect(google.calls).toHaveLength(0);
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(2);
  expect(asked()).toBe(1);   // not asked a second time
  expect(await plays(page)).toBe(0);
});

test("when the server is unreachable the device's voice reads", async ({ page }) => {
  const { world } = await serverVoices(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openVoicePage(page);
  world.offline = true;
  await sheet(page).getByRole("button", { name: "Try", exact: true }).click();
  await expect.poll(async () => (await said(page)).length).toBe(1);
  expect(await plays(page)).toBe(0);
});

test("a server without Google's key has only the device's voices", async ({ page }) => {
  await serverVoices(page, { key: "" });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openVoicePage(page);
  await expect(voiceSelect(page)).toHaveValue("");
  await expect(voiceSelect(page).locator("option", { hasText: "Charon" })).toHaveCount(0);
  await expect(sheet(page)).not.toContainText("made by Google");
});

test("a device without the Magic Key has only the device's voices", async ({ page }) => {
  await voice(page);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await openVoicePage(page);
  await expect(voiceSelect(page)).toHaveValue("");
  await expect(voiceSelect(page).locator("option", { hasText: "Charon" })).toHaveCount(0);
});
