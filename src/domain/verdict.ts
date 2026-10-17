// Claude's verdicts on examples the page could not classify. The tutor answers an "explain" request with one line per
// cell, ending in "=> yes", "=> no" or "=> unsure"; the lines are read here and settle the cells still marked "cmp".
import { QCELL } from "../ai-shared/debate";
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

/**
 * The tutor's line for an example, in the form `<cell>: <example> | A yes: <sentence> | B no: <sentence>`: two small facts, whether the
 * example is A and whether it is B, each with a sentence saying why. The tutor writes no conclusion; the page draws it (`fitOf`).
 */
export interface Side { answer: Answer; say: string }
export interface FactLine { label: string; cell: CellId; example: string; a: Side; b: Side }

const FACT_RE = /^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.+?)\s*\|\s*A\s+(yes|no|unsure)\s*:\s*(.*?)\s*\|\s*B\s+(yes|no|unsure)\s*:\s*(.*)$/i;
const bare = (ln: string) => ln.replace(/^[-•*\s]+/, "").replace(/\*\*/g, "").trim();
const unquote = (s: string) => s.trim().replace(/^["“”']+|["“”']+$/g, "").trim();
/** What a cell takes: in A, in B. */
const PATTERN: Record<CellId, readonly [boolean, boolean]> = { both: [true, true], anb: [true, false], bna: [false, true], nei: [false, false] };

/** The line read as two facts, or null when it has another form (a plain note, an older `=> yes` line, anything else). */
export function parseFactLine(ln: string): FactLine | null {
  const m = bare(ln).match(FACT_RE);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const side = (answer: string, say: string): Side => ({ answer: answer.toLowerCase() as Answer, say: say.trim() });
  return { label: /^q/.test(key) ? key.toUpperCase() : m[1], cell: NAME_CELL[key], example: unquote(m[2]), a: side(m[3], m[4]), b: side(m[5], m[6]) };
}

/** Whether the example belongs in the cell: yes when both facts match the cell, no when either one contradicts it, else unsure. */
export function fitOf(f: Pick<FactLine, "cell" | "a" | "b">): Answer {
  const want = PATTERN[f.cell];
  const got = [f.a.answer, f.b.answer];
  if (got.some((g, i) => g !== "unsure" && (g === "yes") !== want[i])) return "no";
  return got.includes("unsure") ? "unsure" : "yes";
}

const sentence = (s: string) => { const t = s.trim().replace(/[.;,\s]+$/, ""); return t ? t[0].toUpperCase() + t.slice(1) + "." : ""; };
/**
 * The note the page shows for a line: the two sentences as the tutor wrote them and a conclusion drawn from the facts. `accepted` is
 * a debate question the learner accepted (or ran out of time on): the example is then the tutor's counter-example to it.
 */
export function factNote(f: FactLine, accepted: boolean): string {
  const fit = fitOf(f), why = [sentence(f.a.say), sentence(f.b.say)].filter(Boolean).join(" ");
  if (accepted) {
    const q = "Q" + (QCELL.indexOf(f.cell) + 1);
    if (fit === "yes") return `You accepted ${q}, but there is a counter-example: ${f.example}. ${why}`.trim();
    return `${f.example}. ${why} ${fit === "no" ? `It does not fit the cell of ${q}, so it is not a counter-example.` : "Claude is unsure whether it is a counter-example."}`.trim();
  }
  return `"${f.example}". ${why} ${fit === "yes" ? "So it fits." : fit === "no" ? "So it does not fit." : "Claude is unsure whether it fits."}`.trim();
}

/** The verdicts in the tutor's text, in order. A line with the two facts gives the verdict its facts give; otherwise a line of the form `<cell>: <example> => yes|no|unsure` does. Other lines are ignored, also when bulleted or in bold. */
export function parseVerdicts(text: string | null | undefined): CellVerdict[] {
  const out: CellVerdict[] = [];
  for (const ln of (text || "").split("\n")) {
    const f = parseFactLine(ln);
    if (f) { out.push({ cell: f.cell, answer: fitOf(f) }); continue; }
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
