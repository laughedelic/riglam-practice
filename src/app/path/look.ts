// How the Path looks. Every switch of the Path Lab (the design reference, a Claude artifact) is a setting here, so a choice made in
// the lab can be tried in the app: Settings takes the lab's "Copy settings" line. The defaults are the owner's picks in the lab
// (Version 21). The colors are worked out the way the lab works them out (its applyLook): the grounds, the inks mixed into them,
// the five colors lifted toward white on a dark ground, and the grain.
import { state } from "../state.js";

export interface Look {
  /** light or dark: "system" follows the device; the lab's own Mode switch only sets its preview, so a pasted line leaves this alone */
  mode: "system" | "light" | "dark";
  light: string;
  dark: string;
  blue: string;
  gold: string;
  green: string;
  red: string;
  purple: string;
  /** teal is the course's words (a new term, a repetition), slate the way back: the Design Lab's stops, 1 Nov */
  teal: string;
  slate: string;
  /** where the fine grain is laid: any of verdict, station, current, band, top, comma separated */
  grain: string;
  grainLevel: "soft" | "mid" | "strong";
  wait: "dots";
  font: string;
  hand: string;
  /** the margin line, the line weight, the station, the pair heading and the writing, in pixels */
  tM: number;
  tLw: number;
  tSt: number;
  tTn: number;
  tHand: number;
  choice: "margin" | "rows" | "branches";
  /** how a choice is taken: slid onto the path (the marks stand beside it; a tap does it too), or lit for a moment on the path */
  take: "slide" | "lit";
  /** how a station is taken: the old step folds at the curb and its lines squeeze up into the top bullet as the station rides up alone (take.ts), or the station pushes the page up ahead of it, or, when
   *  the page keeps a statement (`data-keep`), folds what is under it and opens the result there (push.ts), or the next step is there at once */
  ride: "fold" | "push" | "plain";
  /** how a station that pushes the page away comes to rest at the new step's first bullet: the big diamond comes to rest exactly there, then turns into the bullet (`set`), or rises a little past it and
   *  comes back (`recoil`) */
  land: "set" | "recoil";
  /** how the Check of the examples is taken: it slides up through the cases, marking each as it passes, marks the relation at the strip and becomes the result (scan.tsx), the same with the page
   *  going on into the result's page instead of being replaced by it (`morph`), or rides as any station */
  check: "scan" | "morph" | "ride";
  /** where Skip is: an icon under the favorites mark (an action on the pair, like saving it), or the side station at the foot (on hold) */
  skipAt: "under" | "foot";
  figs: "ink" | "color";
  ahead: "dot" | "dash" | "fade";
  next: "edge" | "page";
  edge: "run" | "fade";
  why: "detour" | "row" | "side";
  sheet: "top" | "bottom" | "path";
  toggle: "both" | "track" | "check" | "solid" | "stops" | "nested";
  /** the layout with the keyboard up: "sim" on a touch screen, "off" never */
  keys: "sim" | "off";
  star: "pair" | "bar";
  ask: "detour" | "row";
  tutorAuto: "off" | "on";
  abPos: "names" | "margin";
  /** companion fonts: the letters the main font or the hand lacks (Cyrillic, the Sanskrit marks) */
  cOn: "on" | "off";
  cSerif: string;
  cHand: string;
  cBo: string;
  cSa: string;
  cZh: string;
  words: "underline" | "diamond" | "chip";
  /** how the two terms of the pair stand out where the text names them: none, italic, italic with a small A or B, italic with a small diamond, or each in its own quiet ink */
  subj: "none" | "italic" | "letters" | "diamonds" | "lettered" | "inks";
  starShape: "star" | "eight" | "bookmark";
  miFig: "inset" | "full";
}

