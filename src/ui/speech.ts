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
};

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
const Recognition = (): (new () => Recognizer) | null => {
  const g = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
};

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

/**
 * Says `text`. `done(ok, error)` comes once, when it has been said, when it failed (`not-allowed`: the browser wants a
 * tap on the page first), or when it was cut off by `stopSpeaking` or by the next `speak`.
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
  const end = (ok: boolean, error?: string) => { if (over) return; over = true; opts.done?.(ok, error); };
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
  /** stop listening and take what was heard so far */
  stop(): void;
  /** stop and report nothing */
  abort(): void;
}
/**
 * Listens for one short answer (the recognizer stops by itself after a pause). `interim` gets the words as they are
 * heard; `done` comes once, unless `abort` was called. Errors as the API names them: `not-allowed` (microphone
 * refused), `no-speech`, `audio-capture` (no microphone), `network` (the speech service could not be reached).
 */
export function listen(opts: { lang?: string; interim?: (text: string) => void; done: (h: Heard) => void }): Listening {
  const R = Recognition();
  if (!R) { opts.done({ error: "unsupported" }); return { stop() {}, abort() {} }; }
  let gone = false, cur: Recognizer | null = null, watch: ReturnType<typeof setTimeout> | undefined, granted = false;
  // While the browser asks for the microphone, no audio starts either: restart only once it has been allowed.
  try {
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((s) => { granted = s.state === "granted"; }, () => {});
  } catch { /* the browser has no such permission to ask about */ }
  const run = (again: boolean) => {
    const r = new R();
    cur = r;
    r.lang = opts.lang || "en-US";
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    let alts: string[] | null = null, error = "", opened = false;
    r.onaudiostart = () => { opened = true; clearTimeout(watch); };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) alts = Array.from(res as ArrayLike<{ transcript: string }>).map((a) => a.transcript.trim()).filter(Boolean);
        else interim += res[0].transcript;
      }
      if (!gone && opts.interim) opts.interim(interim || (alts ? alts[0] : ""));
    };
    r.onerror = (e) => { error = e.error || "error"; };
    r.onend = () => {
      clearTimeout(watch);
      if (gone || cur !== r) return;
      gone = true;
      opts.done(alts && alts.length ? { alts } : { error: error || "no-speech" });
    };
    // Some starts open no microphone at all; one restart usually cures it (the lab saw this in Chrome).
    if (!again) watch = setTimeout(() => { if (!opened && !gone && granted) { try { r.abort(); } catch { /* already ended */ } run(true); } }, 2500);
    try { r.start(); } catch (e) { clearTimeout(watch); gone = true; opts.done({ error: "start: " + String((e as Error).message || e) }); }
  };
  run(false);
  return {
    stop() { try { cur?.stop(); } catch { /* already ended */ } },
    abort() { gone = true; clearTimeout(watch); try { cur?.abort(); } catch { /* already ended */ } },
  };
}
