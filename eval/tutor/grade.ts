// The code grader of the tutor eval: reads the tutor's answer the way the page does (src/domain/verdict.ts) and compares every
// example's two facts with the case's labels; it also checks the form rules of the prompt that code can check. No model is called.
import { parseFactLine, parseRelationVerdict, placeFacts, fitOf } from "../../src/domain/verdict";
import type { Answer, FactLine } from "../../src/domain/verdict";
import { CELLS } from "../../src/ai-shared/relations";
import type { CellId } from "../../src/ai-shared/relations";
import { ix } from "./cases";
import type { Case, Want } from "./cases";

/** How one side came out: right; "wrong" (yes for no or no for yes); "hedged" (unsure where the label is definite); "overconfident" (definite where only unsure is right); "missing" (no line). */
export type SideMark = "right" | "wrong" | "hedged" | "overconfident" | "missing";
export interface ExampleGrade { cell: CellId; text: string; from: string; page: string; a: SideMark; b: SideMark; said: [Answer | null, Answer | null]; shown: [Answer | null, Answer | null]; fitRight: boolean | null }
export interface FormFlags { lines: number; doubled: CellId[]; reversal: boolean; markdown: boolean; words: number; ownName: number; onlyInPervasion: boolean; noLocus: boolean; noPervasion: boolean; noRelation: boolean }
export interface Grade { examples: ExampleGrade[]; relation: "right" | "wrong" | "unsure" | "missing" | null; form: FormFlags }

const asList = (w: Want): readonly Answer[] => (Array.isArray(w) ? w : [w]) as readonly Answer[];
function mark(said: Answer | null, want: Want): SideMark {
  if (!said) return "missing";
  const ok = asList(want);
  if (ok.includes(said)) return "right";
  if (said === "unsure") return "hedged";
  return ok.includes("yes") || ok.includes("no") ? "wrong" : "overconfident";
}
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.toLowerCase().replace(/^(a|an|the) /, "").trim();

export function gradeReply(c: Case, text: string): Grade {
  const lines = text.split("\n");
  const byCell = new Map<CellId, FactLine[]>();
  for (const ln of lines) {
    const f = parseFactLine(ln);
    if (f) (byCell.get(f.cell) ?? byCell.set(f.cell, []).get(f.cell)!).push(f);
  }
  const d = { ix, p: c.pair, terms: { a: c.pair.a, b: c.pair.b } };
  const examples: ExampleGrade[] = c.examples.map((e) => {
    const f = byCell.get(e.cell)?.at(-1) ?? null;   // the last line for a cell is the one the page reads
    const said: [Answer | null, Answer | null] = f ? [f.a.answer, f.b.answer] : [null, null];
    const shown = f ? (placeFacts(f, d).answers as [Answer, Answer]) : ([null, null] as [null, null]);
    const want = e.want;
    if (!want) return { cell: e.cell, text: e.text, from: e.from, page: e.page, a: "missing", b: "missing", said, shown, fitRight: null };
    const fitWant = (a: Want, b: Want) => { const A = asList(a), B = asList(b); return A.length === 1 && B.length === 1 && A[0] !== "unsure" && B[0] !== "unsure" ? fitOf({ cell: e.cell, a: { answer: A[0], say: "" }, b: { answer: B[0], say: "" } }) : null; };
    const fw = fitWant(want.a, want.b);
    const fitRight = f && fw ? fitOf({ cell: e.cell, a: { answer: shown[0]!, say: "" }, b: { answer: shown[1]!, say: "" } }) === fw : null;
    return { cell: e.cell, text: e.text, from: e.from, page: e.page, a: mark(said[0], want.a), b: mark(said[1], want.b), said, shown, fitRight };
  });
  let relation: Grade["relation"] = null;
  if (c.asked && c.pair.own) {
    const v = parseRelationVerdict(text, c.asked);
    relation = !v ? "missing" : v.answer === "unsure" ? "unsure" : c.relation == null ? null : (v.answer === "yes") === (c.relation === c.asked) ? "right" : "wrong";
  }
  const factLines = lines.filter((l) => parseFactLine(l));
  const ownName = c.examples.filter((e) => {
    const f = byCell.get(e.cell)?.at(-1);
    if (!f) return false;
    const n = norm(e.text);
    return [f.a.say, f.b.say].some((s) => n.length > 3 && norm(s.replace(/^it is /i, "")) === n);
  }).length;
  const form: FormFlags = {
    lines: factLines.length,
    doubled: CELLS.filter((cl) => (byCell.get(cl)?.length ?? 0) > 1),
    reversal: /\b(wait|actually)\b/i.test(text),
    markdown: /\*\*|^#+ /m.test(text),
    words: words(text),
    ownName,
    onlyInPervasion: factLines.some((l) => /pervasion:[^|]*\bonly\b/i.test(l)),
    noLocus: c.mode !== "debate" && !(c.pair.own) && !/^\s*common locus\s*:/im.test(text),
    noPervasion: !/^\s*pervasion\s*:/im.test(text),
    noRelation: (c.mode === "debate" || !!c.pair.own) && !/^\s*relation\s*:/im.test(text),
  };
  return { examples, relation, form };
}
