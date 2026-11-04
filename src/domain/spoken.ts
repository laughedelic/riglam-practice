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
  const NUM: Record<string, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine" };
  return spelled(s).replace(/&/g, " and ").replace(/-/g, " ").replace(/\b([1-5])p\b/g, (_, d) => NUM[d] + " possibilities").replace(/\b[1-9]\b/g, (d) => NUM[d]).replace(/\s+/g, " ").trim();
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

/** The pair's two terms as the page names them ("functional things", "products"). */
export interface PairTerms {
  a: string;
  b: string;
}
const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !/(?:ss|us|is)$/.test(w) ? w.slice(0, -1) : w);
const termWords = (s: string) => plainWords(s).split(" ").filter(Boolean).map(singular);
interface Span { from: number; to: number; score: number; term: "ta" | "tb" }
/** Every place where the heard words say a term: its words in order, each near enough, singular or plural. */
function findTerm(heard: string[], term: string[], name: "ta" | "tb"): Span[] {
  const out: Span[] = [];
  for (let from = 0; from + term.length <= heard.length; from++) {
    let sum = 0, ok = true;
    for (let j = 0; j < term.length && ok; j++) {
      const s = similarity(heard[from + j], term[j]);
      if (s < 0.75) ok = false; else sum += s;
    }
    const score = sum / term.length;
    if (ok && score >= 0.8) out.push({ from, to: from + term.length, score, term: name });
  }
  return out;
}
/** The heard words with the first term said in them as "ta" and the second as "tb"; `found` is how many of the two were said. Where one term holds the other ("physical things" in "physical things outside a person's continuum"), the longer is read first. */
function mask(w: string, terms: PairTerms): { words: string[]; found: number } {
  const orig = w.split(" ").filter(Boolean), sing = orig.map(singular), ta = termWords(terms.a), tb = termWords(terms.b);
  const all = [...(ta.length ? findTerm(sing, ta, "ta") : []), ...(tb.length ? findTerm(sing, tb, "tb") : [])].sort((x, y) => y.score - x.score || y.to - y.from - (x.to - x.from) || x.from - y.from);
  const used = new Array<boolean>(orig.length).fill(false), spans: Span[] = [];
  for (const s of all) {
    if (used.slice(s.from, s.to).some(Boolean)) continue;
    used.fill(true, s.from, s.to);
    spans.push(s);
  }
  spans.sort((x, y) => x.from - y.from);
  const words: string[] = [];
  for (let i = 0; i < orig.length; i++) {
    const s = spans.find((x) => x.from === i);
    if (s) { words.push(s.term); i = s.to - 1; } else words.push(orig[i]);
  }
  return { words, found: new Set(spans.map((x) => x.term)).size };
}
// Words that carry nothing for the readings below ("all X are a kind of Y").
const FILL = new Set(["a", "an", "the", "all", "every", "each", "any", "always", "also", "just", "only", "simply", "one", "kind", "type", "sort", "of", "that", "which"]);
const plain = (words: string[]) => words.filter((x) => !FILL.has(x)).join(" ");

// "A in B" as a recognizer writes it: "a in b", "a n b", "anb", "a and b" (from "A & B"), "a b". The letter said first is the one inside.
const LETTER: Record<string, "a" | "b"> = { a: "a", ay: "a", eh: "a", b: "b", be: "b", bee: "b" };
/** Which way three possibilities go, from the two letters said in any of the ways a recognizer writes "A in B". */
export function lettersDirection(w: string): "3ab" | "3ba" | null {
  const t = w.split(" ").filter((x) => x && !["the", "is", "being", "it"].includes(x));
  const fused = t.join("").match(/^(a|b)(?:n|in|an|and|inn|end)?(a|b)$/);
  if (fused && fused[1] !== fused[2]) return fused[1] === "a" ? "3ab" : "3ba";
  const LINK = /^(?:n|in|an|and|inn|end|inside|within|under)$/;
  const ls = t.length === 3 && LINK.test(t[1]) ? [t[0], t[2]] : t.length === 2 ? t : null;
  if (ls && LETTER[ls[0]] && LETTER[ls[1]] && LETTER[ls[0]] !== LETTER[ls[1]]) return LETTER[ls[0]] === "a" ? "3ab" : "3ba";
  return null;
}

