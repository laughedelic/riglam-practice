// Reading a spoken answer. A speech recognizer gives a few guesses of what was said, best first; these functions turn
// them into the answer the page would get from a tap or from typing: a reply to a debate question (Accept or Why?,
// perhaps with the example said in the same breath), a relation, or an example for a cell. Each returns null when
// none of the guesses reads as an answer, so the page can ask again. Matching a closed set (two replies, five
// relations, the practice items) is what the browser's recognizer does well; open words are kept as they were heard.
import { matchItem, nearestItem, norm, similarity, spelled, type DataIndex } from "../ai-shared/lookup";
import type { Item } from "../ai-shared/data";
import type { RelKey } from "../ai-shared/relations";

/** Lower case, words only, numbers spelled out: the form in which spoken phrases are compared. */
export function plainWords(s: unknown): string {
  const NUM: Record<string, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };
  return spelled(s).replace(/-/g, " ").replace(/\b([1-5])p\b/g, (_, d) => NUM[d] + " possibilities").replace(/\b[1-5]\b/g, (d) => NUM[d]).replace(/\s+/g, " ").trim();
}

// Said before the example and not part of it.
const LEAD = /^(?:(?:um|uh|er|erm|so|well|okay|ok|because|since|for example|for instance|example|such as|like|say|let's say|lets say|take|how about|what about|consider|it is|it's|its|there is|there's)\b[\s,]*)+/i;
const clean = (s: string) => s.replace(LEAD, "").trim();

// ---- Accept or Why? ----

export type Reply = "accept" | "why";
// Each wording of the questions has its own two words (Accept / Why?, I accept / Why?, Yes / No); any of them is taken.
// "except" is how a recognizer often hears "accept".
const REPLIES: [string, Reply][] = ([
  ["i accept", "accept"], ["accept", "accept"], ["accepted", "accept"], ["i except", "accept"], ["except", "accept"],
  ["yes", "accept"], ["yeah", "accept"], ["yep", "accept"], ["i agree", "accept"], ["agreed", "accept"], ["agree", "accept"],
  ["why not", "why"], ["why", "why"], ["y", "why"], ["no", "why"], ["nope", "why"],
] as [string, Reply][]).sort((x, y) => y[0].length - x[0].length);

export interface SpokenReply {
  say: Reply;
  /** after Why?, the example said with it, if any */
  example: SpokenExample | null;
  /** the guess it was read from */
  heard: string;
}
/**
 * A reply to one of the four questions. The reply word comes first ("why, a gold pot"); an utterance that is nothing
 * but the name of a practice item is taken as Why? with that example, since positing it is what Why? leads to.
 */
export function spokenReply(ix: DataIndex, alts: readonly string[]): SpokenReply | null {
  const replyOf = (heard: string) => {
    const w = plainWords(heard);
    return REPLIES.find(([p]) => w === p || w.startsWith(p + " ")) || null;
  };
  for (const heard of alts) {
    const hit = replyOf(heard);
    if (!hit) continue;
    // the example may be heard better in another guess that starts with the same reply
    const rests = hit[1] === "why" ? alts.map((a) => [a, replyOf(a)] as const).filter(([, h]) => h && h[1] === "why").map(([a, h]) => restOf(a, h![0])).filter(Boolean) : [];
    const example = rests.length ? spokenExample(ix, rests) : null;
    return { say: hit[1], example: example && !example.none ? example : null, heard };
  }
  for (const heard of alts) {
    const t = clean(norm(heard));
    if (matchItem(ix, t)) return { say: "why", example: spokenExample(ix, [heard]), heard };
  }
  return null;
}
// The rest of an utterance after its first words, in its own spelling (the words are counted, not the letters).
function restOf(heard: string, lead: string): string {
  const n = lead.split(" ").length;
  return String(heard).trim().split(/\s+/).slice(n).join(" ").replace(/^[\s,.;:!?-]+/, "");
}

// ---- the relation ----

// The names as the page shows them, in a spoken form; "for" is how "four" is often written down.
const NAMES: [string, RelKey | "3"][] = [
  ["mutually inclusive", "mi"], ["mutually exclusive", "con"], ["three possibilities a in b", "3ab"], ["three possibilities b in a", "3ba"],
  ["four possibilities", "4"], ["for possibilities", "4"], ["three possibilities", "3"],
];
/**
 * The relation named. `order` is the page's order of the five (keys 1 to 5), so "one", "two" and "five" pick by
 * number like the keys do; "three" alone names three possibilities and "four" four possibilities, as their names
 * start so. "3" means three possibilities with no direction: the page asks which way. "A in B", "B contains A" and
 * the like give the direction, with or without "three possibilities" before them.
 */
export function spokenRelation(alts: readonly string[], order: readonly RelKey[]): RelKey | "3" | null {
  let vague = false;
  for (const heard of alts) {
    const w = plainWords(heard).replace(/\bbeing a\b/g, "b in a");
    const num = w.match(/^(?:number |option |key )?(one|two|three|four|five)$/);
    if (num) {
      const i = ["one", "two", "three", "four", "five"].indexOf(num[1]);
      if (/^(number|option|key) /.test(w) || (i !== 2 && i !== 3)) return order[i] || null;
      if (i === 3) return "4";
      vague = true;
      continue;
    }
    const inner = w.match(/\b(a|b) (?:is )?(?:in|inside|within|under|included in|contained in|part of) (a|b)\b/);
    if (inner && inner[1] !== inner[2]) return inner[1] === "a" ? "3ab" : "3ba";
    const outer = w.match(/\b(a|b) (?:contains|includes|encompasses|covers|pervades) (a|b)\b/);
    if (outer && outer[1] !== outer[2]) return outer[1] === "b" ? "3ab" : "3ba";
    if (/\binclusive\b/.test(w)) return "mi";
    if (/\bexclusive\b/.test(w)) return "con";
    if (/\b(four|for) possibilit/.test(w)) return "4";
    if (/\bthree possibilit/.test(w)) { vague = true; continue; }
    let best: [number, RelKey | "3"] = [0, "3"];
    for (const [name, k] of NAMES) {
      const s = similarity(w, name);
      if (s > best[0]) best = [s, k];
    }
    if (best[0] >= 0.75) {
      if (best[1] !== "3") return best[1];
      vague = true;
    }
  }
  return vague ? "3" : null;
}

// ---- an example ----

export interface SpokenExample {
  /** the example as the page should take it: the item's name or alias when the words were near one, else the words heard */
  text: string;
  /** the practice item it names, if any */
  item: Item | null;
  /** "nothing", "none", ...: the cell is left empty */
  none: boolean;
  /** the guess it was read from */
  heard: string;
}
const NONE = /^(?:nothing|none|empty|nil|null|zero|no example|nothing exists|nothing exists here|there is nothing|there is none|there are none|nothing here|it is empty|empty set)$/;
const tidy = (s: string) => {
  const t = clean(String(s).trim().replace(/[.!?]+$/, "").replace(/^[,;:\s]+/, ""));
  // a recognizer capitalizes the first word of a sentence; a name further on ("Shakyamuni Buddha") keeps the capitals
  return /^[A-Z](?:[a-z]|\s|$)/.test(t) && !/\s[A-Z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};
// Where an explanation starts after the example: the words before each of these, longest first.
const WHY_WORDS = new Set(["because", "since", "as", "which", "that", "is", "are", "it", "it's", "its", "being", "cause", "cuz"]);
function beforeWhy(t: string): string[] {
  const words = t.split(/\s+/), out: string[] = [];
  for (let n = words.length - 1; n > 0; n--) if (WHY_WORDS.has(words[n].toLowerCase().replace(/[,.;:!?]/g, ""))) out.push(words.slice(0, n).join(" ").replace(/[,;:]+$/, ""));
  return out;
}
/**
 * An example for a cell, or "nothing". A guess that names a practice item exactly wins, also when an explanation follows
 * it ("a gold pot, because it is both" is "a gold pot"); then the item nearest to any guess; failing those, the best
 * guess as it was heard, which the page checks like a typed example (or leaves to Claude).
 */
export function spokenExample(ix: DataIndex, alts: readonly string[]): SpokenExample | null {
  const said = alts.map(tidy).filter(Boolean);
  if (!said.length) return null;
  if (said.some((t) => NONE.test(plainWords(t)))) return { text: "", item: null, none: true, heard: alts[0] };
  // each guess whole, then the words before an explanation ("a gold pot because it is both")
  const parts = said.map((t, i) => [t, ...beforeWhy(t)].map((part) => ({ part, i })));
  for (const row of parts) for (const { part, i } of row) {
    const item = matchItem(ix, part);
    if (item) return { text: part, item, none: false, heard: alts[i] };
  }
  let near: { i: number; said: string; item: Item; score: number } | null = null;
  for (const row of parts) for (const { part, i } of row) {
    const n = nearestItem(ix, part);
    if (n && (!near || n.score > near.score)) near = { i, ...n };
  }
  if (near) return { text: near.said, item: near.item, none: false, heard: alts[near.i] };
  return { text: said[0], item: null, none: false, heard: alts[0] };
}
