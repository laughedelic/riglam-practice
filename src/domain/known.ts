// Examples the page could not check (verdict "cmp") that can still be settled without the AI: by the reference examples a device holds
// (src/ai-shared/examples.ts, placed by their classes with `placeByClass`), or by what the server learned from earlier analyses (POST /api/known,
// worker/learned.ts). Both come as the tutor's own lines, so the page reads them as it reads the tutor's (`parseVerdicts`, `applyVerdicts`) and its
// notes take their steps from the term data in the same way. An example is settled when both its sides are known, and also when only one is and it
// already fails the cell (a "no" where the cell wants a yes, or the reverse): one failed part of the conjunction is enough to say it does not fit,
// whatever the other side is. Proving that it fits needs both, so half a fact never says "fits".
import { CELL_NAME } from "../ai-shared/prompts";
import { matchExamples } from "../ai-shared/examples";
import type { ExampleIndex } from "../ai-shared/examples";
import { pairCats } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId, PairLike } from "../ai-shared/relations";
import { knownClass } from "./ladder";
import { knownLine } from "./learned";
import { placeByClass } from "./reference";
import type { Placement } from "./reference";
import type { GradeResult } from "./types";
import { fitOf } from "./verdict";
import type { Answer } from "./verdict";

/** One example the page could not check, with the cell it stands in. */
export interface OpenExample {
  cell: CellId;
  text: string;
}

/**
 * The learner's examples still "cmp" in a checked answer, in the order of `things` (the examples with their cells), at most `max`. A pair of the learner's own
 * has none: the data cannot judge it. Nor has a pair with a negated side: what is known is said of the categories, so the tutor checks those examples.
 */
export function openExamples(p: PairLike, res: Pick<GradeResult, "cells">, things: readonly { text: string; cells: readonly CellId[] }[], max = 8): OpenExample[] {
  if (p.own || p.neg) return [];
  return things.flatMap((t) => t.cells.filter((c) => res.cells[c]?.v === "cmp" && !res.cells[c]?.vague).map((cell) => ({ cell, text: t.text }))).slice(0, max);
}

/** A line the page can read as the tutor's, for the example `text` in `cell`; `half` when only one of its two sides is in it (the other is "unsure"). */
export interface KnownLine {
  cell: CellId;
  text: string;
  line: string;
  half?: true;
}

/** The lines in the order the page applies them: the examples known on both sides first, then those that fail the cell on one side. */
export const wholeFirst = <T extends { half?: true }>(lines: readonly T[]): T[] => [...lines].sort((x, y) => Number(!!x.half) - Number(!!y.half));

/** Whether what is known of the two sides already fails the cell: the answer "no" in `fitOf`, which an "unsure" side cannot give by itself. */
export const failsCell = (cell: CellId, a: Answer, b: Answer): boolean => fitOf({ cell, a: { answer: a, say: "" }, b: { answer: b, say: "" } }) === "no";

/**
 * The lines the reference examples give for the open examples: an example the reference names, every reference example of that name placed the same way
 * on a side of the pair's two categories. Both sides placed: a whole line. One side placed, and it fails the cell: a half line. The class is the first of
 * the reference example's classes the term data has; the reasons are left to the term data's steps (`rung`), except for a thing that does not exist.
 */
export function referenceLines(ix: DataIndex, eix: ExampleIndex | null, p: PairLike, open: readonly OpenExample[]): KnownLine[] {
  if (!eix || p.own) return [];
  const cats = pairCats(ix, p);
  if (!cats[0] || !cats[1]) return [];
  const sides = [ix.CAT[cats[0]], ix.CAT[cats[1]]] as const;
  const out: KnownLine[] = [];
  for (const o of open) {
    const found = matchExamples(eix, o.text);
    if (!found.length) continue;
    const answers = sides.map((cat): Placement => {
      const got = new Set(found.map((ex) => (cat ? placeByClass(ix, ex, cat) : null)));
      return got.size === 1 && !got.has(null) ? [...got][0]! : null;
    });
    if (!answers[0] && !answers[1]) continue;
    const [a, b]: [Answer, Answer] = [answers[0] ?? "unsure", answers[1] ?? "unsure"];
    const half = !answers[0] || !answers[1];
    if (half && !failsCell(o.cell, a, b)) continue;
    const cls = found.flatMap((ex) => ex.cls ?? []).map((c) => knownClass(ix, c)).find(Boolean) ?? "";
    const reason = found.every((ex) => ex.ne) ? "it does not exist" : "";
    out.push({
      cell: o.cell,
      text: o.text,
      line: knownLine(CELL_NAME[o.cell], o.text, { answer: a, reason: answers[0] ? reason : "", cls }, { answer: b, reason: answers[1] ? reason : "", cls: "" }),
      ...(half ? { half: true as const } : {}),
    });
  }
  return wholeFirst(out);
}
