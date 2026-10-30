// The sounds of the app (src/app/sound): what each one is made of, how long it lasts, and when one may play. No browser: a stand-in audio context records what is scheduled into it.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { state } from "../../src/app/state.js";
import { CUES, lengthOf, rig, schedule } from "../../src/app/sound/courtyard.ts";
import type { Cue } from "../../src/app/sound/courtyard.ts";
import { answered, armSounds, cue, setSounds, verdictCue } from "../../src/app/sound/play.ts";

/** The part of an audio context the sounds use: every node does nothing, and each oscillator and noise source says when it starts. */
class FakeContext {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = this.node();
  starts: number[] = [];
  gains: { value: number }[] = [];
  private param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; }
  private node(extra: object = {}) { return { connect() {}, disconnect() {}, ...extra }; }
  createGain() { const gain = this.param(); this.gains.push(gain); return this.node({ gain }); }
  createOscillator() { const s = this.starts; return this.node({ frequency: this.param(), detune: this.param(), type: "sine", start(t: number) { s.push(t); }, stop() {} }); }
  createBufferSource() { const s = this.starts; return this.node({ buffer: null, loop: false, start(t: number) { s.push(t); }, stop() {} }); }
  createBiquadFilter() { return this.node({ frequency: this.param(), Q: this.param(), gain: this.param(), type: "" }); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createDynamicsCompressor() { return this.node({ threshold: this.param(), knee: this.param(), ratio: this.param(), attack: this.param(), release: this.param() }); }
  createConvolver() { return this.node({ buffer: null }); }
  resume() { this.state = "running"; return Promise.resolve(); }
}
const asCtx = (c: FakeContext) => c as unknown as BaseAudioContext;
const lengths = () => Object.fromEntries(CUES.map((c) => [c, lengthOf(asCtx(new FakeContext()), c)])) as Record<Cue, number>;

test("the nine sounds keep the lab's rules: a result under a second, wrong never longer than right, a definition under two seconds, a stage under three", () => {
  const n = lengths();
  expect(CUES).toHaveLength(9);
  for (const c of ["right", "partly", "wrong", "next", "knock", "timeup", "claude"] as Cue[]) expect(n[c], c).toBeLessThan(1);
  expect(n.wrong).toBeLessThanOrEqual(n.right);
  expect(n.partly).toBeLessThanOrEqual(n.right + 0.1);
  expect(n.definition).toBeLessThanOrEqual(2);
  expect(n.stage).toBeLessThanOrEqual(3);
  expect(n.stage, "the stage is the biggest").toBeGreaterThan(n.definition);
  expect(n.knock, "the knock and the question's tick are short").toBeLessThan(0.3);
  expect(n.next).toBeLessThan(0.3);
});

test("a sound is scheduled whole, with its notes in order, and the chain cuts what a phone speaker does not give", () => {
  const c = new FakeContext(), r = rig(asCtx(c), 0.5), g = r.group();
  const end = schedule(asCtx(c), g, "right", 1);
  expect(end).toBeGreaterThan(1);
  expect(c.starts.length, "two knocks of wood: tones and a touch of noise each").toBeGreaterThanOrEqual(6);
  expect(Math.min(...c.starts)).toBe(1);
  expect(Math.max(...c.starts), "the second knock follows the first").toBeGreaterThan(1.05);
  const soft = new FakeContext();
  schedule(asCtx(soft), rig(asCtx(soft), 0.5).group(), "definition", 0, true);
  const loud = new FakeContext();
  schedule(asCtx(loud), rig(asCtx(loud), 0.5).group(), "definition", 0, false);
  const level = (x: FakeContext) => x.gains.filter((p) => p.value > 0 && p.value < 1).map((p) => p.value);
  expect(level(soft).some((v) => Math.abs(v - 0.2025) < 1e-9), "a repetition is half the level").toBe(true);
  expect(level(loud).some((v) => Math.abs(v - 0.405) < 1e-9)).toBe(true);
});

/* ---------- when a sound may play ---------- */

