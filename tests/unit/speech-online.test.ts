// The server's voice in src/ui/speech.ts: a clip is fetched, played in the one audio element at the chosen speed, kept for the visit, cut off by the next reading, and
// when it cannot be made or played the device's own voice reads (and the page is told why). The audio element and the synthesizer are stand-ins.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Remote } from "../../src/ui/speech.ts";

// the module keeps one audio element and the clips of the visit: each test starts with a fresh copy of it
let speak: typeof import("../../src/ui/speech.ts").speak;
let stopSpeaking: typeof import("../../src/ui/speech.ts").stopSpeaking;
let prefetchClips: typeof import("../../src/ui/speech.ts").prefetchClips;

class FakeAudio {
  static all: FakeAudio[] = [];
  src = "";
  muted = false;
  paused = true;
  preload = "";
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  refuse: string | null = null;
  constructor() { FakeAudio.all.push(this); }
  play() {
    if (this.refuse) return Promise.reject(Object.assign(new Error("refused"), { name: this.refuse }));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  end() { this.onended?.(); }
}
class Utterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}
const spoken: Utterance[] = [];
const synth = { speak: (u: Utterance) => void spoken.push(u), cancel: vi.fn(), paused: false, resume() {}, getVoices: () => [] as unknown[], addEventListener() {} };

