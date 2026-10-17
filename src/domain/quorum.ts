// Quorum, the tutor's mode on a Preview: several models answer the same explain request. This reads what each answer says of each example
// (the fact lines of src/domain/verdict.ts), finds the examples the models are divided about, and says which of those are worth a flag.
import { norm } from "../ai-shared/lookup";
import { CELL_NAME } from "../ai-shared/prompts";
import type { CellId } from "../ai-shared/relations";
import { parseFactLine } from "./verdict";
import type { Answer } from "./verdict";

const CELL_OF: Record<string, CellId> = { "yes yes": "both", "yes no": "anb", "no yes": "bna", "no no": "nei" };

/** The cell an example belongs in, from the two facts an answer gives of it (is it A, is it B); null when either is unsure. */
export function cellOfFacts(a: Answer, b: Answer): CellId | null {
  return CELL_OF[a + " " + b] ?? null;
}

/** What one answer says of one example: the cell it belongs in (null when the answer is unsure), and the cell of the line it stands in. */
export interface Reading {
  /** the example as the answer quotes it */
  example: string;
  /** the cell the line is about: where the learner put the example, or the reference example's cell */
  line: CellId;
  cell: CellId | null;
  /** whether the example is A, and whether it is B, as the answer says */
  a: Answer;
  b: Answer;
}

/** The examples an answer classifies, in the order of its lines. A line of another form (a note, "Common locus: ...") is not one. */
export function readings(text: string): Reading[] {
  const out: Reading[] = [];
  for (const ln of (text || "").split("\n")) {
    const f = parseFactLine(ln);
    if (f) out.push({ example: f.example, line: f.cell, cell: cellOfFacts(f.a.answer, f.b.answer), a: f.a.answer, b: f.b.answer });
  }
  return out;
}

/** The cell an answer gives to an example: its first definite reading, else null (the answer is unsure, or does not mention the example). */
export function cellFor(rs: readonly Reading[], example: string): CellId | null {
  const k = norm(example);
  return rs.find((r) => norm(r.example) === k && r.cell)?.cell ?? null;
}

/** One example across the answers: where it stood, and the cell each answer gave it (null: unsure; missing: the answer did not mention it). */
export interface QuorumRow {
  example: string;
  /** the cells of the lines it stood in, without repeats */
  lines: CellId[];
  cells: Record<string, CellId | null>;
}

/** The examples of all the answers, in the order they first appear, with the cell each answer gave. `runs` are the answers that could be used. */
export function quorumRows(runs: readonly { name: string; text: string }[]): QuorumRow[] {
  const rows = new Map<string, QuorumRow>();
  for (const run of runs) {
    for (const r of readings(run.text)) {
      const k = norm(r.example);
      if (!k) continue;
      const row = rows.get(k) ?? { example: r.example, lines: [], cells: {} };
      rows.set(k, row);
      if (!row.lines.includes(r.line)) row.lines.push(r.line);
      if (!(run.name in row.cells) || (row.cells[run.name] === null && r.cell)) row.cells[run.name] = r.cell; // the first definite reading counts
    }
  }
  return [...rows.values()];
}

/** Whether the answers are divided about this example: at least two different definite cells. An answer that is unsure, or silent, does not divide them. */
export const divided = (row: Pick<QuorumRow, "cells">): boolean => new Set(Object.values(row.cells).filter(Boolean)).size > 1;

/** The examples of an answer (an explain request) the learner wrote or the page knows, with the cells they stood in and what the page said of each there ("ok" fits, "bad" does not fit, "cmp" not checked). */
export interface QuorumThing {
  text: string;
  cells: CellId[];
  page: Partial<Record<CellId, string>>;
}
/** One answer's cell for every example, in the order of the examples (null: unsure, or not mentioned). */
export interface QuorumAnswer {
  name: string;
  cells: (CellId | null)[];
}
export interface Dispute {
  /** the example, by its place in the answer */
  index: number;
  /** "models": the models gave different cells; "page": the ruling and the page's verdict on the learner's cell cannot both be right */
  kinds: ("models" | "page")[];
  /** the judge's cell, else the one cell every model gave, else null */
  ruling: CellId | null;
  /** the models that gave a cell for the example */
  models: { name: string; cell: CellId }[];
  judge: CellId | null;
}

/** Whether the page's verdict on a cell contradicts the ruling: it says the example fits where the ruling puts it elsewhere, or does not fit where the ruling puts it. */
const contradicts = (page: string | undefined, cell: CellId, ruling: CellId) => (page === "ok" && cell !== ruling) || (page === "bad" && cell === ruling);

/**
 * The examples of an answer on which Quorum is divided. `models` are the answers that counted (a call that failed is left out), `judge` the judge's cell for
 * every example when it ruled. With fewer than two answers nothing is disputed. A cell the page did not check ("cmp") says nothing, so an example the page could
 * not classify is disputed only if the models differ among themselves. An answer that is unsure about an example, or does not mention it, gives no cell.
 */
export function quorumDisputes(things: QuorumThing[], models: QuorumAnswer[], judge: (CellId | null)[] | null): Dispute[] {
  if (models.length < 2) return [];
  const out: Dispute[] = [];
  things.forEach((t, i) => {
    const votes = models.flatMap((m) => (m.cells[i] ? [{ name: m.name, cell: m.cells[i] as CellId }] : []));
    const cells = votes.map((v) => v.cell);
    const differ = new Set(cells).size > 1;
    const jc = judge?.[i] ?? null;
    const ruling = jc ?? (cells.length >= 2 && !differ ? cells[0] : null);
    const kinds: Dispute["kinds"] = [];
    if (differ) kinds.push("models");
    if (ruling && t.cells.some((c) => contradicts(t.page[c], c, ruling))) kinds.push("page");
    if (kinds.length) out.push({ index: i, kinds, ruling, models: votes, judge: jc });
  });
  return out;
}

const PAGE_SAYS: Record<string, string> = { ok: "fits", bad: "does not fit", cmp: "not checked" };

/** What a flag on a dispute shows: the cells the models and the judge gave, and where the learner put the example with the page's verdict there. At most 600 characters. */
export function disputeText(d: Dispute, t: QuorumThing): string {
  const lead = d.kinds.includes("models") ? "The models gave different cells." : "The models agree, but the page does not.";
  const models = "Models: " + d.models.map((m) => m.name + " " + CELL_NAME[m.cell]).join(", ") + ".";
  const judge = d.judge ? " Judge: " + CELL_NAME[d.judge] + "." : "";
  const you = " You put it in " + t.cells.map((c) => CELL_NAME[c] + " (the page: " + (PAGE_SAYS[t.page[c] ?? "cmp"] ?? t.page[c]) + ")").join(", ") + ".";
  return [lead, models + judge + you].join(" ").slice(0, 600);
}
