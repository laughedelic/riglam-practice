// Claude's verdicts on examples the page could not classify. The tutor answers an "explain" request with one line per
// cell, ending in "=> yes", "=> no" or "=> unsure"; the lines are read here and settle the cells still marked "cmp".
import { QCELL } from "../ai-shared/debate";
import { pairCats } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { refOf } from "../ai-shared/relations";
import type { CellId, PairLike } from "../ai-shared/relations";
import { summarize } from "./grading";
import { knownClass, listedItem, rung } from "./ladder";
import { FEATURE } from "./universe";
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
 * The tutor's line for an example, in the form `<cell>: <example> | class: <term> | A yes: <reason> | B no: <reason>`: the
 * example's most specific class in the term data (optional), and two small facts, whether the example is A and whether it is B,
 * each with its reason. The tutor writes no conclusion; the page draws it (`fitOf`) and writes the consequences (`factNote`).
 */
export interface Side { answer: Answer; say: string }
export interface FactLine { label: string; cell: CellId; example: string; cls: string; a: Side; b: Side }

const FACT_RE = /^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.+?)\s*(?:\|\s*class\s*:\s*([^|]*?)\s*)?\|\s*A\s+(yes|no|unsure)\s*:\s*(.*?)\s*\|\s*B\s+(yes|no|unsure)\s*:\s*(.*)$/i;
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
  return { label: /^q/.test(key) ? key.toUpperCase() : m[1], cell: NAME_CELL[key], example: unquote(m[2]), cls: (m[3] || "").trim(), a: side(m[4], m[5]), b: side(m[6], m[7]) };
}

/** Whether the example belongs in the cell: yes when both facts match the cell, no when either one contradicts it, else unsure. */
export function fitOf(f: Pick<FactLine, "cell" | "a" | "b">): Answer {
  const want = PATTERN[f.cell];
  const got = [f.a.answer, f.b.answer];
  if (got.some((g, i) => g !== "unsure" && (g === "yes") !== want[i])) return "no";
  return got.includes("unsure") ? "unsure" : "yes";
}

/** The pair's two terms in the singular, with their article, as the debate questions write them ("a memory", "matter"). */
export interface Terms { a: string; b: string }

// A reason is the words after "because"; one without a subject of its own ("a form") is read as "it is a form".
const reasonOf = (s: string) => {
  const t = s.trim().replace(/[.;,\s]+$/, "");
  if (!t) return "";
  const r = t[0].toLowerCase() + t.slice(1);
  return /^(it|its|it's|they)\b/.test(r) ? r : "it is " + r;
};
const plain = (s: string) => s.trim().replace(/[.;,\s]+$/, "");

/**
 * The parts of a note, which the page writes in the debate's form (it renders the terms with their A/B markers and the "not" as it
 * does in the questions):
 * - take: "Take S:", the example as the subject, once;
 * - term: "It follows it is (not) P, because R.", P the pair's term on that side, R the tutor's reason, one per term even when the
 *   reasons are the same; `why` is a sentence under it on why a denied term follows from the reason (the tutor's "pervasion:"), or "";
 * - unsure: "Whether it is P is not settled: W.";
 * - end: the conclusion, written only when the example does not plainly fit.
 */
export type NotePart =
  | { kind: "take"; subject: string }
  | { kind: "term"; side: "A" | "B"; not: boolean; reason: string; why: string }
  | { kind: "unsure"; side: "A" | "B"; say: string }
  | { kind: "end"; text: string };

// a reason and, after "pervasion:", why a denied term follows from it; a pervasion that only points back ("same") says nothing
function readSide(s: Side): { reason: string; perv: string } {
  const [r, p = ""] = s.say.split(/\s*;?\s*pervasion\s*:\s*/i);
  const perv = plain(p);
  return { reason: reasonOf(r), perv: /^(the )?same\b|^as above\b/i.test(perv) ? "" : perv };
}
const same = (x: string, y: string) => x.toLowerCase().replace(/\W+/g, " ").trim() === y.toLowerCase().replace(/\W+/g, " ").trim();
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) + "." : "");

/** What the page knows besides the line: the term data, the pair, and its terms as the note writes them. */
export interface NoteData { ix: DataIndex; p: PairLike; terms: Terms }

/**
 * What the term data says of a fact line: the pair's categories, the example's class (a listed example's type, else the tutor's
 * class when the data has it) and the two answers. A side the data settles for a listed example takes the data's answer, as the
 * grading would: an alias ("an apple" for "a red apple") settles a side such as food, but not one about a feature such as red.
 */
