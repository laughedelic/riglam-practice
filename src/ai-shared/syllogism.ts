// The tutor's part for Syllogisms (src/domain/syllogism.ts): what the mode is, the card of one syllogism with the learner's reply, and the request to explain it.
// The page settles the three checks, the right reply and what was mixed up from the term data, so the card gives them as facts; the tutor words them, names the
// counter-example the page keeps for a pervasion that fails, and says what to look at. Pure functions of the term data like the rest of this folder: the
// types below are the fields of the page's syllogism and answer that the card reads, so this file does not depend on the domain.
import { finePoints } from "./card";
import { catFacts } from "./facts";
import { matchItem } from "./lookup";
import type { DataIndex } from "./lookup";
import { GUIDE } from "./prompts";

type Reply = "accept" | "reason" | "pervasion";
interface Check { ok: boolean; line: string }

/** The syllogism the card describes: the fields of the domain's `Syllogism` that it reads. */
export interface SyllogismView {
  subject: string;
  predicate: string;
  reason: string;
  /** the categories of the reason and the predicate (their ids in the term data) */
  catR: string;
  catP: string;
  /** the reply that is right */
  answer: Reply;
  pervasion: "holds" | "fails" | "opposite";
  /** a thing that is the reason and is not the predicate, kept for the explanation of a pervasion that fails */
  witness?: string;
  checks: { e: Check; v: Check; t: Check };
}

/** The learner's answer as the card reads it. */
export interface SyllogismAnswerView {
  /** the syllogism as the learner read it, in their wording */
  sentence: string;
  /** the graded reply: `said` is null when the time ran out (Blitz) */
  grade: { said: Reply | null; correct: boolean; confusion: string };
  /** the counter-example offered after a right "there is no pervasion", and the page's verdict on it ("cmp": the page could not place it) */
  ex?: { text: string; v: "ok" | "bad" | "cmp" } | null;
}

export const SYLLOGISM_NOTE = `This is the Syllogisms mode. The learner gets a subject S, a predicate P and a reason R as one sentence ("Take S. It follows it is P because it is R.") and replies with one of three: "The reason is not established" (S is not R), "There is no pervasion" (S is R, but not everything that is R is P), or "Accept" (S is R and everything that is R is P).
The right reply is the first of three checks that fails, made in this order: 1 Reason (is S R?), 2 Pervasion (is whatever is R also P?), 3 Thesis (is S P?). When the reason and the pervasion both fail, the reason comes first. A true thesis does not make the syllogism right: the reason has to prove it. After a right "There is no pervasion" the learner may name a counter-example: something that is R and is not P.
The page has settled the three checks, the right reply and what was mixed up from the term data. They are right: explain them, never question or reverse them. In Blitz mode, running out of time is no reply.`;

export const SYLLOGISM_ASK = `Explain this answer. The page shows the learner its line for each check (they are in the card), so do not say them again in the same words: add what they leave out. Write lines only for the checks up to and including the first one that fails (all three when none fails), in this order, briefly for a check that holds:
- "Reason:" what the subject is, down to its class, and so why it is or is not the reason; when it is not, name the reason's class too and why nothing is in both, but only as far as the card or the lookup tools show it, otherwise say only that the subject is not the reason;
- "Pervasion:" when it fails, the counter-example from the card, in a sentence that says it is the reason and is not the predicate, or, for an opposite pervasion, why what is the reason is not the predicate, from the chains and the contradictory terms in the card (or the lookup tools); when it holds, why, step by step up from the reason's class to the predicate, none skipped;
- "Thesis:" whether the subject is the predicate, in a few words;
- "Counter-example:" only if the learner offered one: whether it is the reason and is not the predicate. The page's verdict is in the card; where the page could not place it, decide from the sources and say it is your own reading;
- "Explanation:" only if the reply was wrong or the time ran out (not when a right reply came with a counter-example that is not one): two sentences on what to look at to get it right, without repeating the lines above;
- "Misconception:" only if the learner gave a wrong reply, one sentence; never when the time ran out.`;