// the grounds the lab offers, by name
export const GROUNDS = {
  light: { paper: "#faf6ec", ivory: "#fbf9f2", eggshell: "#f4f1e8", linen: "#f5f0e6", bone: "#ebe8df", chalk: "#f6f6f3", white: "#ffffff" } as Record<string, string>,
  dark: { black: "#14151c", soot: "#171719", umber: "#1b1916", graphite: "#222327", slate: "#161a20", night: "#10162b" } as Record<string, string>,
};
// the families behind the names of the font switches; the app carries Newsreader, Kalam and IBM Plex Mono, and Spectral and Pangolin as
// companions, and asks Google Fonts for any other one picked here (it then needs the network the first time)
export const MAIN_FONTS: Record<string, string> = { newsreader: "Newsreader", sourceserif: "Source Serif 4", literata: "Literata", lora: "Lora", garamond: "EB Garamond", spectral: "Spectral", merri: "Merriweather", plexserif: "IBM Plex Serif", inter: "Inter", sourcesans: "Source Sans 3", plexsans: "IBM Plex Sans", atkinson: "Atkinson Hyperlegible Next" };
export const HAND_FONTS: Record<string, string> = { playpen: "Playpen Sans", caveat: "Caveat", kalam: "Kalam", patrick: "Patrick Hand" };
const SERIF_COMPANIONS: Record<string, string> = { spectral: "Spectral", sourceserif: "Source Serif 4", literata: "Literata", notoserif: "Noto Serif", garamond: "EB Garamond", charis: "Charis SIL", gentium: "Gentium Book Plus" };
const HAND_COMPANIONS: Record<string, string> = { pangolin: "Pangolin", playpen: "Playpen Sans", caveat: "Caveat", shantell: "Shantell Sans", badscript: "Bad Script", marck: "Marck Script", neucha: "Neucha" };
const BUNDLED = new Set(["Newsreader", "Kalam", "IBM Plex Mono"]);
const COMPANIONS_BUNDLED = new Set(["Spectral", "Pangolin"]);   // as companions: their Cyrillic and latin-ext, not their basic Latin (scripts/fetch-fonts.mjs)
const SANS = new Set(["inter", "sourcesans", "plexsans", "atkinson"]);
export const GRAIN_PLACES = ["verdict", "station", "current", "band", "top"];

/** The owner's picks in the lab, Version 21 (mode aside: the app follows the device until Settings says otherwise). */
export const DEFAULT_LOOK: Look = {
  mode: "system", light: "ivory", dark: "slate", blue: "#3155a4", gold: "#faaf3f", green: "#4c8a63", red: "#b83545", purple: "#6f3f8f", teal: "#2b7f86", slate: "#5b6b7e",
  grain: "verdict,station", grainLevel: "soft", wait: "dots", font: "newsreader", hand: "kalam", tM: 50, tLw: 2, tSt: 28, tTn: 34, tHand: 19,
  choice: "margin", take: "slide", ride: "push", land: "set", check: "morph", skipAt: "under", figs: "ink", ahead: "dot", next: "edge", edge: "fade", why: "row", sheet: "top", toggle: "both", keys: "sim", star: "pair",
  ask: "row", tutorAuto: "off", abPos: "margin", cOn: "on", cSerif: "spectral", cHand: "pangolin", cBo: "notoserifTib", cSa: "notoserifDeva", cZh: "wenkai",
  words: "underline", subj: "letters", starShape: "bookmark", miFig: "inset",
};

// what each setting may be; a value outside it keeps the default
const ONE_OF: Partial<Record<keyof Look, readonly string[]>> = {
  mode: ["system", "light", "dark"], light: Object.keys(GROUNDS.light), dark: Object.keys(GROUNDS.dark),
  grainLevel: ["soft", "mid", "strong"], wait: ["dots"], font: Object.keys(MAIN_FONTS), hand: ["newsreader", "main", "mainup", ...Object.keys(HAND_FONTS)],
  choice: ["margin", "rows", "branches"], take: ["slide", "lit"], ride: ["fold", "push", "plain"], land: ["set", "recoil"], check: ["scan", "morph", "ride"], skipAt: ["under", "foot"], figs: ["ink", "color"], ahead: ["dot", "dash", "fade"], next: ["edge", "page"], edge: ["run", "fade"],
  why: ["detour", "row", "side"], sheet: ["top", "bottom", "path"], toggle: ["both", "track", "check", "solid", "stops", "nested"], keys: ["sim", "off"],
  star: ["pair", "bar"], ask: ["detour", "row"], tutorAuto: ["off", "on"], abPos: ["names", "margin"], cOn: ["on", "off"],
  cSerif: Object.keys(SERIF_COMPANIONS), cHand: Object.keys(HAND_COMPANIONS), words: ["underline", "diamond", "chip"], subj: ["none", "italic", "letters", "diamonds", "lettered", "inks"], starShape: ["star", "eight", "bookmark"], miFig: ["inset", "full"],
};
const RANGES: Partial<Record<keyof Look, [number, number]>> = { tM: [40, 72], tLw: [1, 4], tSt: [22, 40], tTn: [26, 42], tHand: [16, 24] };
const COLORS: (keyof Look)[] = ["blue", "gold", "green", "red", "purple", "teal", "slate"];
const FREE: (keyof Look)[] = ["cBo", "cSa", "cZh"];   // kept as given: the app shows no Tibetan, Devanagari or Chinese yet