// Relations said in words that need no term: what is written under "Mutually exclusive" and "Four possibilities".
function relationByPhrase(w: string): RelKey | null {
  const n = plain(w.split(" "));
  if (/\b(?:neither contains?|overlap\w*|partly|partially|intersect\w*)\b/.test(n)) return "4";
  if (/\bnothing (?:is|are|can be) both\b|\bno (?:one |thing )?(?:is|are|can be) both\b|\bnothing in common\b|\bnever together\b|\bdisjoint\b/.test(n)) return "con";
  return null;
}
// What is written under the options, with the pair's own terms: "All products are functional things, not the reverse" (three
// possibilities, the first-named term inside), "... and all functional things are products" (mutually inclusive).
const LINKS = "is|are|in|inside|within|under|to|belong|belongs|fall|falls|included|contained|covered|by|part|subset|contain|contains|include|includes|encompass|encompasses|cover|covers|pervade|pervades";
function relationByTerms(w: string, terms: PairTerms): RelKey | null {
  const { words, found } = mask(w, terms);
  if (!found) return null;
  const n = plain(words);
  if (/\bno (t[ab]) (?:is|are|can be) (t[ab])\b/.test(n)) return "con";
  const tail3 = (rest: string) => /\b(?:not|no|never)\b.*\b(?:reverse|vice versa|converse|conversely|other way|opposite|round|backwards?)\b|\bnot t[ab]\b/.test(rest);
  const m = n.match(new RegExp("\\b(t[ab])((?: (?:" + LINKS + "))*) (t[ab])\\b(.*)$"));
  if (m && m[1] !== m[3]) {
    const [, x, link, y, rest] = m;
    const inner = /\b(?:contains?|includes?|encompass(?:es)?|covers?|pervades?)\b/.test(link) ? y : x;
    const back = /\b(t[ab])(?: (?:is|are|in|inside|within|under))+ (t[ab])\b/.exec(rest);
    const mutual = !tail3(rest) && (/\b(?:vice versa|both ways|each other|conversely|reverse|equal|same)\b/.test(rest) || (!!back && back[1] !== back[2]));
    return mutual ? "mi" : inner === "ta" ? "3ab" : "3ba";
  }
  // only one term was recognized: with "not the reverse", the term said first is the one inside
  if (found === 1 && tail3(n)) {
    const which = /\bta\b/.test(n) ? "ta" : "tb", first = n.split(" ").findIndex((x) => x === which) <= 1;
    return first === (which === "ta") ? "3ab" : "3ba";
  }
  return null;
}

/**
 * The relation named. `order` is the page's order of the options (keys 1 to 5), so "one", "two" and "five" pick by number like the
 * keys do; "three" alone names three possibilities and "four" four possibilities, as their names start so. "3" means three possibilities
 * with no direction: the page asks which way. "A in B", "B contains A" and
 * the like give the direction, with or without "three possibilities" before them. With the pair's `terms` it also
 * takes what is written under each option ("All products are functional things, not the reverse").
 */