export function placeFacts(f: FactLine, d?: NoteData): { cats: readonly [string | null, string | null]; cls: string; answers: readonly [Answer, Answer] } {
  if (!d) return { cats: [null, null], cls: "", answers: [f.a.answer, f.b.answer] };
  const cats = pairCats(d.ix, d.p), any = cats[0] ? listedItem(d.ix, d.p, f.example, false) : null;
  const on = (cid: string | null, s: Side): Answer => {
    const it = cid && any ? (FEATURE.has(cid) ? listedItem(d.ix, d.p, f.example, true) : any) : null;
    return it && cid ? (it.c.includes(cid) ? "yes" : "no") : s.answer;
  };
  return { cats, cls: any ? any.t : knownClass(d.ix, f.cls), answers: [on(cats[0], f.a), on(cats[1], f.b)] };
}

/**
 * The note for a fact line. `accepted` is a debate question the learner accepted (or ran out of time on): the example is then the
 * tutor's counter-example to it. A note on an example that fits ends with its consequences; one that does not fit says so.
 * With the term data (`d`), a listed example is placed as the grading places it, and a side whose steps the data gives
 * (`rung`: up the chain to the term, or to a class that excludes it) takes those steps instead of the tutor's.
 */
export function noteParts(f: FactLine, accepted: boolean, d?: NoteData): NotePart[] {
  const { cats, cls, answers } = placeFacts(f, d);
  const out: NotePart[] = [{ kind: "take", subject: f.example }];
  let said = "";
  for (const [k, side, s] of [[0, "A", f.a], [1, "B", f.b]] as const) {
    const cid = cats[k], cat = d && cid ? d.ix.CAT[cid] : null, answer = answers[k];
    if (answer === "unsure") { out.push({ kind: "unsure", side, say: plain(s.say) }); continue; }
    const r = readSide(s), own = answer === s.answer; // the tutor's reason is kept only for its own answer
    const g = d && cat && cls ? rung(d.ix, cls, cat, side === "A" ? d.terms.a : d.terms.b, own ? r.reason : "") : null;
    if (g && g.answer === answer) { out.push({ kind: "term", side, not: answer === "no", reason: g.reason, why: g.why }); continue; }
    // the pervasion of a denied term is said under its statement, and the same one is not said twice
    const why = own && answer === "no" && r.perv && r.reason && !same(r.perv, said) ? r.perv : "";
    if (why) said = why;
    out.push({ kind: "term", side, not: answer === "no", reason: own ? r.reason : "", why: sentence(why) });
  }
  const fit = fitOf({ cell: f.cell, a: { answer: answers[0], say: "" }, b: { answer: answers[1], say: "" } });
  const q = "Q" + (QCELL.indexOf(f.cell) + 1);
  if (fit === "no") out.push({ kind: "end", text: accepted ? `So it does not fit the cell of ${q} and is not a counter-example.` : "So it does not fit." });
  if (fit === "unsure") out.push({ kind: "end", text: accepted ? "Claude is unsure whether it is a counter-example." : "Claude is unsure whether it fits." });
  return out;
}
/** The note as plain text, a line per part, for where the page has no markers to show (a flag on the note keeps this text). */
export function partsText(parts: readonly NotePart[], terms: Terms): string {
  const t = (side: "A" | "B") => (side === "A" ? terms.a : terms.b);
  const because = (r: string) => (r ? `, because ${r}` : "");
  return parts.map((p) => {
    switch (p.kind) {
      case "take": return `Take ${p.subject}:`;
      case "term": return `It follows it is ${p.not ? "not " : ""}${t(p.side)}${because(p.reason)}.${p.why ? "\n" + p.why : ""}`;
      case "unsure": return `Whether it is ${t(p.side)} is not settled${p.say ? ": " + p.say : ""}.`;
      case "end": return p.text;
    }
  }).join("\n");
}
export const factNote = (f: FactLine, accepted: boolean, terms: Terms, d?: NoteData): string => partsText(noteParts(f, accepted, d), terms);

/** The verdicts in the tutor's text, in order. A line with the two facts gives the verdict its facts give (with the term data, as `placeFacts` settles them); otherwise a line of the form `<cell>: <example> => yes|no|unsure` does. Other lines are ignored, also when bulleted or in bold. */
export function parseVerdicts(text: string | null | undefined, d?: NoteData): CellVerdict[] {
  const out: CellVerdict[] = [];
  for (const ln of (text || "").split("\n")) {
    const f = parseFactLine(ln);
    if (f) {
      const [a, b] = placeFacts(f, d).answers; // with the term data, the answers the note shows
      out.push({ cell: f.cell, answer: fitOf({ cell: f.cell, a: { answer: a, say: "" }, b: { answer: b, say: "" } }) });
      continue;
    }
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
