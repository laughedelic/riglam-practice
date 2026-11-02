// The browser's own speech: reading text aloud (speechSynthesis) and hearing a short answer (SpeechRecognition).
// No service of the app's and no key: what the device and the browser offer. The page decides what to say and what
// to do with what was heard (src/app/shell/voice.js); this file only wraps the two APIs and their quirks, which the
// Voice lab measured (Chrome on macOS and Android).
// Nothing is recorded or kept here. The recognizer is the browser's: Chrome sends the audio to Google's speech
// service to turn it into text, Safari to Apple's or does it on the device.

/** A voice of this device, in the form the Options row lists. */
export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
  local: boolean;
  /** the accent of the voice's language tag: "American", "British", "Australian"... */
  accent: string;
}

type Recognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechend: (() => void) | null;
};

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
const Recognition = (): (new () => Recognizer) | null => {
  const g = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
};

/**
 * Whether Voice is on: the device's own choice (`rd-voice`, "1" or "0") when it made one, else the build's default, which is on in a
 * Preview (staging, a pull request) and off in the real app.
 */
export const voiceOn = (stored: string | null, preview: boolean): boolean => (stored === "1" ? true : stored === "0" ? false : preview);

export const canSpeak = (): boolean => !!synth();
export const canHear = (): boolean => !!Recognition();

// macOS lists novelty and multi-language voices that Chrome cannot load; it then speaks them in a default voice. All of
// them were rated bad in the Voice lab, so they are not offered.
const DEAD = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Ralph|Kathy|Samantha)$|^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley) \(/;
// Which kinds of voice sound best, as far as the lab and the vendors' names tell: Edge's neural voices, Apple's
// downloadable ones, then Google's (Chrome's "Google US English", "Google UK English Female" and "Male", which Alexey
// found to have good intonation), then Apple's enhanced ones, then the few macOS voices rated "meh" rather than "bad".
function rank(v: SpeechSynthesisVoice): number {
  if (/\bNatural\b|Neural/.test(v.name)) return 6;
  if (/\(Premium\)/.test(v.name)) return 5;
  if (/\bGoogle\b/.test(v.name)) return 4;
  if (/\(Enhanced\)/.test(v.name)) return 3;
  if (/^(Daniel|Karen|Moira|Rishi|Tessa)\b/.test(v.name)) return 1;
  return 0;
}
const langOf = (v: SpeechSynthesisVoice) => String(v.lang || "").replace("_", "-");
const idOf = (v: SpeechSynthesisVoice) => v.voiceURI || v.name + "|" + langOf(v);
// "en-US", "en_US" and, on some Android devices, "eng-USA"
const isEnglish = (v: SpeechSynthesisVoice) => /^eng?(?:-|$)/i.test(langOf(v));
const ACCENT: Record<string, string> = {
  US: "American", GB: "British", AU: "Australian", IN: "Indian", IE: "Irish", ZA: "South African", CA: "Canadian", NZ: "New Zealand",
  NG: "Nigerian", KE: "Kenyan", PH: "Philippine", SG: "Singapore", HK: "Hong Kong", TZ: "Tanzanian",
};
const REGION3: Record<string, string> = { USA: "US", GBR: "GB", AUS: "AU", IND: "IN", IRL: "IE", ZAF: "ZA", CAN: "CA", NZL: "NZ", NGA: "NG", KEN: "KE", PHL: "PH", SGP: "SG", HKG: "HK", TZA: "TZ" };
/** The accent a language tag names ("en-GB" is British); the tag itself when it is not one of the usual, "English" when it has no region. */
export function accentOf(lang: string): string {
  const m = /^eng?-([A-Za-z]{2,3})\b/i.exec(lang);
  if (!m) return "English";
  const r = m[1].toUpperCase(), code = r.length === 3 ? REGION3[r] || r : r;
  return ACCENT[code] || "English (" + code + ")";
}

function englishVoices(): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  const all = s.getVoices().filter((v) => isEnglish(v) && !DEAD.test(v.name));
  // of equally good voices, the one in the browser's own English comes first (American when the browser's language is not English)
  const own = typeof navigator !== "undefined" && /^en-/i.test(navigator.language || "") ? navigator.language.replace("_", "-").toLowerCase() : "en-us";
  const fit = (v: SpeechSynthesisVoice) => (langOf(v).toLowerCase() === own ? 1 : 0);
  return all
    .map((v, i) => [v, i] as const)
    .sort((x, y) => rank(y[0]) - rank(x[0]) || fit(y[0]) - fit(x[0]) || x[1] - y[1])
    .map(([v]) => v);
}
/** The English voices of this device, best first. The list can be empty until the browser has loaded it (see `onVoices`). */
export const voiceList = (): VoiceInfo[] => englishVoices().map((v) => ({ id: idOf(v), name: v.name, lang: langOf(v), local: v.localService, accent: accentOf(langOf(v)) }));
/** Calls `f` when the browser's list of voices changes (Chrome fills it in after the page loads). */
export function onVoices(f: () => void): void {
  const s = synth();
  if (s && s.addEventListener) s.addEventListener("voiceschanged", f);
}
const voiceFor = (id: string) => {
  const list = englishVoices();
  return list.find((v) => idOf(v) === id) || list[0] || null;
};