export function spokenRelation(alts: readonly string[], order: readonly RelKey[], terms?: PairTerms): RelKey | "3" | null {
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
    const byWords = relationByPhrase(w) || (terms ? relationByTerms(w, terms) : null);
    if (byWords) return byWords;
    const inner = w.match(/\b(a|b) (?:is )?(?:in|inside|within|under|included in|contained in|part of) (a|b)\b/);
    if (inner && inner[1] !== inner[2]) return inner[1] === "a" ? "3ab" : "3ba";
    const outer = w.match(/\b(a|b) (?:contains|includes|encompasses|covers|pervades) (a|b)\b/);
    if (outer && outer[1] !== outer[2]) return outer[1] === "b" ? "3ab" : "3ba";
    if (/\binclusive\b/.test(w)) return "mi";
    if (/\bexclusive\b/.test(w)) return "con";
    if (/\b(four|for) possibilit/.test(w)) return "4";
    const three = w.match(/\bthree possibilit\w*(.*)$/);
    if (three) {
      const way = lettersDirection(three[1].trim());
      if (way) return way;
      vague = true;
      continue;
    }
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

/**
 * After "three possibilities": which of the two is inside the other. Said as the term that is inside ("products"), as
 * "first" or "second" (the order the pair was read in), as the two letters in any of the ways a recognizer writes
 * "A in B", or as the whole phrase ("all products are functional things, not the reverse").
 */
export function spokenDirection(alts: readonly string[], terms?: PairTerms): "3ab" | "3ba" | null {
  for (const heard of alts) {
    const w = plainWords(heard).replace(/\bbeing a\b/g, "b in a");
    const whole = terms ? relationByTerms(w, terms) : null;
    if (whole === "3ab" || whole === "3ba") return whole;
    const way = lettersDirection(w.replace(/^(?:three possibilit\w*\s*)/, ""));
    if (way) return way;
    const ord = w.match(/\b(first|second)\b(?:.*\b(first|second)\b)?/);
    if (ord) {
      const inside = ord[2] && /\b(?:contains?|includes?|covers?)\b/.test(w) ? ord[2] : ord[1];
      return inside === "first" ? "3ab" : "3ba";
    }
    if (terms) {
      const { words, found } = mask(w, terms);
      const n = plain(words);
      const one = found === 1 && n.match(/^(?:it is |its )?(t[ab])(?: (?:is|are))?(?: (?:in|inside|within|under))?$/);
      if (one) return one[1] === "ta" ? "3ab" : "3ba";
    }
  }
  return null;
}

// ---- yes or no to an answer that waits to be confirmed ----

const YES = /^(?:yes|yeah|yep|yup|ok|okay|sure|confirm|confirmed|correct|right|that is right|thats right|that is correct|thats correct|go on|go ahead|next|continue|do it|good|fine|exactly)$/;
const NO = /^(?:no|nope|wrong|incorrect|cancel|change|change it|back|undo|again|try again|redo|not that|that is wrong|thats wrong|stop|wait)$/;
/** "yes" to go on with the answer that is waiting, "no" to take it back; null when the words are neither (they may be a new answer). */
export function spokenConfirm(alts: readonly string[]): "yes" | "no" | null {
  for (const heard of alts) {
    const w = plainWords(heard);
    if (YES.test(w)) return "yes";
    if (NO.test(w)) return "no";
  }
  return null;
}

// ---- commands of the run ----

/** What can be said at any time in Hands-free besides an answer: the question again, setting the pair aside, going on from a result, asking Claude to explain it, pausing the run. */
export type Command = "repeat" | "skip" | "next" | "explain" | "pause";
const THING = "(?:pair|question|one|thing|set|syllogism|example|relation|category|categories|case)";
// Whole utterances only, so that an answer that contains one of these words ("a crowd again") is still an answer.
const COMMANDS: [RegExp, Command][] = [
  [/^(?:repeat|repeat that|repeat it|repeat the question|say it again|say that again|read it again|read that again|read the question again|ask again|ask me again|one more time|once more|again)$/, "repeat"],
  [/^(?:next|next one|next pair|next question|next thing|next set|next relation|next syllogism|go on|go ahead|continue|move on|keep going|carry on)$/, "next"],
  [/^(?:explain|explain it|explain that|explain this|explain please|an explanation|check and explain|why|why is that|why was that|tell me why)$/, "explain"],
  [/^(?:pause|pause it|pause the run|stop|stop it|stop listening|hold on|wait a moment|wait a minute|that is enough|enough)$/, "pause"],
];
// "skip it" and the like say it of whatever is on screen; "skip this pair" names the thing, which no screen takes as an answer
const SKIP_LOOSE = /^(?:skip it|skip this|skip that|set it aside|set this aside)$/;
const SKIP_NAMED = new RegExp("^(?:skip this " + THING + "|skip the " + THING + "|set this " + THING + " aside)$");
// where "skip" answers the question on screen, "this example" or "this question" is the answer too: only the whole thing set aside is the command
const SKIP_WHOLE = /^(?:skip (?:this|the) (?:pair|syllogism|set)|set this (?:pair|syllogism|set) aside)$/;
/**
 * The command the whole utterance is, or null ("please" before or after is dropped). A bare "skip" is the command only where the screen does not take it as an answer (`bareSkip`),
 * and so are "skip it" and "skip this" (`looseSkip`, which is on unless the screen says otherwise): the counter-example of a syllogism can be skipped, which is an answer there.
 */
export function spokenCommand(alts: readonly string[], opts: { bareSkip?: boolean; looseSkip?: boolean } = {}): Command | null {
  const loose = opts.looseSkip !== false;
  for (const heard of alts) {
    const w = plainWords(heard).replace(/^please /, "").replace(/ please$/, "");
    if (opts.bareSkip && w === "skip") return "skip";
    if (loose ? SKIP_LOOSE.test(w) || SKIP_NAMED.test(w) : SKIP_WHOLE.test(w)) return "skip";
    for (const [re, c] of COMMANDS) if (re.test(w)) return c;
  }
  return null;
}

// ---- "I don't know" ----

// The whole utterance says the person has no answer ("I don't know", "no idea", "not sure"), not an answer that contains those words.
const DONT_KNOW = /^(?:(?:well|hmm|um|uh|er|erm|so|honestly|sorry)\s+)*(?:i\s+)?(?:(?:really|honestly|just|still|simply)\s+)?(?:(?:do\s?not|dont|don\s?t)\s+know|dunno|(?:have\s+)?no\s+(?:idea|clue)|(?:am|im|m)\s+not\s+(?:sure|certain)|not\s+(?:sure|certain)|cannot\s+(?:say|tell)|cant\s+(?:say|tell)|give\s+up)(?:\s+(?:sorry|really|at\s+all|what\s+to\s+say|the\s+answer|that|this|about\s+that|about\s+this|yet|right\s+now|anymore))*$/;
/** True when the person says they do not know the answer; it is checked before the words are read as an answer ("no idea" starts with "no"). */
export function spokenDontKnow(alts: readonly string[]): boolean {
  return alts.some((heard) => DONT_KNOW.test(plainWords(heard)));
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

// ---- Syllogisms: the three replies, and the counter-example after "there is no pervasion" ----

export type SylReply = "accept" | "reason" | "pervasion";
const SYL_WORDS: [string, SylReply][] = [["i accept", "accept"], ["the reason is not established", "reason"], ["there is no pervasion", "pervasion"]];
/**
 * The reply to a syllogism. `order` is the page's order of the three (keys 1 to 3), so "one", "two" and "three" pick by number as the keys do. Anything with
 * "pervasion" in it is the pervasion (a recognizer often writes "persuasion"); "reason" or "not established" is the reason; "accept", "agree" or "yes" at the start
 * is accepting; the rest is matched against the three sentences as they are on the screen.
 */
export function spokenSyllogism(alts: readonly string[], order: readonly SylReply[]): SylReply | null {
  for (const heard of alts) {
    const w = plainWords(heard).replace(/\bpers?uasi(?:on|ve)\b/g, "pervasion");
    const num = w.match(/^(?:number |option |key |reply )?(one|two|three)$/);
    if (num) return order[["one", "two", "three"].indexOf(num[1])] || null;
    if (/\bperva\w*/.test(w)) return "pervasion";
    if (/^(?:i )?(?:accept|accepted|except|agree|agreed|yes|yeah|yep)\b/.test(w)) return "accept";
    if (/\breasons?\b|\bnot established\b|\bunestablished\b|\bs is not r\b|\bthe subject is not\b/.test(w)) return "reason";
  }
  let best: [number, SylReply | null] = [0, null];
  for (const heard of alts) for (const [name, k] of SYL_WORDS) {
    const s = similarity(plainWords(heard), name);
    if (s > best[0]) best = [s, k];
  }
  return best[0] >= 0.75 ? best[1] : null;
}
const NO_COUNTER = /^(?:no|nope|(?:no |nope )?(?:nothing|none)|no counter ?examples?|there (?:is|are) (?:none|no counter ?examples?)|there (?:isnt|arent) (?:one|any)|not that i know of|without (?:a )?counter ?examples?|no example|skip(?: it| this)?|leave it (?:out|empty|blank)|leave (?:it )?out|i have (?:none|no counter ?examples?))$/;
/** The counter-example after "there is no pervasion": a thing, or the words that leave it out ("skip", "no counter-example", "nothing"), which come back as `none`. */
export function spokenCounter(ix: DataIndex, alts: readonly string[]): SpokenExample | null {
  const none = alts.find((heard) => NO_COUNTER.test(plainWords(heard)));
  if (none) return { text: "", item: null, none: true, heard: none };
  return spokenExample(ix, alts);
}

// ---- Find an instance: a thing, or that nothing is all of the categories ----

const NOTHING = /^(?:no |nope |there (?:is|are) |theres )?(?:no such thing|nothing|none|no one|no thing|nobody|there (?:isnt|arent|is not|are not) (?:one|any)|no|nope)(?: (?:is|can be|exists?))?(?: (?:both|all|all three|all of them|one of them|those|that))?(?: of them)?$/;
/** A thing for "name something that is …", or "nothing" (also "nothing is both", "there is none"), which comes back as `none`. */
export function spokenThing(ix: DataIndex, alts: readonly string[]): SpokenExample | null {
  const none = alts.find((heard) => NOTHING.test(plainWords(heard)));
  if (none) return { text: "", item: null, none: true, heard: none };
  return spokenExample(ix, alts);
}

// ---- Find a pair: two phenomena, said as "wood and fire" ----

export interface SpokenPair {
  /** the first and the second phenomenon, as the page takes them in its two fields */
  a: string;
  b: string;
  /** the guess it was read from */
  heard: string;
}
const JOIN = /\s+(?:and|&|with|versus|vs|or)\s+/gi;
/**
 * Two phenomena said in one breath: "wood and fire", "a pot and a pan". Where "and" comes more than once the split that leaves a practice item on each side wins, else the first.
 * Null when there is no "and" to split at, or a side is empty.
 */
export function spokenPair(ix: DataIndex, alts: readonly string[]): SpokenPair | null {
  let best: { score: number; pair: SpokenPair } | null = null;
  for (const heard of alts) {
    const text = String(heard).trim().replace(/[.!?]+$/, "").replace(/^(?:both|between|the pair|name|say)\s+/i, "");
    const cuts = [...text.matchAll(JOIN)];
    for (const m of cuts) {
      const i = m.index!, left = text.slice(0, i).trim(), right = text.slice(i + m[0].length).trim();
      const x = left ? spokenExample(ix, [left]) : null, y = right ? spokenExample(ix, [right]) : null;
      if (!x || !y || x.none || y.none || !x.text || !y.text) continue;
      const score = (x.item ? 1 : 0) + (y.item ? 1 : 0);
      if (!best || score > best.score) best = { score, pair: { a: x.text, b: y.text, heard } };
    }
    if (best && best.score === 2) break;
  }
  return best ? best.pair : null;
}

// ---- Categories: which of the categories the thing is in, and yes or no to one ----

const NO_CATS = /^(?:none|none of (?:these|them|those)|nothing|no categor(?:y|ies)|not any|neither)$/;
const ALL_CATS = /^(?:all|all of (?:these|them|those)|all categories|everything)$/;
const CAT_STOP = new Set(["a", "an", "the", "of", "is", "are", "made", "and", "in", "its", "it", "also", "both"]);
const catTokens = (s: string) => plainWords(s).split(" ").filter((x) => x && !CAT_STOP.has(x));
// "impermanent" is not "permanent", though the two are close as strings
const NEGATING = ["im", "in", "un", "non", "dis"];
const opposite = (a: string, b: string) => NEGATING.some((p) => (a === p + b && b.length >= 4) || (b === p + a && a.length >= 4));
const sameWord = (heard: string, word: string) => !opposite(singular(heard), singular(word)) && (similarity(singular(heard), singular(word)) >= 0.8 || (word.length >= 4 && heard.length >= 4 && (heard.startsWith(word) || word.startsWith(heard))));
// the categories it IS in are asked for: a guess that says what it is not is not read as the categories it names ("non-functional", "not a color"). Only a negation the
// rows did not take counts: "non" in "a non-associated compositional factor" is a word of that row
const NEGATION = /^(?:not|non|no|never|without|isnt|arent|dont|doesnt|cant|cannot)$/;
/** The place of each word of `tokens` in `left`, taken one after another (a word said once is not two of a row's words), or null when one is missing. */
function takeTokens(tokens: readonly string[], left: readonly string[]): number[] | null {
  const work = left.slice(), at: number[] = [];
  for (const t of tokens) {
    const i = work.findIndex((x) => x && sameWord(x, t));
    if (i < 0) return null;
    work[i] = "";
    at.push(i);
  }
  return at;
}
export interface SpokenCategories {
  /** the categories said (ids), in the order of the rows */
  cats: string[];
  /** the guess it was read from */
  heard: string;
}
/**
 * The categories a thing is in, said as the page shows them ("a color and a shape"), by number ("one and three"), or as "none of these" / "all of them". The longer
 * phrases are looked for first, so "external form" does not also tick "form". Null when no guess names any category.
 */
export function spokenCategories(alts: readonly string[], rows: readonly { cat: string; phrase: string }[]): SpokenCategories | null {
  const byLength = rows.map((r) => ({ r, tokens: catTokens(r.phrase) })).filter((x) => x.tokens.length).sort((x, y) => y.tokens.length - x.tokens.length);
  for (const heard of alts) {
    const w = plainWords(heard).replace(/^(?:it is |its |it's |they are |that is |i think |the categories are )/, "");
    if (NO_CATS.test(w)) return { cats: [], heard };
    if (ALL_CATS.test(w)) return { cats: rows.map((r) => r.cat), heard };
    const NUM = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const words = w.split(" ").filter(Boolean);
    if (words.length && words.every((x) => NUM.includes(x) || x === "and" || x === "number" || x === "numbers")) {
      const picked = words.map((x) => NUM.indexOf(x)).filter((i) => i >= 0 && i < rows.length).map((i) => rows[i].cat);
      if (picked.length) return { cats: rows.map((r) => r.cat).filter((c) => picked.includes(c)), heard };
    }
    const left = words.slice(), found = new Set<string>();
    for (const { r, tokens } of byLength) {
      const at = takeTokens(tokens, left);
      if (at) { for (const i of at) left[i] = ""; found.add(r.cat); }
    }
    // a category of several words may be said by its one distinctive word ("permanent" for "a permanent phenomenon"), where no other category has a word like it;
    // not when a word left over is the opposite of one of its words ("impermanent phenomenon" is not "a permanent phenomenon")
    for (const { r, tokens } of byLength) {
      if (found.has(r.cat)) continue;
      if (left.some((x) => x && tokens.some((t) => opposite(singular(x), singular(t))))) continue;
      const i = left.findIndex((x) => x && tokens.some((t) => t.length >= 6 && sameWord(x, t) && !byLength.some((o) => o.r !== r && o.tokens.some((u) => sameWord(u, t)))));
      if (i >= 0) {
        left[i] = ""; found.add(r.cat);
        for (const t of tokens) if (NEGATION.test(t)) { const j = left.indexOf(t); if (j >= 0) left[j] = ""; }   // "non" of "non-associated", said as "associated" with it
      }
    }
    if (left.some((x) => NEGATION.test(x))) continue;
    if (found.size) return { cats: rows.map((r) => r.cat).filter((c) => found.has(c)), heard };
  }
  return null;
}

const SAY_YES = /^(?:(?:yes|yeah|yep|yup|sure|true|correct|right)(?: (?:it is|it does|its))?|it is|it does|that is so|affirmative)$/;
const SAY_NO = /^(?:(?:no|nope|nah)(?: (?:it is not|it isnt|it does not|it doesnt|its not))?|false|not|it is not|it isnt|it does not|it doesnt|its not|negative)$/;
/** Yes or no as an answer to "Is it …?" (not as a confirmation: "back", "undo" and the like are not here). */
export function spokenYesNo(alts: readonly string[]): "yes" | "no" | null {
  for (const heard of alts) {
    const w = plainWords(heard);
    if (SAY_YES.test(w)) return "yes";
    if (SAY_NO.test(w)) return "no";
  }
  return null;
}
