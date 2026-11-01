import { state } from "../state.js";
import { lcRel, REL } from "../core/rel.js";
import { sayCategories, sayCategory, unsayCategory } from "../categories/flow.js";
import { editPair, usePair } from "../find/flow.js";
import { checkInstance, sayNothing, writeInstance } from "../instance/flow.ts";
import { backSyllogism, exampleSyllogism, saySyllogism } from "../syllogism/flow.js";
import { REPLIES, syllogismText } from "../../domain/syllogism.ts";
import type { Reply, Syllogism } from "../../domain/syllogism.ts";
import { spokenCategories, spokenCounter, spokenPair, spokenSyllogism, spokenThing, spokenYesNo } from "../../domain/spoken.ts";
import type { PlaceQuestion } from "../../domain/place.ts";
import type { InstanceQuestion } from "../../domain/instance.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { Ui } from "../types.ts";

/* ---------- what the voice asks and takes on Syllogisms, Categories, the words of Find a pair and Find an instance ---------- */
// shell/voice.js asks the same of Relations, Pervasions and the examples of Find a pair itself. Each screen here asks one thing at a time: `asked` says which (the same
// shape as there: a key that names the screen, what to read, what to say when the answer is not understood), and `heard` turns what was said into the step the screen
// would take for a tap or typed words, as `{heard, label, apply}`: the page waits for Yes with `label` (or goes on after a short bar), then runs `apply`, which may return the way back.

/** What a screen asks: `key` names the screen (a new one stops what the last started), `say` is read aloud, `hint` is said when the answer is not understood, and the Sprint clock of
 *  the question stands still while it is read (`clock`). `kind`: "yesno" is a question whose answer goes on at once, with a way back for a few seconds (no wait for Yes). */
export interface AskAny {
  key: string;
  kind: string;
  say: string;
  /** the cell of the examples being asked (shell/voice.js) */
  cell?: string;
  hint?: string;
  clock?: boolean;
  /** nothing is read for it, and there is no strip to hear it again (the result) */
  quiet?: boolean;
  /** the result goes on after a short bar (Sprint, with nothing on it that has to be read) */
  auto?: boolean;
}
export interface Ask extends AskAny {
  kind: "syl" | "counter" | "cats" | "yesno" | "pair" | "instance";
  hint: string;
  clock: boolean;
}
/** A spoken answer read: what was heard, what it is taken as, and the step it takes. */
export interface Heard {
  heard: string;
  label: string;
  /** what it returns: the way back (a function), or the words to say when the screen did not take the step and asks again (a string) */
  apply: () => void | string | (() => void);
  quick?: boolean;
}

const ix = () => state as unknown as DataIndex;
/** One name for each attempt on screen, so that the same thing asked twice in a row is still a new screen to the voice. */
const attempt = (u: Ui): string => (u.vk ||= Math.random().toString(36).slice(2, 8));
const ALL: Record<number, string> = { 1: "one of them", 2: "both", 3: "all three" };
const allOf = (n: number) => ALL[n] || "all of them";
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

/** What the screen asks, or null when it asks nothing that is spoken: for the four exercises here; undefined for the others (their screens are asked in shell/voice.js). */
export function askedHere(u: Ui): Ask | null | undefined {
  if (u.syllogism) {
    const c = state.cur && (state.cur.c as Syllogism | undefined);
    if (state.tab !== "syllogism" || !c || u.step > 1) return null;
    if (u.step === 1) return { key: "syl:" + attempt(u) + "/x", kind: "counter", say: "Name something that is " + c.reason + " and is not " + c.predicate + ".", hint: "Say a counter-example, or “skip”.", clock: false };
    return { key: "syl:" + attempt(u) + "/r", kind: "syl", say: syllogismText(c, state.syllogismWording) + " Do you accept it?",
      hint: "Say “I accept”, “the reason is not established” or “there is no pervasion”.", clock: true };
  }
  if (u.cats) {
    const q = state.cur && (state.cur.q as PlaceQuestion | undefined);
    if (state.tab !== "categories" || !q || u.step !== 0) return null;
    if (u.ask === "one") {
      const row = q.rows[u.i];
      return row ? { key: "cat:" + attempt(u) + "/" + u.i, kind: "yesno", say: "Is " + q.thing.n + " " + row.phrase + "?", hint: "Say yes or no.", clock: true } : null;
    }
    return { key: "cat:" + attempt(u) + "/all", kind: "cats", say: "Which categories is " + q.thing.n + " in?",
      hint: "Say the categories it is in, or their numbers, or “none of these”.", clock: true };
  }
  if (u.inst) {
    const s = state.cur && (state.cur.iq as InstanceQuestion | undefined), n = s ? s.cats.length : 0;
    if (state.tab !== "instance" || !s) return null;
    return { key: "inst:" + attempt(u), kind: "instance", clock: true, hint: "Say a thing, or “nothing” if nothing can be " + allOf(n) + ".",
      say: n === 1 ? "Name one of the " + s.labels[0] + "." : "Name something that is " + allOf(n) + " of these: " + s.labels.join(", ") + "." };
  }
  if (u.find && u.step === 0) {
    if (state.tab !== "find" || u.open || u.checked) return null;
    return { key: "find:" + attempt(u) + "/name", kind: "pair", say: "Name two phenomena that are " + lcRel(REL[u.rel as keyof typeof REL].name) + ".",
      hint: "Say two phenomena, such as “wood and fire”.", clock: true };
  }
  return undefined;
}

