// The steps from an example's class to a term of the pair, from the term data: up the "is a" chain (the terms' parents) to
// the term, or up to a class the data marks as excluding a class the term is in (`contra`). A note on an example states
// these steps instead of the tutor's own, so a proof that goes up the chain says every step and an exclusion names both
// classes. Pure functions of the data, like the grading, which places a listed example by the same data.
import type { Cat, Item } from "../ai-shared/data";
import { matchItem, pairCats, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { PairLike } from "../ai-shared/relations";
import { FEATURE, inUniverse } from "./universe";

const PHRASE: Record<string, string> = { Permanent: "a permanent phenomenon", Existent: "an existent", Matter: "matter" };
/** A term's name as the questions say it, with its article: "an external form", "a permanent phenomenon". */
export function termPhrase(name: string): string {
  if (PHRASE[name]) return PHRASE[name];
  const w = name.toLowerCase();
  return (/^[aeiou]/.test(w) ? "an " : "a ") + w;
}
const bareOf = (name: string) => termPhrase(name).replace(/^(a|an) /, "");

// an everyday category says which of the three kinds of functional thing (or a person) its things are: "form: liquid substances"
const TOP: Record<string, string> = { form: "Form", person: "Person", consciousness: "Consciousness" };
/** The classes a category's things are in, lowest first: a Dudra category's term and its parents; for an everyday one, its kind and up. */
export function catChain(ix: DataIndex, cat: Cat): string[] {
  if (cat.kind === "dudra") return cat.term ? upChain(ix, cat.term) : [];
  const top = TOP[cat.type.split(":")[0].trim().toLowerCase()];
  return top ? upChain(ix, top) : [];
}

const excludes = (ix: DataIndex, x: string, y: string) => {
  const T = ix.DATA.terms;
  return (T[x].contra || []).includes(y) || (T[y].contra || []).includes(x);
};

/** What the data says about a side: the answer, the reason after "because", and the sentence under it ("" when none). */
export interface Rung { answer: "yes" | "no"; reason: string; why: string }

// The tutor's reason followed by the steps it does not already name: "it is a tree" + [External form, Form] gives
// "it is a tree, which is an external form, which is a form". A reason that is not a plain "it is a ..." gets "so it is".
function climb(said: string, links: readonly string[]): string {
  const low = said.toLowerCase();
  let from = 0;
  links.forEach((l, i) => { if (new RegExp(`\\b${bareOf(l)}s?\\b`).test(low)) from = i + 1; });
  const rest = links.slice(from);
  if (!said) return rest.length ? "it is " + rest.map(termPhrase).join(", which is ") : "";
  if (!rest.length) return said;
  const plain = from > 0 || /^it is (a|an) [\w' -]+$/.test(said);
  return said + (plain ? ", which is " : ", so it is ") + rest.map(termPhrase).join(", which is ");
}

/**
 * The steps for an example of the class `cls` and the category: yes with the steps up to the category's term; no with the steps up
 * to the class that excludes one the category is in, and under it why ("A sense power is an internal form, which is a form, and
 * nothing is both a consciousness and a form."); null when the data cannot tell (no such chain or exclusion, or the class is the
 * term itself, where the tutor's own reason says why). `subject` is the category's term as the note writes it ("a sense power").
 */
export function rung(ix: DataIndex, cls: string, cat: Cat, subject: string, said: string): Rung | null {
  const up = upChain(ix, cls), tc = catChain(ix, cat);
  if (!up.length || !tc.length) return null;
  if (cat.kind === "dudra" && cat.term) {
    const i = up.indexOf(cat.term);
    if (i > 0) return { answer: "yes", reason: climb(said, up.slice(0, i + 1)), why: "" };
    if (i === 0) return null;
  }
  for (const [i, x] of up.entries()) {
    const j = tc.findIndex((y) => excludes(ix, x, y));
    if (j < 0) continue;
    // the steps from the category's term up to the excluded class, without the term when the note already names it so
    const y = tc[j], own = tc.slice(0, j + 1).filter((t, k) => k > 0 || termPhrase(t) !== subject.toLowerCase());
    const lead = own.length ? subject[0].toUpperCase() + subject.slice(1) + " is " + own.map(termPhrase).join(", which is ") + ", and nothing" : "Nothing";
    return { answer: "no", reason: climb(said, up.slice(0, i + 1)), why: `${lead} is both ${termPhrase(x)} and ${termPhrase(y)}.` };
  }
  return null;
}

/** The example as a listed practice item for the pair, as the grading finds it (`judgeText`), or null. */
export function listedItem(ix: DataIndex, p: PairLike, example: string): Item | null {
  const [ca, cb] = pairCats(ix, p);
  if (!ca || !cb) return null;
  const it = matchItem(ix, example, FEATURE.has(ca) || FEATURE.has(cb));
  return it && inUniverse(ix, it, ca, cb) ? it : null;
}

/** A class name as the data spells it, or "" for one it does not have. */
export function knownClass(ix: DataIndex, name: string): string {
  const k = name.trim().toLowerCase().replace(/^(a|an|the) /, "");
  return Object.keys(ix.DATA.terms).find((t) => t.toLowerCase() === k) || "";
}
