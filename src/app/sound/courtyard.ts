// The sounds of the app, a system called Courtyard: wood for what the learner does (a right answer is two rising knocks, a partly right one two level knocks, a wrong one one low
// dull knock), a small bell for what the course gives (a new term, a new stage) and a tingsha, two tiny cymbals, for Claude. Everything is synthesized with the Web Audio API from
// oscillators and filtered noise, so the sounds cost no download and no sample is licensed. Nothing here touches the page, the state or the clock: a sound is scheduled into an audio
// context at a time given, which is what the tests do with a stand-in context and what `play.ts` does with the real one.
//
// The rules the nine sounds keep (they were listened to and picked in the project's Sound Lab): a result is under a second and wrong is never longer than right, lower and softer; a
// definition is under two seconds, a stage under three; nothing below 140 Hz (a phone speaker gives none, so the chain cuts it); every sound goes through one small stone room and a
// safety compressor, so none of them can be loud.

/** The moments that have a sound. */
export type Cue = "right" | "partly" | "wrong" | "next" | "definition" | "stage" | "claude" | "knock" | "timeup";
export const CUES: readonly Cue[] = ["right", "partly", "wrong", "next", "definition", "stage", "claude", "knock", "timeup"];

/** A sound being scheduled: the context, where its nodes go, and the time it has fallen about 40 dB (`end`), which a listener calls its length. */
interface Voice { ctx: BaseAudioContext; dest: AudioNode; end: number }

const mtof = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** A small seeded random generator, so the noise and the room are the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- the room: noise, reverb, the chain every sound goes through ---------- */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx); if (b) return b;
  const len = Math.floor(ctx.sampleRate * 2), r = rng(7);
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  noiseCache.set(ctx, b); return b;
}
/** A small stone room: decaying noise that gets darker as it dies. */
function impulse(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * secs), b = ctx.createBuffer(2, len, sr), r = rng(11), ramp = Math.floor(sr * 0.005);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      lp += (r() * 2 - 1 - lp) * (0.12 + 0.8 * (1 - x));
      d[i] = lp * (1 - x) ** 3.2 * (i < ramp ? i / ramp : 1);
    }
  }
  return b;
}
/** How long the room rings after a sound has stopped (s): a sound's nodes are let go after it. */
export const ROOM = 1.3;
/** The share of a sound sent into the room (the rest is dry). */
const SEND = 0.2;

/** The chain: highpass at 140 Hz, a small room, a gentle compressor, the volume. `group` makes the gain node one sound plays into. */
export interface Rig { out: GainNode; group(): GainNode }
export function rig(ctx: BaseAudioContext, volume: number): Rig {
  const sum = ctx.createGain(), hp = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor(), out = ctx.createGain(), conv = ctx.createConvolver(), dryBus = ctx.createGain();
  hp.type = "highpass"; hp.frequency.value = 140; hp.Q.value = 0.5;
  comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.12;
  out.gain.value = volume;
  conv.buffer = impulse(ctx, ROOM);
  dryBus.connect(sum); conv.connect(sum); sum.connect(hp); hp.connect(comp); comp.connect(out); out.connect(ctx.destination);
  return {
    out,
    group() {
      const g = ctx.createGain(), s = ctx.createGain();
      s.gain.value = SEND;
      g.connect(dryBus); g.connect(s); s.connect(conv);
      return g;
    },
  };
}
/** Fades a sound's gain node out and cuts it loose: a new sound cuts the tail of the one before it. */
export function release(ctx: BaseAudioContext, g: GainNode, secs = 0.05): void {
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.setTargetAtTime(0, now, secs / 3);
  setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, secs * 1000 + 400);
}

/* ---------- voices ---------- */