const SAID: Record<Reply, string> = { accept: "Accept", reason: "The reason is not established", pervasion: "There is no pervasion" };
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/**
 * The card without the standing instructions and without the fine points: what the data says about the subject, the reason and the predicate, the three checks with
 * the page's lines, the right reply, and the learner's answer. A server that holds the instructions and the fine points itself asks the page for this part only;
 * `syllogismCard` is the three put together.
 */
export function syllogismBody(ix: DataIndex, c: SyllogismView, a: SyllogismAnswerView): string {
  const item = matchItem(ix, c.subject, true);
  const card = {
    S: item ? { label: c.subject, type: item.t, chain: (ix.DATA.chains[item.t] || [item.t]).join(" > ") } : { label: c.subject },
    R: catFacts(ix, c.catR, c.reason) ?? { label: c.reason },
    P: catFacts(ix, c.catP, c.predicate) ?? { label: c.predicate },
  };
  const pervasion = c.checks.v.ok ? "HOLDS"
    : c.pervasion === "opposite" ? "DOES NOT HOLD: it is the opposite, nothing that is the reason is the predicate (the term chain shows it)"
    : "DOES NOT HOLD: some things that are the reason are not the predicate" + (c.witness ? "; the counter-example kept for you: " + JSON.stringify(c.witness) : "");
  const checks = [
    `1 Reason (is S the reason?): ${c.checks.e.ok ? "ESTABLISHED" : "NOT ESTABLISHED"}. The page's line: ${JSON.stringify(c.checks.e.line)}`,
    `2 Pervasion (is whatever is the reason also the predicate?): ${pervasion}. The page's line: ${JSON.stringify(c.checks.v.line)}`,
    `3 Thesis (is S the predicate?): ${c.checks.t.ok ? "TRUE" : "FALSE"}. The page's line: ${JSON.stringify(c.checks.t.line)}`,
  ].join("\n");
  const replied = a.grade.said
    ? `Learner replied: ${JSON.stringify(SAID[a.grade.said])}, which is ${a.grade.correct ? "right" : "wrong"}.`
    : "The learner gave no reply: the time ran out (Blitz), so nothing was mixed up.";
  const ex = a.ex
    ? `\nThe learner's counter-example: ${JSON.stringify(cut(a.ex.text, 200))}; page verdict ${a.ex.v === "ok" ? "ok (it is the reason and is not the predicate)" : a.ex.v === "bad" ? "bad (it is not the reason, or it is the predicate too)" : "cmp (the page does not know it well enough to say)"}.`
    : "";
  return `${SYLLOGISM_NOTE}
CARD (from the course booklet's term data; S is the subject, R the reason, P the predicate):
${JSON.stringify(card)}
Syllogism: ${JSON.stringify(a.sentence)}
Checks (the page settled them):
${checks}
Right reply: ${JSON.stringify(SAID[c.answer])}. ${replied}${a.grade.confusion ? "\nWhat the page says was mixed up: " + a.grade.confusion : ""}${ex}`;
}

/** The categories the tutor's fine points are taken from: the reason's and the predicate's (the same one once). */
export const syllogismCats = (c: Pick<SyllogismView, "catR" | "catP">): string[] => (c.catR === c.catP ? [c.catR] : [c.catR, c.catP]);

/** The fine points of the reason's and the predicate's categories as the tail of the card; empty when there are none. */
export function syllogismNotes(ix: DataIndex, c: Pick<SyllogismView, "catR" | "catP">): string {
  const notes = finePoints(ix, syllogismCats(c));
  return notes.length ? "\nFine points (from the sources; apply them):\n" + notes.map((n) => "- " + n).join("\n") : "";
}

/** The first message of a tutor chat on a syllogism: the standing instructions, the card, and the fine points. */
export function syllogismCard(ix: DataIndex, c: SyllogismView, a: SyllogismAnswerView): string {
  return GUIDE + "\n\n" + syllogismBody(ix, c, a) + syllogismNotes(ix, c);
}