const made: FakeContext[] = [];
/** The audio context the page made last. */
const last = () => made[made.length - 1]!;
beforeEach(() => {
  made.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", class extends FakeContext { constructor() { super(); made.push(this); } });
  state.sounds = true;
  state.snd = { ctx: null, rig: null, live: null, until: 0, keep: 0, failed: false, armed: false };
  state.voice.phase = "idle";
  state.ui = null;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("sounds are on until the device turns them off, and then no audio context is even made", () => {
  expect(state.sounds).toBe(true);
  cue("right");
  expect(state.snd.ctx).not.toBeNull();
  expect(last().starts.length).toBeGreaterThan(0);
  state.snd.ctx = null; state.snd.rig = null; last().starts = [];
  setSounds(false);
  expect(state.sounds).toBe(false);
  cue("right"); cue("stage"); cue("knock");
  expect(state.snd.ctx).toBeNull();
});

test("turning the switch on plays a sample, so that the learner hears whether this phone lets sounds through", () => {
  state.sounds = false;
  setSounds(true);
  expect(state.sounds).toBe(true);
  expect(last().starts.length).toBeGreaterThan(0);
});

test("nothing sounds while the voice reads aloud or listens", () => {
  state.voice.phase = "speaking"; cue("right");
  state.voice.phase = "listening"; cue("wrong");
  expect(state.snd.ctx).toBeNull();
  state.voice.phase = "idle"; cue("right");
  expect(state.snd.ctx).not.toBeNull();
});

test("a browser without Web Audio is left alone, once", () => {
  vi.stubGlobal("AudioContext", undefined);
  cue("right"); cue("right");
  expect(state.snd.failed).toBe(true);
  expect(state.snd.ctx).toBeNull();
});

test("a context that is still waking plays the sound once it wakes, and one that never wakes plays nothing", async () => {
  cue("right");                                    // makes the context
  const first = last();
  first.starts = []; first.state = "suspended";
  let wake = () => {};
  first.resume = () => new Promise<void>((done) => { wake = () => { first.state = "running"; done(); }; });
  cue("partly");
  expect(first.starts, "not yet").toHaveLength(0);
  wake(); await Promise.resolve(); await Promise.resolve();
  expect(first.starts.length, "now").toBeGreaterThan(0);
  first.starts = []; first.state = "suspended";
  first.resume = () => Promise.reject(new Error("blocked"));
  cue("wrong"); await Promise.resolve(); await Promise.resolve();
  expect(first.starts).toHaveLength(0);
});

test("a new sound cuts the tail of the last, but not a time-up: what follows it waits for it", () => {
  cue("definition");
  const bellEnd = state.snd.until;
  expect(bellEnd).toBeGreaterThan(0.2);
  last().currentTime = 0.1; last().starts = [];
  cue("right");
  expect(Math.min(...last().starts), "the bell is cut: right begins at once").toBeCloseTo(0.12, 5);
  last().currentTime = 5; last().starts = [];
  cue("timeup");
  const end = state.snd.until;
  last().currentTime = 5.05; last().starts = [];
  cue("wrong");
  expect(Math.min(...last().starts), "wrong waits for the time-up").toBeGreaterThanOrEqual(end);
  last().currentTime = end + 1; last().starts = [];
  cue("right");
  expect(Math.min(...last().starts), "and after it, nothing waits").toBeCloseTo(end + 1.02, 5);
});

test("Claude's sound rings after the verdict that comes with its answer, and does not cut it", () => {
  cue("right");
  const end = state.snd.until;
  answered();
  last().starts = [];
  vi.advanceTimersByTime(200);
  expect(Math.min(...last().starts)).toBeGreaterThanOrEqual(end);
});

test("a verdict sounds once for each verdict of an answer, and again for the next answer", () => {
  const a = {}, b = {};
  state.ui = a as typeof state.ui;
  verdictCue("ok");
  const once = last().starts.length;
  expect(once).toBeGreaterThan(0);
  verdictCue("ok");
  expect(last().starts.length, "a result drawn again is not announced again").toBe(once);
  verdictCue("no");
  expect(last().starts.length, "a verdict that Claude's check changed is").toBeGreaterThan(once);
  const twice = last().starts.length;
  state.ui = b as typeof state.ui;
  verdictCue("no");
  expect(last().starts.length).toBeGreaterThan(twice);
});

test("the first touch makes the context, any later one wakes it; a switched-off device makes none", () => {
  const on: Record<string, () => void> = {}, added: string[] = [];
  vi.stubGlobal("document", { addEventListener: (e: string, f: () => void) => { on[e] = f; added.push(e); }, visibilityState: "visible" });
  armSounds(); armSounds();
  expect(added.sort(), "listened for once").toEqual(["click", "keydown", "pointerup", "touchend"]);
  expect(state.snd.ctx, "nothing is made before a touch").toBeNull();
  on.click();
  expect(state.snd.ctx).not.toBeNull();
  const made = state.snd.ctx;
  last().state = "suspended"; on.touchend();
  expect(last().state, "a phone's context is woken inside the tap").toBe("running");
  expect(state.snd.ctx).toBe(made);
  state.snd.ctx = null; state.snd.rig = null; state.sounds = false;
  on.keydown();
  expect(state.snd.ctx).toBeNull();
});