/** Zero, a short linear attack to `peak`, then an exponential fall with time constant `tau`. */
function ar(param: AudioParam, t: number, peak: number, a: number, tau: number) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(0, t + a, tau);
}
const AUD = 4.6;       // time constants until the sound is 40 dB down: its audible length
const STOP = 8;        // time constants until the oscillator is let go (60+ dB down, no click)
const mark = (V: Voice, e: number) => { if (e > V.end) V.end = e; };
/** A voice that sends its sound through a lowpass first, sharing V's clock. */
function lp(V: Voice, hz: number): Voice {
  const f = V.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = hz; f.Q.value = 0.5; f.connect(V.dest);
  return { ctx: V.ctx, dest: f, get end() { return V.end; }, set end(v: number) { V.end = v; } };
}
interface Pt { t: number; f: number; peak: number; tau: number; a?: number; glide?: [from: number, tau: number] }
/** One sine oscillator, struck. */
function pt(V: Voice, o: Pt) {
  const ctx = V.ctx, osc = ctx.createOscillator(), g = ctx.createGain(), a = o.a ?? 0.003;
  osc.type = "sine";
  osc.frequency.setValueAtTime(o.f * (o.glide ? o.glide[0] : 1), o.t);
  if (o.glide) osc.frequency.setTargetAtTime(o.f, o.t, o.glide[1]);
  ar(g.gain, o.t, o.peak, a, o.tau);
  osc.connect(g); g.connect(V.dest);
  osc.start(o.t); osc.stop(o.t + a + o.tau * STOP + 0.05);
  mark(V, o.t + a + o.tau * AUD);
}
interface Nz { t: number; dur: number; peak: number; a?: number; tau: number; filters: { type: BiquadFilterType; f: number; q?: number }[] }
/** Filtered noise, struck. */
function nz(V: Voice, o: Nz) {
  const ctx = V.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noiseBuffer(ctx); src.loop = true;
  let node: AudioNode = src;
  for (const fl of o.filters) {
    const bq = ctx.createBiquadFilter(); bq.type = fl.type; bq.Q.value = fl.q ?? 0.7;
    bq.frequency.setValueAtTime(fl.f, o.t);
    node.connect(bq); node = bq;
  }
  const a = o.a ?? 0.002, stop = o.t + a + o.tau * STOP;
  ar(g.gain, o.t, o.peak, a, o.tau); mark(V, o.t + a + o.tau * AUD);
  node.connect(g); g.connect(V.dest);
  src.start(o.t, 0); src.stop(stop + 0.05);
}
interface Add { t: number; f: number; ratios: number[]; amps: number[]; rel: number[]; T: number; peak: number; a?: number; beat?: number }
/** Partials that fall at their own rates; `beat` adds a twin of the first partial that many Hz apart (the shimmer of a bell). */
function add(V: Voice, o: Add) {
  o.ratios.forEach((r, i) => pt(V, { t: o.t, f: o.f * r, peak: o.peak * o.amps[i]!, tau: o.T * o.rel[i]!, a: o.a }));
  if (o.beat) pt(V, { t: o.t, f: o.f + o.beat, peak: o.peak * o.amps[0]! * 0.6, tau: o.T * o.rel[0]!, a: o.a });
}
/** A dry little tick of paper or a nail: highpassed noise, a few milliseconds. */
function tick(V: Voice, o: { t: number; hp: number; peak: number; tau: number }) {
  nz(V, { t: o.t, dur: 0.05, peak: o.peak, a: 0.0006, tau: o.tau, filters: [{ type: "highpass", f: o.hp, q: 0.7 }] });
}

/* ---------- instruments ---------- */

/** A small temple bell: a hum below, the strike tone, and bright partials that go first. */
function bell(V: Voice, o: { t: number; f: number; peak: number; T: number }) {
  add(V, { t: o.t, f: o.f, ratios: [0.5, 1, 2, 2.4, 3, 4.07, 5.4], amps: [0.25, 1, 0.45, 0.3, 0.2, 0.1, 0.05], rel: [1.4, 1, 0.7, 0.5, 0.35, 0.22, 0.12], T: o.T, peak: o.peak, a: 0.004, beat: 0.7 });
  nz(V, { t: o.t, dur: 0.01, peak: o.peak * 0.06, a: 0.0008, tau: 0.005, filters: [{ type: "bandpass", f: o.f * 4, q: 1.2 }] });
}
/** A hollow block of wood, like the wooden fish of a temple: a short body tone that drops a little, a second partial, and the knock of the stick. */
function wood(V: Voice, o: { t: number; f: number; peak: number; tau: number; lp?: number }) {
  const S = o.lp ? lp(V, o.lp) : V;
  pt(S, { t: o.t, f: o.f, peak: o.peak, tau: o.tau, a: 0.0012, glide: [1.1, 0.008] });
  pt(S, { t: o.t, f: o.f * 2.32, peak: o.peak * 0.28, tau: o.tau * 0.45, a: 0.001 });
  nz(S, { t: o.t, dur: 0.01, peak: o.peak * 0.4, a: 0.0008, tau: 0.004, filters: [{ type: "bandpass", f: o.f * 2.6, q: 1.4 }] });
}
/** Two tiny cymbals touched together: high inharmonic partials, the two a few Hz apart so they shimmer. */
function tingsha(V: Voice, o: { t: number; T: number; peak: number }) {
  const part = { ratios: [1, 1.52, 2.15, 2.9], amps: [1, 0.55, 0.35, 0.2], rel: [1, 0.7, 0.5, 0.35], a: 0.001 };
  add(V, { ...part, t: o.t, f: 2600, T: o.T, peak: o.peak, beat: 6 });
  add(V, { ...part, t: o.t + 0.012, f: 2750, T: o.T * 0.85, peak: o.peak * 0.8, beat: 5 });
}

