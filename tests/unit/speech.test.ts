// listen() in src/ui/speech.ts must always report an end. Chrome on Android sometimes never sends `end` after an interruption
// (the screen went off, another app took the microphone); the page then showed "Listening" for good and a tap on the
// microphone did nothing. The recognizer here is a stand-in that says only what a test makes it say.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { listen, readingTimeout, speak, type Heard } from "../../src/ui/speech.ts";

class Fake {
  static all: Fake[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() { Fake.all.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
  say(...alts: string[]) {
    const res = Object.assign(alts.map((transcript) => ({ transcript })), { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [res] });
  }
}

const last = () => Fake.all[Fake.all.length - 1];
let heard: Heard[];
const start = () => listen({ done: (h) => heard.push(h) });

beforeEach(async () => {
  vi.useFakeTimers();
  Fake.all = [];
  heard = [];
  vi.stubGlobal("SpeechRecognition", Fake);
  vi.stubGlobal("navigator", { permissions: { query: async () => ({ state: "granted" }) } });
  await vi.advanceTimersByTimeAsync(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("an answer and the end event give the guesses once", () => {
  start();
  last().onaudiostart?.();
  last().say("four possibilities", "for possibilities");
  last().onend?.();
  expect(heard).toEqual([{ alts: ["four possibilities", "for possibilities"] }]);
  vi.advanceTimersByTime(60000);
  expect(heard).toHaveLength(1);
});

test("a recognizer that never ends after stop is taken as ended", () => {
  const l = start();
  last().onaudiostart?.();
  l.stop();
  expect(last().stopped).toBe(true);
  expect(heard).toEqual([]);
  vi.advanceTimersByTime(2100);
  expect(heard).toEqual([{ error: "no-speech" }]);
});

test("a second stop ends it at once, with what was heard", () => {
  const l = start();
  last().onaudiostart?.();
  last().say("a gold ring");
  l.stop();
  l.stop();
  expect(heard).toEqual([{ alts: ["a gold ring"] }]);
});

test("an error with no end event still ends", () => {
  start();
  last().onaudiostart?.();
  last().onerror?.({ error: "network" });
  vi.advanceTimersByTime(1000);
  expect(heard).toEqual([]);
  vi.advanceTimersByTime(600);
  expect(heard).toEqual([{ error: "network" }]);
});

test("an answer with no end event still ends, with the answer", () => {
  start();
  last().onaudiostart?.();
  last().say("accept");
  vi.advanceTimersByTime(2100);
  expect(heard).toEqual([{ alts: ["accept"] }]);
});

test("speech that never produces an answer or an end ends after a while", () => {
  start();
  last().onaudiostart?.();
  last().onspeechend?.();
  vi.advanceTimersByTime(5100);
  expect(heard).toEqual([{ error: "no-speech" }]);
});

test("no listening lasts longer than 20 seconds, even when nothing at all comes", () => {
  start();
  last().onaudiostart?.();
  vi.advanceTimersByTime(19000);
  expect(heard).toEqual([]);
  vi.advanceTimersByTime(1000);
  expect(last().stopped).toBe(true);
  vi.advanceTimersByTime(2100);
  expect(heard).toEqual([{ error: "no-speech" }]);
});

test("abort reports nothing, then or later, and lets the recognizer go", () => {
  const l = start();
  last().onaudiostart?.();
  l.abort();
  last().onend?.();
  last().onerror?.({ error: "aborted" });
  vi.advanceTimersByTime(60000);
  expect(heard).toEqual([]);
  expect(last().aborted).toBe(true);
});

test("a start that opens no microphone is tried once more, then reported", async () => {
  start();
  await vi.advanceTimersByTimeAsync(0);   // the permission is looked up
  const first = last();
  vi.advanceTimersByTime(2500);
  expect(first.aborted).toBe(true);
  expect(Fake.all).toHaveLength(2);
  first.onend?.();   // the old one ending must not end the listening
  expect(heard).toEqual([]);
  vi.advanceTimersByTime(4000);
  expect(heard).toEqual([{ error: "no-audio" }]);
});

test("a second listening lets the first recognizer go first", () => {
  start();
  const first = last();
  first.onaudiostart?.();
  start();
  expect(first.aborted).toBe(true);
  expect(Fake.all).toHaveLength(2);
});

test("a start that fails because the last recognizer is still going is tried again", () => {
  class Busy extends Fake {
    static count = 0;
    start() {
      Busy.count++;
      if (Busy.count === 1) { const e = new Error("recognition has already started"); e.name = "InvalidStateError"; throw e; }
      super.start();
    }
  }
  vi.stubGlobal("SpeechRecognition", Busy);
  start();
  expect(heard).toEqual([]);
  vi.advanceTimersByTime(400);
  expect(Fake.all).toHaveLength(2);
  expect(last().started).toBe(true);
  last().onaudiostart?.();
  last().say("accept");
  last().onend?.();
  expect(heard).toEqual([{ alts: ["accept"] }]);
});

// speak(): a synthesizer with no engine behind it never sends `end`; the reading is taken as ended after a time that follows the text.
test("a reading the browser never ends is taken as ended, once, and cut off", () => {
  const cancelled = vi.fn();
  vi.stubGlobal("speechSynthesis", { cancel: cancelled, speak: vi.fn(), paused: false, resume: vi.fn(), getVoices: () => [] });
  vi.stubGlobal("SpeechSynthesisUtterance", class { rate = 1; lang = ""; voice = null; constructor(public text: string) {} });
  const done = vi.fn();
  speak("Which relation is it?", { done });
  vi.advanceTimersByTime(readingTimeout("Which relation is it?") - 1);
  expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2);
  expect(done).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledWith(false, "timeout");
  expect(cancelled).toHaveBeenCalledTimes(2);   // before the reading, and when it was given up
});

test("a reading that ends in time does not time out afterwards, and a slower voice is given longer", () => {
  let utter: any;
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (u: any) => { utter = u; }, paused: false, resume: vi.fn(), getVoices: () => [] });
  vi.stubGlobal("SpeechSynthesisUtterance", class { rate = 1; lang = ""; voice = null; constructor(public text: string) {} });
  const done = vi.fn();
  speak("Yes.", { done });
  utter.onend();
  vi.advanceTimersByTime(60000);
  expect(done).toHaveBeenCalledTimes(1);
  expect(done.mock.calls[0][0]).toBe(true);
  expect(readingTimeout("A longer question to read aloud.", 0.85)).toBeGreaterThan(readingTimeout("A longer question to read aloud.", 1.25));
});
