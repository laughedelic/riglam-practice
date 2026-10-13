// Claude's verdicts on examples the page could not classify. The tutor answers an "explain" request with one line per
// cell, ending in "=> yes", "=> no" or "=> unsure"; the lines are read here and settle the cells still marked "cmp".
import { refOf } from "../ai-shared/relations";
import type { CellId, PairLike } from "../ai-shared/relations";
import { summarize } from "./grading";
import type { GradeResult } from "./types";

/** The end of a verdict line, which the page hides when it shows the tutor's answer. */
export const VERDICT_RE = /\s*=>\s*(yes|no|unsure)\W*$/i;
/** The names a verdict line may use for a cell: the cell's own name or the number of the debate question. */
export const NAME_CELL: Record<string, CellId> = { both: "both", "a not b": "anb", "b not a": "bna", neither: "nei", q1: "both", q2: "anb", q3: "bna", q4: "nei" };

export type Answer = "yes" | "no" | "unsure";
export interface CellVerdict {
  cell: CellId;
  answer: Answer;
}

/** The verdicts in the tutor's text, in order. Lines that do not have the form `<cell>: <example> => yes|no|unsure` are ignored, also when bulleted or in bold. */
export function parseVerdicts(text: string | null | undefined): CellVerdict[] {
  const out: CellVerdict[] = [];
  for (const ln of (text || "").split("\n")) {
    const m = ln.replace(/^[-•*\s]+/, "").replace(/\*\*/g, "").match(/^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.*?)\s*=>\s*(yes|no|unsure)\W*$/i);
    if (!m) continue;
    out.push({ cell: NAME_CELL[m[1].toLowerCase()], answer: m[3].toLowerCase() as Answer });
  }
  return out;
}

/**
 * Settles the cells that are still open ("cmp") with the verdicts, in order, and counts the result again. Changes
 * `res` in place. Returns how many cells a verdict settled (an "unsure" counts: it closes the question, not the cell).
 */
export function applyVerdicts(p: PairLike, res: GradeResult, verdicts: readonly CellVerdict[]): number {
  let n = 0;
  for (const { cell: c, answer: ok } of verdicts) {
    const r = res.cells[c];
    if (!r || r.v !== "cmp") continue;
    const ref = refOf(p, c);
    r.v = ok === "yes" ? "ok" : ok === "no" ? "bad" : "cmp"; r.uns = ok === "unsure"; r.by = "claude"; n++;
    r.msg = ok === "yes" ? ["Verified", "", "by Claude"] : ok === "no" ? ["Does not fit", ref ? ". Example: " + ref + "." : "", "by Claude"] : ["Unsure. ", "Claude could not settle it; see below." + (ref ? " Reference: " + ref + "." : "")];
  }
  summarize(res);
  return n;
}