/** The look from stored or pasted settings: each known key with an allowed value replaces the default; anything else is left out. */
export function lookOf(raw: unknown, base: Look = DEFAULT_LOOK): Look {
  const out: Look = { ...base };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>, w = out as unknown as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_LOOK) as (keyof Look)[]) {
    const v = o[k];
    if (v === undefined || v === null) continue;
    const one = ONE_OF[k], range = RANGES[k];
    if (one) { if (typeof v === "string" && one.includes(v)) w[k] = v; }
    else if (range) { const n = Number(v); if (Number.isFinite(n)) w[k] = Math.max(range[0], Math.min(range[1], n)); }
    else if (COLORS.includes(k)) { if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) w[k] = v.toLowerCase(); }
    else if (k === "grain") { if (typeof v === "string") w[k] = v.split(",").filter((x) => GRAIN_PLACES.includes(x)).join(","); }
    else if (FREE.includes(k)) { if (typeof v === "string" && v.length < 40) w[k] = v; }
  }
  return out;
}

/**
 * A line pasted into Settings: the lab's "Copy settings" JSON. Returns the settings it changes from the defaults (so a later change of a
 * default reaches a device that did not pick that setting itself), or null when it is not such a line. The lab's Mode switch is its preview's,
 * not a choice for the app, and is left out.
 */
export function pastedLook(text: string): Partial<Look> | null {
  let raw: unknown;
  try { raw = JSON.parse(String(text).trim()); } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const known = Object.keys(raw).filter((k) => k in DEFAULT_LOOK && k !== "mode");
  if (!known.length) return null;
  const all = lookOf(raw), out: Partial<Look> = {};
  for (const k of known as (keyof Look)[]) if (all[k] !== DEFAULT_LOOK[k]) (out as Record<string, unknown>)[k] = all[k];
  return out;
}

const KEY = "rd-look";
/** What this device chose over the defaults (`rd-look`). */
export function storedLook(): Partial<Look> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
/** The look in use: the defaults with this device's choices. */
export function currentLook(): Look {
  if (!state.look) state.look = lookOf(storedLook());
  return state.look;
}
/** Changes some settings on this device (null for one puts its default back); `reset` forgets every choice first. */
export function setLook(changes: Partial<Record<keyof Look, unknown>>, reset = false): void {
  const kept: Record<string, unknown> = reset ? {} : { ...storedLook() };
  for (const [k, v] of Object.entries(changes)) { if (v === null || v === undefined) delete kept[k]; else kept[k] = v; }
  const look = lookOf(kept);
  for (const k of Object.keys(kept) as (keyof Look)[]) if (!(k in DEFAULT_LOOK) || look[k] === DEFAULT_LOOK[k]) delete kept[k];
  try { if (Object.keys(kept).length) localStorage.setItem(KEY, JSON.stringify(kept)); else localStorage.removeItem(KEY); } catch { /* storage may be blocked: the change holds for this visit */ }
  state.look = look;
}
/** The settings that differ from the defaults, as a line for the lab or for another device. */
export const lookLine = (look: Look = currentLook()): string => JSON.stringify(Object.fromEntries(Object.entries(look).filter(([k, v]) => (DEFAULT_LOOK as unknown as Record<string, unknown>)[k] !== v)));