/* ---------- the nine sounds ---------- */

const SOUNDS: Record<Cue, (V: Voice, t: number) => void> = {
  right: (V, t) => { wood(V, { t, f: 660, peak: 0.5, tau: 0.04 }); wood(V, { t: t + 0.08, f: 880, peak: 0.55, tau: 0.05 }); },
  partly: (V, t) => { wood(V, { t, f: 520, peak: 0.45, tau: 0.045 }); wood(V, { t: t + 0.11, f: 520, peak: 0.4, tau: 0.05 }); },
  wrong: (V, t) => { wood(V, { t, f: 300, peak: 0.42, tau: 0.06, lp: 700 }); },
  next: (V, t) => { wood(V, { t, f: 1250, peak: 0.3, tau: 0.018 }); tick(V, { t, hp: 2500, peak: 0.12, tau: 0.025 }); },
  definition: (V, t) => { bell(V, { t, f: mtof(79), peak: 0.3, T: 0.3 }); },
  stage: (V, t) => {
    wood(V, { t, f: 500, peak: 0.3, tau: 0.04 });
    bell(V, { t: t + 0.02, f: mtof(74), peak: 0.28, T: 0.16 }); bell(V, { t: t + 0.26, f: mtof(79), peak: 0.3, T: 0.16 }); bell(V, { t: t + 0.5, f: mtof(86), peak: 0.34, T: 0.33 });
  },
  claude: (V, t) => { tingsha(V, { t, T: 0.14, peak: 0.2 }); },
  knock: (V, t) => { wood(V, { t, f: 900, peak: 0.22, tau: 0.018 }); },
  timeup: (V, t) => { [0, 0.11, 0.19].forEach((dt) => wood(V, { t: t + dt, f: 700, peak: 0.4, tau: 0.03 })); },
};
/**
 * The loudness of each sound, worked out in the Sound Lab from renders (an ear-weighted level for most, the peak for the knocks) so that every sound sits where it should against Right:
 * results alike, wrong a little under right, the course's bell and Claude's tingsha softer, the stage under the definition's weight. Change a sound there, not here.
 */
const GAIN: Record<Cue, number> = { right: 0.511, partly: 0.605, wrong: 0.565, next: 0.417, definition: 0.405, stage: 0.367, claude: 0.268, knock: 0.605, timeup: 0.518 };
/** The master volume (the lab's slider stood at 80 %, squared): the phone's own volume stays in charge. */
export const MASTER = 0.64;

/**
 * Schedules `cue` into the group `g` at time `t`, `soft` (a repetition of what was heard before) at half the level. Returns the time the sound is over for a listener.
 */
export function schedule(ctx: BaseAudioContext, g: AudioNode, cue: Cue, t: number, soft = false): number {
  const eg = ctx.createGain();
  eg.gain.value = GAIN[cue] * (soft ? 0.5 : 1);
  eg.connect(g);
  const V: Voice = { ctx, dest: eg, end: t };
  SOUNDS[cue](V, t);
  return V.end;
}
/** How long a cue sounds, in seconds, without playing it. */
export function lengthOf(ctx: BaseAudioContext, cue: Cue): number {
  const V: Voice = { ctx, dest: ctx.createGain(), end: 0 };
  SOUNDS[cue](V, 0);
  return V.end;
}
