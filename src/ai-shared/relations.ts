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
}

// A non-existent (the horn of a rabbit) is a possibility in the "neither" cell, as the class takes it, so that cell
// always has a reference even for old saved pairs that stored none. Perdue 1992:393 and 2014:1026.
const RABBIT = "the horn of a rabbit";
export function refOf(p: PairLike, c: CellId): string | null {
  const k = p.ex && p.ex[c];
  return k || (c === "nei" ? RABBIT : null);
}
export function cellLabel(c: CellId, p: PairLike): string {
  return {both: "both", anb: p.a + ", not " + p.b, bna: p.b + ", not " + p.a, nei: "neither"}[c];
}
