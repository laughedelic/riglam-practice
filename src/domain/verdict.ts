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
 * The tutor's line for an example, in the form `<cell>: <example> | A yes: <reason> | B no: <reason>`: two small facts, whether the
 * example is A and whether it is B, each with its reason. The tutor writes no conclusion; the page draws it (`fitOf`) and writes the
 * consequences (`factNote`).
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
 * The parts of a note, one per line, which the page writes in the debate's form (it renders the terms with their A/B markers and
 * the "not" as it does in the questions):
 * - take: "Take S:", the example as the subject, once;
 * - term: "It follows it is (not) P, because R.", P the pair's term on that side, R the tutor's reason;
 * - step: "It follows R1, because R2.", the reason for a reason that is not obvious (the tutor's "<=");
 * - pervasion: "Whatever is X is necessarily not P, because W.", why a denied term follows from the reason (the tutor's "pervasion:");
 *   X is the reason's class, or, for a reason that does not name one, "Whatever has that reason";
 * - unsure: "Whether it is P is not settled: W.";
 * - end: the conclusion, written only when the example does not plainly fit.
 */
export type NotePart =
  | { kind: "take"; subject: string }
  | { kind: "term"; side: "A" | "B"; not: boolean; reason: string }
  | { kind: "step"; what: string; reason: string }
  | { kind: "pervasion"; side: "A" | "B"; what: string; reason: string }
  | { kind: "unsure"; side: "A" | "B"; say: string }
  | { kind: "end"; text: string };

function sideParts(side: "A" | "B", s: Side): NotePart[] {
  if (s.answer === "unsure") return [{ kind: "unsure", side, say: plain(s.say) }];
  const [chain, perv = ""] = s.say.split(/\s*;?\s*pervasion\s*:\s*/i);
  const rs = chain.split(/\s*<=\s*/).map(reasonOf).filter(Boolean);
  const out: NotePart[] = [{ kind: "term", side, not: s.answer === "no", reason: rs[0] || "" }];
  // the pervasion of a denied term is about the first reason ("whatever is a form ..."), so it comes right after it
  if (s.answer === "no" && plain(perv) && rs[0]) out.push({ kind: "pervasion", side, what: /^it is /.test(rs[0]) ? rs[0].slice(6) : "", reason: plain(perv) });
  for (let i = 1; i < rs.length; i++) out.push({ kind: "step", what: rs[i - 1], reason: rs[i] });
  return out;
}
/**
 * The note for a fact line. `accepted` is a debate question the learner accepted (or ran out of time on): the example is then the
 * tutor's counter-example to it. A note on an example that fits ends with its consequences; one that does not fit says so.
 */
export function noteParts(f: FactLine, accepted: boolean): NotePart[] {
  const fit = fitOf(f), out: NotePart[] = [{ kind: "take", subject: f.example }, ...sideParts("A", f.a), ...sideParts("B", f.b)];
  const q = "Q" + (QCELL.indexOf(f.cell) + 1);
  if (fit === "no") out.push({ kind: "end", text: accepted ? `So it does not fit the cell of ${q} and is not a counter-example.` : "So it does not fit." });
  if (fit === "unsure") out.push({ kind: "end", text: accepted ? "Claude is unsure whether it is a counter-example." : "Claude is unsure whether it fits." });
  return out;
}
/** The subject of a pervasion line: the class the reason names, if it names one. */
export const pervLead = (what: string): string => (what ? `Whatever is ${what}` : "Whatever has that reason");
/** The note as plain text, a line per part, for where the page has no markers to show (a flag on the note keeps this text). */
export function partsText(parts: readonly NotePart[], terms: Terms): string {
  const t = (side: "A" | "B") => (side === "A" ? terms.a : terms.b);
  return parts.map((p) => {
    switch (p.kind) {
      case "take": return `Take ${p.subject}:`;
      case "term": return `It follows it is ${p.not ? "not " : ""}${t(p.side)}${p.reason ? `, because ${p.reason}` : ""}.`;
      case "step": return `It follows ${p.what}, because ${p.reason}.`;
      case "pervasion": return `${pervLead(p.what)} is necessarily not ${t(p.side)}, because ${p.reason}.`;
      case "unsure": return `Whether it is ${t(p.side)} is not settled${p.say ? ": " + p.say : ""}.`;
      case "end": return p.text;
    }
  }).join("\n");
}
export const factNote = (f: FactLine, accepted: boolean, terms: Terms): string => partsText(noteParts(f, accepted), terms);

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
