// Finding the Dudra terms a text names, so that a page can mark them: the tutor's notes underline them and show the
// definition in place. A pure function of the term data and the text, like the matching of a learner's words in lookup.ts.
import type { DrillData } from "./data";
import type { DataIndex } from "./lookup";

/** A term named in a text: the characters from `start` up to `end` name `term`, a key of `DrillData.terms`. */
export interface Mention {
  start: number;
  end: number;
  term: string;
}

// Names and aliases that are everyday words as often as they are terms ("one of them", "the reason", "by definition",
// "for instance", "keep in mind"), so a text that uses them is not taken to name the term. Longer names that contain
// them (one entity, direct cause, phenomenon source, primary mind) still count.
const EVERYDAY = new Set([
  "one", "different", "related", "present", "past", "future", "clear", "clarity", "object", "reason", "sign", "condition",
  "instance", "definition", "cause", "effect", "source", "feeling", "accept", "i accept", "i accept it", "consequence",
  "negative", "subject", "thing", "mind", "composed", "fire", "water", "earth", "wind", "air", "different from", "one with",
  "not established",
]);
// mass nouns: "it matters" is not about matter
const NO_PLURAL = new Set(["matter"]);

/** Lower case, with hyphens as spaces: "Non-existent" and "non existent" are one form. */
const formOf = (s: string): string => s.toLowerCase().replace(/[-\s]+/g, " ").trim();

// The plural takes the head noun, before "of", "which" and the like: "objects of knowledge", "tangible objects which ...".
const AFTER_HEAD = / (?:of|which|whose|arisen|produced|concordant) /;
function pluralWord(w: string): string {
  if (w === "phenomenon") return "phenomena";
  if (/(?:s|x|z|ch|sh)$/.test(w)) return w + "es";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  return w + "s";
}
function pluralOf(form: string): string {
  const m = AFTER_HEAD.exec(form), head = m ? form.slice(0, m.index) : form, tail = m ? form.slice(m.index) : "";
  return head.replace(/\S+$/, pluralWord) + tail;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Matcher {
  re: RegExp;
  /** form -> term */
  terms: Map<string, string>;
}
// The matcher depends only on the names and aliases, so one is kept per data object.
const matchers = new WeakMap<DrillData, Matcher>();
function matcherFor(data: DrillData): Matcher {
  const known = matchers.get(data);
  if (known) return known;
  const terms = new Map<string, string>();
  const add = (form: string, term: string) => { if (form && !terms.has(form)) terms.set(form, term); };
  for (const [key, t] of Object.entries(data.terms)) {
    for (const name of [t.name || key, ...(t.aliases || [])]) {
      const f = formOf(name);
      if (!f || EVERYDAY.has(f)) continue;
      add(f, key);
      if (!NO_PLURAL.has(f)) add(pluralOf(f), key);
    }
  }
  // longest first, so that "external form" wins over "form"; a hyphen and a space are interchangeable
  const forms = [...terms.keys()].sort((a, b) => b.length - a.length).map((f) => f.split(" ").map(escape).join("[-\\s]+"));
  const re = new RegExp("(?<![\\w-])(?:" + (forms.join("|") || "(?!)") + ")(?![\\w-])", "gi");
  const m = { re, terms };
  matchers.set(data, m);
  return m;
}

/**
 * The terms a text names, in order and not overlapping. Words in quotation marks are left out: in the tutor's notes they are
 * the learner's example ("the sound of a drum"), not the tutor's terms. A text that quotes terms on purpose, such as the page's
 * own note on a pair ("form" and "matter" pick out ...), asks for them with `quoted`.
 */
export function termMentions(ix: DataIndex, text: string, opts: { quoted?: boolean } = {}): Mention[] {
  if (!ix.DATA || !ix.DATA.terms || !text) return [];
  const { re, terms } = matcherFor(ix.DATA);
  const quoted: [number, number][] = [];
  for (const q of text.matchAll(/"[^"\n]*"|“[^”\n]*”/g)) quoted.push([q.index, q.index + q[0].length]);
  const out: Mention[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index, end = start + m[0].length, term = terms.get(formOf(m[0]));
    if (term && (opts.quoted || !quoted.some(([a, b]) => start < b && end > a))) out.push({ start, end, term });
  }
  return out;
}

/**
 * Whether the whole text is a name, alias or plural of the term. Unlike `termMentions` it does not skip everyday words: the
 * caller knows the text stands for a term (the label of a category), and asks only whether it is worded as the term is.
 */
export function namesTerm(ix: DataIndex, term: string, text: string): boolean {
  const t = ix.DATA && ix.DATA.terms && ix.DATA.terms[term];
  if (!t || !text) return false;
  const f = formOf(text);
  return [t.name || term, ...(t.aliases || [])].some((n) => {
    const g = formOf(n);
    return !!g && (g === f || (!NO_PLURAL.has(g) && pluralOf(g) === f));
  });
}
