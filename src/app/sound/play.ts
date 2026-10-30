// Playing the sounds (courtyard.ts has what they are): when one may sound, one at a time, and what the Sounds switch in Settings does. The rules:
// - Silent: with the switch off, while the voice reads aloud (a sound would cover the words) or listens (the microphone would hear it), and when the page is hidden.
// - One sound at a time: a new one cuts the tail of the last. A time-up is not cut, so what follows it (a verdict, from the same moment) waits for it to end, and Claude's sound
//   waits for whatever is sounding, so the verdict that comes with an answer is heard first.
// - A sound follows a tap or a key, or a wait that one began; the browser keeps a page silent until the learner has touched it, so the audio context is made, and woken on a phone
//   (where it must be woken inside a tap), by the first touch, click or key (`armSounds`). A sound that arrives while the context is still waking plays if it wakes within half a second.
// - Nothing is heard for typing, scrolling, panels, choosing an option, favorites, flags, errors, the Check station while it runs, or while Claude is at work: the verdict plays when it
//   is back (the Verdict stays quiet while `pend`).
// The context, the room and the sound playing now are in `state.snd`; whether the switch is on is `state.sounds` (`rd-sounds`, on until the learner turns it off).
import { state } from "../state.js";
import { MASTER, ROOM, release, rig, schedule, type Cue } from "./courtyard.ts";

export type { Cue } from "./courtyard.ts";

const KEY = "rd-sounds";
/** How long a sound that had to wait for the audio context to wake may still play (ms): after it, it would be heard late. */
const FRESH = 500;
/** The gap between a sound and the one that waits for it (s). */
const GAP = 0.1;
/** Claude's answer waits this long (ms) for the verdict that comes with it to be drawn and heard first. */
const AFTER_VERDICT = 160;

export interface CueOptions {
  /** a repetition of what was heard before: the same sound at half the level */
  soft?: boolean;
  /** rings after the sound now playing instead of cutting it */
  after?: boolean;
}

function allowed(): boolean {
  if (!state.sounds) return false;
  if (state.voice.phase !== "idle") return false;
  try { if (document.visibilityState === "hidden") return false; } catch { /* no document */ }
  return true;
}

/** The audio context, made on first use (null where the browser has none). */
function context(): AudioContext | null {
  const s = state.snd;
  if (s.ctx || s.failed) return s.ctx;
  try {
    const C = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) throw new Error("no Web Audio");
    s.ctx = new C({ latencyHint: "interactive" });
    s.rig = rig(s.ctx, MASTER);
  } catch { s.failed = true; s.ctx = null; s.rig = null; }
  return s.ctx;
}

function play(ctx: AudioContext, cue: Cue, o: CueOptions) {
  const s = state.snd, now = ctx.currentTime, wait = Math.max(o.after ? s.until : 0, s.keep), queued = wait > now, t = queued ? wait + GAP : now + 0.02;
  if (!queued && s.live) release(ctx, s.live);
  const g = s.rig!.group(), end = schedule(ctx, g, cue, t, !!o.soft);
  s.live = g; s.until = end; if (cue === "timeup") s.keep = end;
  setTimeout(() => { if (s.live === g) s.live = null; try { g.disconnect(); } catch { /* already cut */ } }, (end - now + ROOM) * 1000 + 300);
}

/** The sound of a moment, when sounds are on and nothing forbids it. */
export function cue(name: Cue, o: CueOptions = {}): void {
  if (!allowed()) return;
  const ctx = context(); if (!ctx) return;
  if (ctx.state === "running") { play(ctx, name, o); return; }
  const at = performance.now();
  ctx.resume().then(() => { if (ctx.state === "running" && performance.now() - at < FRESH && allowed()) play(ctx, name, o); }, () => { /* wakes at the next tap */ });
}

/** The answers already given a sound, by the answer on screen: a result drawn again (a redraw of the page, the verdict mounting a second time) is not announced again. */
const said = new WeakMap<object, string>();
/** A verdict has landed on the result on screen (path/parts.tsx, Verdict): once for each verdict of an answer, so a verdict that Claude's check changes sounds again. */
export function verdictCue(v: "ok" | "no" | "pt"): void {
  const u = state.ui; if (!u || said.get(u) === v) return;
  said.set(u, v);
  cue(v === "ok" ? "right" : v === "no" ? "wrong" : "partly");
}

/** Claude's answer is in (an explanation, a reply): after the verdict it may have changed, which is drawn and heard first. */
export function answered(): void { setTimeout(() => cue("claude", { after: true }), AFTER_VERDICT); }

const GESTURES = ["pointerup", "touchend", "click", "keydown"] as const;
/** Makes the audio context and wakes it, inside the tap or key that is being handled (a phone allows it nowhere else). */
function unlock() {
  if (!state.sounds) return;
  const ctx = context();
  if (ctx && ctx.state !== "running") ctx.resume().catch(() => { /* wakes at the next tap */ });
}
/** Listens for the first touch, click or key, and every one after it (a phone puts the context to sleep when the app goes away). Called once, at the start. */
export function armSounds(): void {
  const s = state.snd; if (s.armed) return;
  s.armed = true;
  for (const e of GESTURES) document.addEventListener(e, unlock, { capture: true, passive: true });
}

/** The Sounds switch in Settings: kept on this device; turning it on plays a sample, which is also the way to hear whether the phone lets sounds through. */
export function setSounds(on: boolean): void {
  state.sounds = on;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode: this visit only */ }
  if (on) { unlock(); cue("right"); }
}