const EXERCISES = ["practice", "debate", "find", "categories", "instance", "syllogism"];
/**
 * What the result on screen asks in Hands-free: to be left. Nothing is read; the microphone listens for "next", "explain" or "stop". In Sprint the result goes on by itself after a bar
 * (`auto`), unless there is something on it to be read or answered: a station (a term's stop, a stage coming in), an offer, a step of the guidance, Claude at work or his explanation.
 * A station is a screen of its own, so it is asked again under its own key.
 */
export function resultAsk(u: Ui): AskAny | null {
  if (!state.cur || !EXERCISES.includes(state.tab)) return null;
  const station = u.stop ? "/stop" : u.up && u.up.shown ? "/stage" : "";
  const offer = u.offer && u.offer.kind !== "done";
  const holds = !!(station || offer || u.guideDown || u.negOffer || u.ctl || u.explained || state.autoExplain);
  return { key: "res:" + attempt(u) + station, kind: "result", say: "", quiet: true, clock: false, auto: !!state.blitz && !holds,
    hint: "Say “next” to go on, or “explain” to ask Claude." };
}

/** What was said, as the step it stands for; a string (what to say) when the words are not an answer to this screen. */
export function heardHere(a: AskAny, alts: readonly string[]): Heard | string {
  const u = state.ui as Ui, hint = a.hint || "";
  if (a.kind === "syl") {
    const r = spokenSyllogism(alts, REPLIES as readonly Reply[]);
    if (!r) return hint;
    const said = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" }[r];
    // a "no pervasion" goes on to the counter-example unless Sprint is on, and can be taken back from there
    return { heard: alts[0], label: said, apply: () => { saySyllogism(r); if (r === "pervasion" && !state.blitz) return () => backSyllogism(); } };
  }
  if (a.kind === "counter") {
    const x = spokenCounter(ix(), alts);
    if (!x) return hint;
    return { heard: x.heard, label: x.none ? "no counter-example" : x.text, apply: () => {
    u.exText = x.none ? "" : x.text; exampleSyllogism();
    // the subject itself is no counter-example: the screen says so and asks again, with the field emptied
    if (state.ui === u && u.step === 1 && !u.checked && u.exNote) { const note = u.exNote as string; u.exText = ""; return note; }
  } };
  }
  if (a.kind === "yesno") {
    const yn = spokenYesNo(alts);
    if (!yn) return hint;
    const i = u.i as number;
    return { heard: alts[0], label: yn === "yes" ? "Yes" : "No", quick: true,
      apply: () => { sayCategory(yn === "yes"); if (!(state.ui && state.ui.checked)) return () => unsayCategory(i); } };
  }
  if (a.kind === "cats") {
    const q = state.cur!.q as PlaceQuestion, r = spokenCategories(alts, q.rows);
    if (!r) return hint;
    const names = r.cats.map((c) => q.rows.find((x) => x.cat === c)!.phrase);
    return { heard: r.heard, label: names.length ? joinAnd(names) : "none of these", apply: () => { sayCategories(r.cats); } };
  }
  if (a.kind === "pair") {
    const r = spokenPair(ix(), alts);
    if (!r) return hint;
    return { heard: r.heard, label: r.a + " and " + r.b, apply: () => { u.wordA = r.a; u.wordB = r.b; usePair({ voiced: true }); if (state.ui && state.ui.step === 1) return () => editPair(); } };
  }
  const x = spokenThing(ix(), alts), n = (state.cur!.iq as InstanceQuestion).cats.length;
  if (!x) return hint;
  return { heard: x.heard, label: x.none ? "nothing is " + allOf(n) : x.text, apply: () => { if (x.none) sayNothing(true); else writeInstance(x.text); checkInstance(); } };
}
