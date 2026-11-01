// Stand-ins and helpers for the voice specs: the browser's speech is replaced, the field is found by its ids.
import { expect } from "@playwright/test";

/** Stands in for the browser's speech. `settings` are the rd-voice-* values to start with; `heard` the phrases queued from the start; `on` turns the Voice switch on for the device. */
export async function voice(page, { settings = {}, heard = [], none = false, on = true } = {}) {
  await page.addInitScript(({ settings, heard, none, on }) => {
    if (on && localStorage.getItem("rd-voice") === null) localStorage.setItem("rd-voice", "1");
    for (const [k, v] of Object.entries(settings)) localStorage.setItem("rd-voice-" + k, v);
    if (none) {
      for (const k of ["speechSynthesis", "SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, k, { value: undefined, configurable: true });
      return;
    }
    export const said = (window.__said = []);
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
export const said = (page) => page.evaluate(() => window.__said.slice());
/** Waits until `n` things have been said and the last one is over (a tap on the speaker while it reads stops it). */
export const spoken = async (page, n) => { await expect.poll(async () => (await said(page)).length).toBe(n); await page.waitForFunction(() => !window.speechSynthesis.cur); };
export const hearNext = (page, ...phrases) => page.evaluate((p) => window.__heard.push(...p), phrases);
export const docs = (page, col) => page.evaluate(async (col) => (await (await window.__riglam.platform.db()).collection(col).get()).docs.map((d) => d.data()), col);
export const mic = (page) => page.locator("#vmic");
export const listening = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "true");
export const idle = (page) => expect(mic(page)).toHaveAttribute("aria-pressed", "false");
export const waiting = (page) => page.locator("#vfield .vtake");
/** A tap on the field is Yes while an answer waits. */
export const confirm = (page) => mic(page).click();
/** Change: Escape takes the answer that waits back (holding the field says another). */
export const change = (page) => page.keyboard.press("Escape");
/** Waits until the recognizer has taken what was queued and the mic is idle again, so the next phrase never meets a listening mic. */
export async function settle(page) {
  await page.waitForFunction(() => !window.__heard.length);
  await idle(page);
}
/** Says a phrase with the mic button, and waits for the answer it was taken as to appear. */
export async function hear(page, ...phrases) {
  await hearNext(page, ...phrases);
  await mic(page).click();
  await settle(page);
  await expect(waiting(page)).toBeVisible();
}