// Chrome can drop an utterance that nothing refers to, and then never reports its end.
const held: SpeechSynthesisUtterance[] = [];

// A synthesizer is not trusted to say it has finished, either: with no speech engine behind it (Chromium on Linux) the end never
// comes. Reading takes about 70 ms a character at normal speed; four times that, and a few seconds more, is taken as the end.
const READ_SLACK = 5000, READ_PER_CHAR = 280;
/** How long after which the reading of `text` is taken as ended if the browser has not said so. */
export const readingTimeout = (text: string, rate = 1): number => READ_SLACK + Math.round((text.length * READ_PER_CHAR) / (rate > 0 ? rate : 1));

/**
 * Says `text`. `done(ok, error)` comes once, when it has been said, when it failed (`not-allowed`: the browser wants a
 * tap on the page first), when it was cut off by `stopSpeaking` or by the next `speak`, or, as `timeout`, when the browser never said.
 */
export function speak(text: string, opts: { voice?: string; rate?: number; done?: (ok: boolean, error?: string) => void } = {}): void {
  const s = synth();
  if (!s) { opts.done?.(false, "unsupported"); return; }
  s.cancel();
  if (s.paused) s.resume();
  const u = new SpeechSynthesisUtterance(text), v = voiceFor(opts.voice || "");
  // the utterance gets the voice's own language: a mismatch (voice en-GB, lang en-US) makes Chrome pick another voice
  if (v) { u.voice = v; u.lang = langOf(v); } else u.lang = "en-US";
  u.rate = opts.rate || 1;
  held.push(u);
  if (held.length > 8) held.shift();
  let over = false;
  const end = (ok: boolean, error?: string) => { if (over) return; over = true; clearTimeout(timer); opts.done?.(ok, error); };
  const timer = setTimeout(() => { if (over) return; s.cancel(); end(false, "timeout"); }, readingTimeout(text, u.rate));
  u.onend = () => end(true);
  u.onerror = (e) => end(false, e.error);
  s.speak(u);
}
export function stopSpeaking(): void {
  const s = synth();
  if (s) s.cancel();
}

/** What came of listening: the recognizer's guesses, best first, or why there are none. */
export type Heard = { alts: string[] } | { error: string };

export interface Listening {
  /** stop listening and take what was heard so far; a second call, or a recognizer that does not answer, ends it at once */
  stop(): void;
  /** stop and report nothing */
  abort(): void;
}
// A recognizer is not trusted to say it has finished. Chrome on Android sometimes never sends `end` after an interruption (the
// screen went off, another app took the microphone, the service died); the page would then show "Listening" for good, and a
// tap on the microphone would stop a recognizer that is already gone. So every way of ending has a time after which it is
// taken as ended: the answer if there is one, otherwise nothing heard.
const AFTER_ERROR = 1500, AFTER_ANSWER = 2000, AFTER_STOP = 2000, AFTER_SPEECH = 5000, LONGEST = 20000, NO_AUDIO = 4000;
let active: Recognizer | null = null;
/**
 * Listens for one short answer (the recognizer stops by itself after a pause). `interim` gets the words as they are
 * heard; `done` comes once, unless `abort` was called. Errors as the API names them: `not-allowed` (microphone
 * refused), `no-speech`, `audio-capture` (no microphone), `network` (the speech service could not be reached), `no-audio`
 * (the microphone did not start, also on a second try).
 */
export function listen(opts: { lang?: string; interim?: (text: string) => void; done: (h: Heard) => void }): Listening {
  return listenOnce(opts);
}

/** A listening that can also be held: see `listenHeld`. */
export interface HeldListening extends Listening {
  /** the press was only a tap: from now on this is a plain listening that ends by itself, after a pause in the speech */
  release(): void;
}
/** The longest a press is held for. */
const HELD_LONGEST = 30000, HELD_AGAIN = 150;
/**
 * Hold to talk: listens for as long as something is held down. A recognizer ends at the first pause, so while the press lasts a pause is not the end: listening goes on,
 * and what was heard in each stretch is put together (one stretch gives its guesses as they are). `stop()` (the press is let go) ends it and reports what was heard,
 * `release()` (the press was a tap) turns it into a plain listening, `abort()` reports nothing. Errors other than "no-speech" end it at once.
 */
