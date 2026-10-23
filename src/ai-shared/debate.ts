// The four questions of the debate mode in their canonical wording (the page offers other wordings of the same
// questions; the saved data and the tutor card always use this one). Each question has one counter-example cell:
//   Q1 if it is A, it follows it is not B  -> a thing that is both
//   Q2 if it is A, it follows it is B      -> an A that is not B
//   Q3 if it is B, it follows it is A      -> a B that is not A
//   Q4 if it is not A, it follows it is B  -> a thing that is neither (plain form: a non-existent counts)
import type { CellId } from "./relations";

export const QCELL: readonly CellId[] = ["both", "anb", "bna", "nei"];

/** Marks the "not" in a question, which the page emphasises. */
export const NOT = { not: 1 } as const;
export type QToken = string | typeof NOT;
/** The questions as tokens, with "A" and "B" standing for the pair's own terms. */
export const QMINE: readonly (readonly QToken[])[] = [
  ["If it is ", "A", ", it follows it is ", NOT, " ", "B", "."],
  ["If it is ", "A", ", it follows it is ", "B", "."],
  ["If it is ", "B", ", it follows it is ", "A", "."],
  ["If it is ", NOT, " ", "A", ", it follows it is ", "B", "."],
];
/** Question `i` (0 to 3) in the concise form, "if it is A, it is not B" as A → not B: the tokens before and after the arrow ("A", "not B"). */
export const qSides = (i: number): [QToken[], QToken[]] => {
  const t = QMINE[i].filter((x) => x === NOT || x === "A" || x === "B"), at = t.findIndex((x) => x !== NOT);
  return [t.slice(0, at + 1), t.slice(at + 1)];
};
/** Question `i` (0 to 3) as one line of plain text with the letters A and B. */
export const qPlain = (i: number): string => QMINE[i].map((x) => (x === NOT ? "not" : x)).join("").replace(/\.$/, "?");