/* ---------- colors ---------- */
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h: string, a: number) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

/** The custom properties of one ground: the lab's applyLook, unchanged. */
export function palette(look: Look, dark: boolean): Record<string, string> {
  const ground = dark ? GROUNDS.dark[look.dark] || GROUNDS.dark.slate : GROUNDS.light[look.light] || GROUNDS.light.ivory;
  const ink = dark ? "#ece7dc" : "#14151c";
  const lift = (c: string, t: number) => (dark ? mix(c, "#ffffff", t) : c);
  const blue = lift(look.blue, 0.42), green = lift(look.green, 0.3), red = lift(look.red, 0.32), purple = lift(look.purple, 0.42), gold = look.gold;
  const teal = lift(look.teal, 0.42), slate = lift(look.slate, 0.42);
  const goldT = dark ? gold : mix(gold, "#000000", 0.4);
  return {
    "--paper": ground, "--ink": ink, "--ink2": mix(ink, ground, 0.36), "--ink3": mix(ink, ground, 0.58),
    "--rule": rgba(ink, dark ? 0.13 : 0.12), "--mline": rgba(ink, dark ? 0.16 : 0.18),
    "--blue": blue, "--blue-t": rgba(blue, dark ? 0.12 : 0.07), "--blue-tp": mix(ground, blue, dark ? 0.12 : 0.07), "--gold": gold, "--gold-t": goldT,
    "--green": green, "--red": red, "--purple": purple, "--teal": teal, "--slate": slate,
    "--station": dark ? mix(look.blue, "#ffffff", 0.12) : look.blue, "--on-station": "#ffffff",
    "--skipc": blue,
    // Claude is orange, between the gold of a question and the red of a miss (the Design Lab, 1 Nov); its words take the darker shade, `-t`, which reads on the paper
    "--tutor": mix(gold, red, 0.45),
    "--tutor-t": mix(goldT, red, 0.6),
    // not settled (partly right, and a right relation whose examples are not checked yet) is purple, which is red and blue
    "--partc": purple,
    "--partc-t": purple,
  };
}

