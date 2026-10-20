// Examples the page could not check (verdict "cmp") that can still be settled without the AI: by the reference examples a device holds
// (src/ai-shared/examples.ts, placed by their classes with `placeByClass`), or by what the server learned from earlier analyses (POST /api/known,
// worker/learned.ts). Both come as the tutor's own lines, so the page reads them as it reads the tutor's (`parseVerdicts`, `applyVerdicts`) and its
// notes take their steps from the term data in the same way. An example is settled only when both its sides are known: half an answer is left to the AI.
import { CELL_NAME } from "../ai-shared/prompts";
import { matchExamples } from "../ai-shared/examples";
import type { ExampleIndex } from "../ai-shared/examples";
import { pairCats } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId, PairLike } from "../ai-shared/relations";
import { knownClass } from "./ladder";
import { knownLine } from "./learned";
import { placeByClass } from "./reference";
import type { GradeResult } from "./types";

/** One example the page could not check, with the cell it stands in. */
export interface OpenExample {
  cell: CellId;
  text: string;
}

/** The learner's examples still "cmp" in a checked answer, in the order of `things` (the examples with their cells), at most `max`. A pair of the learner's own has none: the data cannot judge it. */
export function openExamples(p: PairLike, res: Pick<GradeResult, "cells">, things: readonly { text: string; cells: readonly CellId[] }[], max = 8): OpenExample[] {
  if (p.own) return [];
  return things.flatMap((t) => t.cells.filter((c) => res.cells[c]?.v === "cmp").map((cell) => ({ cell, text: t.text }))).slice(0, max);
}

/**
 * The lines the reference examples give for the open examples: an example the reference names, every reference example of that name placed the same way
 * on both of the pair's categories. The class is the first of the reference example's classes the term data has; the reasons are left to the term data's
 * steps (`rung`), except for a thing that does not exist.
 */
export function referenceLines(ix: DataIndex, eix: ExampleIndex | null, p: PairLike, open: readonly OpenExample[]): string[] {
  if (!eix || p.own) return [];
  const cats = pairCats(ix, p);
  if (!cats[0] || !cats[1]) return [];
  const sides = [ix.CAT[cats[0]], ix.CAT[cats[1]]] as const;
  const out: string[] = [];
  for (const o of open) {
    const found = matchExamples(eix, o.text);
    if (!found.length) continue;
    const answers = sides.map((cat) => {
      const got = new Set(found.map((ex) => (cat ? placeByClass(ix, ex, cat) : null)));
      return got.size === 1 && !got.has(null) ? [...got][0]! : null;
    });
    if (!answers[0] || !answers[1]) continue;
    const cls = found.flatMap((ex) => ex.cls ?? []).map((c) => knownClass(ix, c)).find(Boolean) ?? "";
    const reason = found.every((ex) => ex.ne) ? "it does not exist" : "";
    out.push(knownLine(CELL_NAME[o.cell], o.text, { answer: answers[0], reason, cls }, { answer: answers[1], reason, cls: "" }));
  }
  return out;
}
