// A learner's flag on something Claude said, read as a record of the practice: which stored answer it was made on, and
// what it is on, in words. The page lists flags with their exercise in Review; whoever reviews flags later (a person,
// or a model on a server) reads them the same way. Nothing here reads the page, storage or the network.
import { QCELL } from "../ai-shared/debate";
import { CELL_NAME } from "../ai-shared/prompts";
import type { CellId } from "../ai-shared/relations";

/** The fields of a stored flag that this module reads; the stored shape is `FlagDoc` in src/app/types.ts. */
export interface FlagRef {
  caseKey?: string;
  thing?: string;
  part?: string;
  model?: string;
  n?: string | null;
  pair?: { tab?: string } | null;
  state?: string;
}

export type AnswerCol = "answers" | "debates";

/**
 * The stored answer a flag was made on. A flag's case key is the collection and the id of the answer on screen
 * ("answers_r-mv9q", "debates_q-mv9q"); the check lab uses the same key. A key that names no collection gives null,
 * and an answer that was never saved is simply not found under the id.
 */
export function flagAnswerRef(f: FlagRef): { col: AnswerCol; id: string } | null {
  const m = /^(answers|debates)_(.+)$/.exec(f.caseKey || "");
  return m ? { col: m[1] as AnswerCol, id: m[2] } : null;
}

const isCell = (n: string): n is CellId => Object.prototype.hasOwnProperty.call(CELL_NAME, n);

/**
 * What the flag is on, in words: Claude's whole explanation, its note on one cell (a question in a debate) or on the
 * relation, or one answer in the chat. A part of the check lab is named by the example, the model and the part;
 * `modelName` turns a model id into its name.
 */
export function flaggedPart(f: FlagRef, modelName: (id: string) => string = (id) => id): string {
  const n = f.n == null ? "" : String(f.n);
  const debate = f.pair?.tab === "debate" || flagAnswerRef(f)?.col === "debates";
  if (f.part === "explain") {
    if (n === "rel") return "Claude’s note on the relation";
    if (isCell(n)) return "Claude’s note on " + (debate ? "Q" + (QCELL.indexOf(n) + 1) : CELL_NAME[n]);
    return "Claude’s explanation";
  }
  if (f.part === "chat") return "Claude’s answer in the chat";
  return [f.thing ? "“" + f.thing + "”" : "", f.model ? modelName(f.model) : "", f.part || ""].filter(Boolean).join(" · ");
}

/** A flag's state in words. "new" is every flag nobody has looked at yet. */
export function flagStateText(state: string | undefined): string {
  return state === "reviewed" ? "Reviewed" : state === "resolved" ? "Resolved" : "Not reviewed yet";
}