/* ---------- the grain ---------- */
// The Hero's grain (design/grain, GrainCore "fine"): per-pixel gaussian noise, 42 gray levels around 128, seed 20261017, laid over a color with
// soft-light; strength soft x0.55, mid x1, strong x1.6. Made once per strength, on a canvas.
const grains: Record<string, string> = {};
export function grainURL(level: string): string {
  if (grains[level]) return grains[level];
  const N = 256, f = new Float32Array(N * N);
  let a = 20261017 >>> 0, m = 0, v = 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < f.length; i++) { f[i] = (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * 1.4142; m += f[i]; }
  m /= f.length;
  for (let i = 0; i < f.length; i++) { f[i] -= m; v += f[i] * f[i]; }
  v = Math.sqrt(v / f.length) || 1;
  const k = 42 * ({ soft: 0.55, mid: 1, strong: 1.6 }[level] || 1);
  try {
    const c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d"); if (!x) throw new Error("no canvas");
    const img = x.createImageData(N, N);
    for (let i = 0; i < f.length; i++) { const g = Math.max(0, Math.min(255, Math.round(128 + (f[i] / v) * k))); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    grains[level] = `url(${c.toDataURL("image/png")})`;
  } catch { grains[level] = "none"; }
  return grains[level];
}

/* ---------- fonts ---------- */
const q = (n: string) => `'${n}'`;
const fontURL = (family: string) => "https://fonts.googleapis.com/css2?family=" + family.replace(/ /g, "+") + ":ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap";
const plainURL = (family: string) => "https://fonts.googleapis.com/css2?family=" + family.replace(/ /g, "+") + "&display=swap";
/** Asks Google Fonts for a family the app does not carry, once: a setting pasted from the lab may name one. */
function fetchFont(family: string, plain: boolean, companion = false): void {
  if (BUNDLED.has(family) || (companion && COMPANIONS_BUNDLED.has(family)) || typeof document === "undefined") return;
  const id = "pf-" + family.replace(/\W+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; l.href = plain ? plainURL(family) : fontURL(family);
  document.head.append(l);
}
/** The font families, as the lab chains them: the main font, then the companion for the letters it lacks; the hand, then its companion. */
export function families(look: Look): { main: string; hand: string; handItalic: boolean; handSize: number; handWeight: number } {
  const main = MAIN_FONTS[look.font] || "Newsreader", serifComp = SERIF_COMPANIONS[look.cSerif] || "Spectral", handComp = HAND_COMPANIONS[look.cHand] || "Pangolin";
  const on = look.cOn !== "off", generic = SANS.has(look.font) ? "'Helvetica Neue', Arial, sans-serif" : "Georgia, 'Times New Roman', serif";
  const mainChain = [q(main), ...(on ? [q(serifComp)] : []), generic].join(", ");
  fetchFont(main, false); if (on) fetchFont(serifComp, false, true);
  const hf = HAND_FONTS[look.hand];
  if (hf) {
    fetchFont(hf, true); if (on) fetchFont(handComp, true, true);
    const size = { caveat: 4, kalam: -2, patrick: 1, playpen: -1 }[look.hand] || 0, weight = { caveat: 500, playpen: 420 }[look.hand] || 400;
    return { main: mainChain, hand: [q(hf), ...(on ? [q(handComp), q(serifComp)] : []), q(main), "cursive"].join(", "), handItalic: false, handSize: look.tHand + size, handWeight: weight };
  }
  const upright = look.hand === "mainup", own = look.hand === "newsreader" ? [q("Newsreader"), ...(on ? [q(serifComp)] : []), "Georgia, serif"].join(", ") : mainChain;
  return { main: mainChain, hand: own, handItalic: !upright, handSize: look.tHand, handWeight: 450 };
}

/* ---------- applying it ---------- */
/** Whether the Path is drawn dark now: the look's mode, or the device's when it follows the system. */
export const darkNow = (look: Look) => look.mode === "dark" || (look.mode === "system" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
/** The switches as classes on the Path's root, the lab's names: ah-dot, edge-fade, figs-ink, words-underline, g-verdict, ab-margin, ... */
export function lookClasses(look: Look, dark: boolean): string[] {
  const cls = [`ah-${look.ahead}`, `edge-${look.edge}`, `figs-${look.figs}`, `words-${look.words}`, `sj-${look.subj}`, `ab-${look.abPos}`, `tg-${look.toggle}`, `ch-${look.choice}`, `why-${look.why}`,
    ...look.grain.split(",").filter(Boolean).map((g) => `g-${g}`)];
  if (dark) cls.push("dark");
  return cls;
}
/**
 * Writes the look onto the Path's root: the colors of the ground in use and the sizes as custom properties, and the colors of the browser's
 * bar to match the ground. Returns the switches as classes.
 */
export function applyLook(root: HTMLElement, look: Look): string[] {
  const dark = darkNow(look), fam = families(look), grain = look.grain ? grainURL(look.grainLevel) : "none";
  const vars: Record<string, string> = {
    ...palette(look, dark), "--grain": grain, "--t-m": look.tM + "px", "--t-lw": look.tLw + "px", "--t-st": look.tSt + "px", "--t-tn": look.tTn + "px",
    "--main-f": fam.main, "--hand-f": fam.hand, "--hand-st": fam.handItalic ? "italic" : "normal", "--hand-sz": fam.handSize + "px", "--hand-w": String(fam.handWeight),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const html = document.documentElement;
  html.style.setProperty("--path-paper", vars["--paper"]);
  // the Path's palette and face for the dialogs the page opens over it (outside #path, so the root's variables do not reach them; 11-path-bridge.css)
  for (const [k, v] of Object.entries(palette(look, dark))) html.style.setProperty("--pa-" + k.slice(2), v);
  html.style.setProperty("--pa-f", fam.main);
  html.style.colorScheme = dark ? "dark" : "light";
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = vars["--paper"];
  return lookClasses(look, dark);
}