export function listenHeld(opts: { lang?: string; interim?: (text: string) => void; done: (h: Heard) => void }): HeldListening {
  let held = true, over = false, cur: Listening | null = null, again: ReturnType<typeof setTimeout> | undefined, err = "";
  const segs: string[][] = [];
  const text = () => segs.map((s) => s[0]).join(" ");
  const cap = setTimeout(() => stop(), HELD_LONGEST);
  const finish = () => {
    if (over) return;
    over = true; clearTimeout(again); clearTimeout(cap);
    if (!segs.length) { opts.done({ error: err || "no-speech" }); return; }
    opts.done({ alts: segs.length === 1 ? segs[0]! : [text(), ...segs[segs.length - 1]!.slice(1)] });
  };
  const run = () => {
    let ended = false;
    const l = listenOnce({
      lang: opts.lang,
      interim: (t) => opts.interim?.([text(), t].filter(Boolean).join(" ")),
      done: (h) => {
        ended = true; cur = null;
        if (over) return;
        if ("alts" in h) segs.push(h.alts); else err = h.error;
        // still held: a pause is not the end, listening goes on
        if (held && ("alts" in h || h.error === "no-speech")) { again = setTimeout(() => { if (!over && held) run(); else finish(); }, HELD_AGAIN); return; }
        finish();
      },
    });
    if (!ended) cur = l;
  };
  function stop() { if (over) return; held = false; if (cur) cur.stop(); else finish(); }
  run();
  return {
    stop,
    abort() { over = true; held = false; clearTimeout(again); clearTimeout(cap); cur?.abort(); cur = null; },
    release() { held = false; clearTimeout(cap); if (!cur && !over) finish(); },
  };
}

function listenOnce(opts: { lang?: string; interim?: (text: string) => void; done: (h: Heard) => void }): Listening {
  const R = Recognition();
  if (!R) { opts.done({ error: "unsupported" }); return { stop() {}, abort() {} }; }
  let gone = false, stopped = false, cur: Recognizer | null = null, granted = false;
  let alts: string[] | null = null, error = "";
  let watch: ReturnType<typeof setTimeout> | undefined, ending: ReturnType<typeof setTimeout> | undefined;
  const longest = setTimeout(() => { halt(AFTER_STOP); }, LONGEST);
  const release = (r: Recognizer | null) => { if (r) { try { r.abort(); } catch { /* already ended */ } if (active === r) active = null; } };
  const finish = (h: Heard) => {
    if (gone) return;
    gone = true;
    clearTimeout(watch); clearTimeout(ending); clearTimeout(longest);
    release(cur);
    opts.done(h);
  };
  const result = (): Heard => (alts && alts.length ? { alts } : { error: error || "no-speech" });
  // `end` should follow; if it does not within `ms`, it is taken as having come
  const endIn = (ms: number) => { clearTimeout(ending); ending = setTimeout(() => finish(result()), ms); };
  const halt = (ms: number) => { if (gone) return; stopped = true; try { cur?.stop(); } catch { /* already ended */ } endIn(ms); };
  // While the browser asks for the microphone, no audio starts either: restart only once it has been allowed.
  try {
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((s) => { granted = s.state === "granted"; }, () => {});
  } catch { /* the browser has no such permission to ask about */ }
  const run = (again: boolean) => {
    // one recognizer at a time: a previous one that is still shutting down can keep a new one from getting the microphone
    if (active && active !== cur) release(active);
    const r = new R();
    cur = r;
    active = r;
    r.lang = opts.lang || "en-US";
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    let opened = false;
    r.onaudiostart = () => { opened = true; clearTimeout(watch); };
    r.onresult = (e) => {
      if (gone || cur !== r) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) alts = Array.from(res as ArrayLike<{ transcript: string }>).map((a) => a.transcript.trim()).filter(Boolean);
        else interim += res[0].transcript;
      }
      if (alts) endIn(AFTER_ANSWER);
      if (opts.interim) opts.interim(interim || (alts ? alts[0] : ""));
    };
    r.onspeechend = () => { if (!gone && cur === r && !alts) endIn(AFTER_SPEECH); };
    r.onerror = (e) => { if (gone || cur !== r) return; error = e.error || "error"; endIn(AFTER_ERROR); };
    r.onend = () => {
      if (gone || cur !== r) return;
      finish(result());
    };
    // Some starts open no microphone at all; one restart usually cures it (the lab saw this in Chrome). If the second start
    // opens none either, that is said instead of waiting for the longest time.
    if (!again) watch = setTimeout(() => { if (!opened && !gone && !stopped && granted) { release(r); run(true); } }, 2500);
    else watch = setTimeout(() => { if (!opened && !gone && granted) finish({ error: "no-audio" }); }, NO_AUDIO);
    try { r.start(); } catch (e) {
      // "already started": the previous recognizer is still going down; once more after a moment
      if (!again && /InvalidState|already/i.test(String((e as Error).name) + String((e as Error).message))) {
        clearTimeout(watch); release(r);
        watch = setTimeout(() => { if (!gone && !stopped) run(true); }, 300);
        return;
      }
      finish({ error: "start: " + String((e as Error).message || e) });
    }
  };
  run(false);
  return {
    stop() {
      if (gone) return;
      if (stopped) { finish(result()); return; }
      halt(AFTER_STOP);
    },
    abort() { if (gone) return; gone = true; clearTimeout(watch); clearTimeout(ending); clearTimeout(longest); release(cur); },
  };
}
