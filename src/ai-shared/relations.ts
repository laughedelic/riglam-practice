// The five relations of two phenomena and the four cells of the grid (both, A not B, B not A, neither).

export type RelKey = "mi" | "con" | "3ab" | "3ba" | "4";
export type CellId = "both" | "anb" | "bna" | "nei";

export interface Relation {
  code: string;
  name: string;
  gloss: (a: string, b: string) => string;
  /** the page's notations: set notation and logic notation */
  sets: string[];
  logic: string[];
  /** cells that are empty when this relation holds */
  empty: CellId[];
}

export const REL: Record<RelKey, Relation> = {
  mi:   {code:"MI", name:"Mutually inclusive", gloss:(a,b)=>"All "+a+" are "+b+", and all "+b+" are "+a, sets:["=","",""], logic:["⇔","",""], empty:["anb","bna"]},
  con:  {code:"MX", name:"Mutually exclusive", gloss:()=>"Nothing is both", sets:["∩","","= ∅"], logic:["⇒","¬",""], empty:["both"]},
  "3ab":{code:"3P", name:"Three possibilities, A in B", gloss:(a,b)=>"All "+a+" are "+b+", not the reverse", sets:["⊂","",""], logic:["⇒","",""], empty:["anb"]},
  "3ba":{code:"3P", name:"Three possibilities, B in A", gloss:(a,b)=>"All "+b+" are "+a+", not the reverse", sets:["⊃","",""], logic:["⇐","",""], empty:["bna"]},
  // No relation says anything about the neither cell. With a negated side it can be empty (a negation takes in what does not exist), which the learner
  // says in that cell: Perdue 2014 (after Kensur Yeshi Thupten) calls such a pair "four possibilities without neither", Perdue 1992 (after Lati Rinpoche)
  // "three possibilities without there being something which is neither".
  "4":  {code:"4P", name:"Four possibilities", gloss:()=>"They overlap; neither contains the other", sets:["∩","","≠ ∅"], logic:["⇏","¬",""], empty:[]}
};
export const CELLS: readonly CellId[] = ["both", "anb", "bna", "nei"];

/** What a pair offers as an example in a cell (`ex`) and why a cell is empty (`why`). Old saved pairs may lack both. */
export interface PairLike {
  a: string;
  b: string;
  catA?: string | null;
  catB?: string | null;
  typeA?: string;
  typeB?: string;
  relation: RelKey;
  ex?: Partial<Record<CellId, string | null>>;
  why?: Partial<Record<CellId, string>>;
  note?: string;
  /** a pair the learner made up in the pair-finding mode that the practice data cannot judge: `relation` is only the one asked for, and `ex` and `why` are empty */
  own?: boolean;
  /** a pair with a negated side: B, A or both are the negation of their category, "non-(wooden things)"; `catA` and `catB` stay the categories themselves */
  neg?: Neg;
}

/** Which side of a pair is negated: B alone, A and B, or A alone (the negation track draws all three, and Find a pair takes them as named). */
export type Neg = "b" | "ab" | "a";
/**
 * Where a thing goes when a side is negated, by the cell it has in the plain pair: with B negated, what is both A and B is A but not non-B, and so on.
 * Each map is its own inverse, so it also takes a cell of the negated pair back to the plain pair's.
 */
export const NEG_CELL: Record<Neg, Record<CellId, CellId>> = {
  b: { both: "anb", anb: "both", bna: "nei", nei: "bna" },
  ab: { both: "nei", anb: "bna", bna: "anb", nei: "both" },
  a: { both: "bna", anb: "nei", bna: "both", nei: "anb" },
};
/** Whether a value is one of the negations a pair can have (a stored or sent pair is checked with it). */
export const isNeg = (x: unknown): x is Neg => x === "b" || x === "ab" || x === "a";
/** Which of the two sides are negated, A then B. */
export const negSides = (p: Pick<PairLike, "neg">): readonly [boolean, boolean] => [p.neg === "ab" || p.neg === "a", p.neg === "ab" || p.neg === "b"];
/**
 * The negation of a label as the course book writes it: "non-products", and in brackets when it has more than one word, "non-(wooden things)". The brackets
 * say what the "non-" takes in, everything that is not a wooden thing; without them ("non-wooden things", `brackets` false) the words can also be read as
 * the things that are not wooden, which leaves out what does not exist.
 */
export const negLabel = (label: string, brackets = true): string => "non-" + (brackets && /\s/.test(label) ? "(" + label + ")" : label);
/** The label a negated label was made from. */
export const plainLabel = (label: string): string => label.replace(/^non-\((.*)\)$|^non-(.*)$/, (_, x, y) => x ?? y);

// A non-existent (the horn of a rabbit) is a possibility in the "neither" cell, as the class takes it, so that cell
// always has a reference even for old saved pairs that stored none. Perdue 1992:393 and 2014:1026.
// A pair of the learner's own (Find a pair) has no reference at all: nothing is known about what its two phenomena are, and a non-existent is not "neither" for every pair.
// Nor has a pair with a negated side: a negation takes in what does not exist, so a non-existent is in another cell (and the pair stores its own examples).
const RABBIT = "the horn of a rabbit";
export function refOf(p: PairLike, c: CellId): string | null {
  const k = p.ex && p.ex[c];
  return k || (c === "nei" && !p.own && !p.neg ? RABBIT : null);
}
export function cellLabel(c: CellId, p: PairLike): string {
  return {both: "both", anb: p.a + ", not " + p.b, bna: p.b + ", not " + p.a, nei: "neither"}[c];
}
