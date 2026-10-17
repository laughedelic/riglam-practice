// Where the check lab (Quorum) is divided about an example the learner wrote: the models gave different cells, or the cell they agree
// on (or the judge ruled) cannot stand beside the page's own verdict. These are the cases worth a flag, which the page writes by itself.
import { CELL_NAME } from "../ai-shared/prompts";
import type { CellId } from "../ai-shared/relations";

/** An example the learner wrote: the cells it stood in, and what the page said of it there ("ok" fits, "bad" does not fit, "cmp" not checked). */
export interface QuorumThing {
  text: string;
  cells: CellId[];
  page: Partial<Record<CellId, string>>;
}
/** One model's cell for every example, in the order of the examples. */
export interface QuorumAnswer {
  name: string;
  cells: CellId[];
}
export interface Dispute {
  /** the example, by its place in the answer */
  index: number;
  /** "models": the models gave different cells; "page": the ruling and the page's verdict on the learner's cell cannot both be right */
  kinds: ("models" | "page")[];
  /** the judge's cell, else the one cell every model gave, else null */
  ruling: CellId | null;
  models: { name: string; cell: CellId }[];
  judge: CellId | null;
}

/** Whether the page's verdict on a cell contradicts the ruling: it says the example fits where the ruling puts it elsewhere, or does not fit where the ruling puts it. */
const contradicts = (page: string | undefined, cell: CellId, ruling: CellId) => (page === "ok" && cell !== ruling) || (page === "bad" && cell === ruling);

/**
 * The examples of an answer on which Quorum is divided. `models` are the runs that counted (a run that failed or came from another model is left out),
 * `judge` the judge's cell for every example when it ruled. With fewer than two runs nothing is disputed. A cell the page did not check ("cmp") says nothing,
 * so an example the page could not classify is disputed only if the models differ among themselves.
 */
export function quorumDisputes(things: QuorumThing[], models: QuorumAnswer[], judge: CellId[] | null): Dispute[] {
  if (models.length < 2) return [];
  const out: Dispute[] = [];
  things.forEach((t, i) => {
    const cells = models.map((m) => m.cells[i]);
    const differ = new Set(cells).size > 1;
    const ruling = judge?.[i] ?? (differ ? null : cells[0]);
    const kinds: Dispute["kinds"] = [];
    if (differ) kinds.push("models");
    if (ruling && t.cells.some((c) => contradicts(t.page[c], c, ruling))) kinds.push("page");
    if (kinds.length) out.push({ index: i, kinds, ruling, models: models.map((m) => ({ name: m.name, cell: m.cells[i] })), judge: judge?.[i] ?? null });
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