const blob = (n = 4) => new Blob([new Uint8Array(n)], { type: "audio/mpeg" });
/** A server voice whose clips are made as the test lets them: `answer(text)` resolves or rejects. */
function remote(answer: (text: string, signal: AbortSignal) => Promise<Blob>, key = "charon") {
  const asked: string[] = [];
  const failed: unknown[] = [];
  const r: Remote = { key, clip: (text, signal) => (asked.push(text), answer(text, signal)), failed: (why) => void failed.push(why) };
  return { r, asked, failed };
}
const audio = () => FakeAudio.all[FakeAudio.all.length - 1];
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
let urls = 0;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeAudio.all = [];
  spoken.length = 0;
  urls = 0;
  synth.cancel.mockClear();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:clip-${++urls}`, revokeObjectURL: vi.fn() }));
  ({ speak, stopSpeaking, prefetchClips } = await import("../../src/ui/speech.ts"));
});
afterEach(() => {
  stopSpeaking();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a clip is fetched, played at the speed asked for, and the reading ends with the clip", async () => {
  const done = vi.fn();
  const { r, asked } = remote(async () => blob());
  speak("Is a pot a product? (a)", { remote: r, rate: 1.25, done });
  await flush();
  expect(asked).toEqual(["Is a pot a product? (a)"]);
  expect(audio().src).toBe("blob:clip-1");
  expect(audio().playbackRate).toBe(1.25);
  expect(audio().defaultPlaybackRate).toBe(1.25);
  expect(audio().preservesPitch).toBe(true);
  expect(spoken).toHaveLength(0); // the device does not read as well
  expect(done).not.toHaveBeenCalled();
  audio().end();
  expect(done).toHaveBeenCalledOnce();
  expect(done.mock.calls).toEqual([[true, undefined]]);
});

test("the same sentence read again is not asked for again, and another voice is", async () => {
  const { r, asked } = remote(async () => blob());
  speak("Which relation is it? (b)", { remote: r }); await flush(); audio().end();
  speak("Which relation is it? (b)", { remote: r }); await flush(); audio().end();
  expect(asked).toHaveLength(1);
  const other = remote(async () => blob(), "kore");
  speak("Which relation is it? (b)", { remote: other.r }); await flush();
  expect(other.asked).toHaveLength(1);
});

test("the device reads, and the page is told why, when the clip cannot be made", async () => {
  const done = vi.fn();
  const why = Object.assign(new Error("m"), { code: "rate_limited" });
  const { r, failed } = remote(async () => { throw why; });
  speak("Say this (c)", { remote: r, done });
  await flush();
  expect(failed).toEqual([why]);
  expect(spoken.map((u) => u.text)).toEqual(["Say this (c)"]);
  expect(done).not.toHaveBeenCalled(); // the device's reading ends it
  spoken[0].onend?.();
  expect(done.mock.calls).toEqual([[true, undefined]]);
});

test("the device reads when the clip never starts: a player that neither plays nor fails does not leave the question unread", async () => {
  const done = vi.fn();
  const { r, failed } = remote(async () => blob());
  const play = FakeAudio.prototype.play;
  FakeAudio.prototype.play = function () { return new Promise<void>(() => {}); };   // never settles
  try {
    speak("Stuck one (s)", { remote: r, done });
    await vi.advanceTimersByTimeAsync(4_900);
    expect(spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(failed).toHaveLength(1);
    expect(spoken.map((u) => u.text)).toEqual(["Stuck one (s)"]);
  } finally {
    FakeAudio.prototype.play = play;
  }
});

test("the device reads when the server is too slow", async () => {
  const done = vi.fn();
  const { r, failed } = remote((_t, signal) => new Promise((_res, rej) => signal.addEventListener("abort", () => rej(signal.reason))));
  speak("Slow one (d)", { remote: r, done });
  await vi.advanceTimersByTimeAsync(7_900);
  expect(spoken).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(200);
  expect(failed).toHaveLength(1);
  expect(spoken.map((u) => u.text)).toEqual(["Slow one (d)"]);
});

test("the device reads when the answer is no audio, or the audio cannot be played", async () => {
  const empty = remote(async () => blob(0));
  speak("Empty (e)", { remote: empty.r }); await flush();
  expect(empty.failed).toHaveLength(1);
  expect(spoken.map((u) => u.text)).toEqual(["Empty (e)"]);

  spoken.length = 0;
  vi.spyOn(FakeAudio.prototype, "play").mockReturnValue(new Promise(() => {})); // the browser has not started it yet
  const bad = remote(async () => blob());
  speak("Broken (f)", { remote: bad.r }); await flush();
  audio().onerror?.(); // the browser cannot decode it, before it began
  expect(bad.failed).toHaveLength(1);
  expect(spoken.map((u) => u.text)).toEqual(["Broken (f)"]);
});

test("a phone that wants a tap first is said as not-allowed, and the device does not read in its place", async () => {
  const done = vi.fn();
  const { r, failed } = remote(async () => blob());
  speak("Needs a tap (g)", { remote: r, done });
  audio().refuse = "NotAllowedError";
  await flush();
  expect(done).toHaveBeenCalledWith(false, "not-allowed");
  expect(failed).toHaveLength(0);
  expect(spoken).toHaveLength(0);
});

test("a clip that arrives after the reading was cut off is not played", async () => {
  let give!: (b: Blob) => void;
  const done = vi.fn();
  const { r } = remote(() => new Promise<Blob>((res) => (give = res)));
  speak("Too late (h)", { remote: r, done });
  stopSpeaking();
  expect(done).toHaveBeenCalledWith(false, "interrupted");
  give(blob());
  await flush();
  expect(audio().src).toBe("");
  expect(spoken).toHaveLength(0);
});

test("the next reading cuts the one before: its clip is not played when it comes after", async () => {
  let giveFirst!: (b: Blob) => void;
  const first = vi.fn();
  const slow = remote(() => new Promise<Blob>((res) => (giveFirst = res)));
  speak("First (i)", { remote: slow.r, done: first });
  const second = remote(async () => blob());
  speak("Second (i)", { remote: second.r });
  giveFirst(blob());
  await flush();
  expect(first).toHaveBeenCalledWith(false, "interrupted");
  expect(audio().src).toBe("blob:clip-1"); // the second's
  expect(second.asked).toEqual(["Second (i)"]);
});

test("a reading that never ends is taken as ended after a while, and stops the clip", async () => {
  const done = vi.fn();
  const { r } = remote(async () => blob());
  speak("Stuck (j)", { remote: r, done });
  await flush();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(done).toHaveBeenCalledWith(false, "timeout");
  expect(audio().paused).toBe(true);
});

test("with no server voice the device reads as before", () => {
  const done = vi.fn();
  speak("Plain (k)", { done });
  expect(spoken.map((u) => u.text)).toEqual(["Plain (k)"]);
  expect(FakeAudio.all).toHaveLength(0);
});

test("clips fetched ahead are asked for once each, and their readings start at once with no second request", async () => {
  const { r, asked } = remote(async () => blob());
  prefetchClips(["Two?", "Three?", "Two?"], r);   // a text twice is one request
  await flush();
  expect(asked).toEqual(["Two?", "Three?"]);
  prefetchClips(["Two?", "Four?"], r);   // what the visit has is not asked again
  await flush();
  expect(asked).toEqual(["Two?", "Three?", "Four?"]);
  const done = vi.fn();
  speak("Three?", { remote: r, done });
  await flush();
  expect(asked).toEqual(["Two?", "Three?", "Four?"]);
  expect(audio().src).toBe("blob:clip-1");
  expect(audio().paused).toBe(false);
  expect(spoken).toEqual([]);
});

test("a reading that comes while its clip is fetched ahead waits for that request and does not ask again", async () => {
  let release: (b: Blob) => void = () => {};
  const { r, asked } = remote(() => new Promise<Blob>((res) => { release = res; }));
  prefetchClips(["Next?"], r);
  const done = vi.fn();
  speak("Next?", { remote: r, done });
  await flush();
  expect(asked).toEqual(["Next?"]);
  expect(audio().paused).toBe(true);   // still waiting for the clip
  release(blob());
  await flush();
  expect(asked).toEqual(["Next?"]);
  expect(audio().paused).toBe(false);
  audio().end();
  expect(done.mock.calls).toEqual([[true, undefined]]);
});

test("a clip that could not be fetched ahead tells the page, and the reading that needs it is the device's", async () => {
  const why = Object.assign(new Error("limit"), { code: "rate_limited" });
  const { r, asked, failed } = remote(async () => { throw why; });
  prefetchClips(["Next?"], r);
  await flush();
  expect(failed).toEqual([why]);
  const done = vi.fn();
  speak("Next?", { remote: r, done });
  await flush();
  expect(asked).toEqual(["Next?", "Next?"]);   // fetched ahead and failed: the reading tries the server itself once more, then the device reads
  expect(spoken.map((u) => u.text)).toEqual(["Next?"]);
});

test("no more than six clips are fetched ahead at a time", async () => {
  const { r, asked } = remote(async () => blob());
  prefetchClips(["1", "2", "3", "4", "5", "6", "7", "8"], r);
  await flush();
  expect(asked).toEqual(["1", "2", "3", "4", "5", "6"]);
});
