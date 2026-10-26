// What the server learns about the examples learners type, from the tutor's own analyses (docs/SERVER.md, "Learned facts"): for each example
// and each category of the pair, the answer the analyses gave (is it A? is it B?), its reason, and how far the analyses agree. A row is kept per
// (example, category), so a thing met in one pair answers half of another pair that shares a category. The learner's own placement is never part
// of it: only what the models said. Pure; the Worker reads and writes the rows (worker/learned.ts, migrations/0009_example_facts.sql).
import { spelled, stripDet } from "../ai-shared/lookup";
import { parseFactLine } from "./verdict";
import type { Answer, Side } from "./verdict";

/**
 * The version of the prompts and the term data the analyses were made with. Raise it when a change could change the answers (the instructions,
 * the explain request, the term data's chains): a row of an older version is then not served, and the next analysis starts it again.
 */
export const FACTS_EPOCH = 2;

export const FACT_LIMITS = {
  /** an example longer than this is not kept (it is more likely a sentence with personal words than a thing) */
  text: 80,
  reason: 200,
  /** examples one explain request may name */
  examples: 8,
} as const;

/**
 * - candidate: one analysis, or several that agree only in part; not served, so the next learner who meets it asks again
 * - checked: the models of a Quorum run all gave this answer, or a later analysis agreed with a candidate; may be served
 * - disputed: analyses gave different answers, or a flag disputed it; never served, until the maintainer decides
 * - reviewed: the maintainer's decision; always served, and no analysis changes it
 */
export type FactState = "candidate" | "checked" | "disputed" | "reviewed";
/** where the row's answer came from last */
export type FactSource = "explain" | "quorum" | "maintainer";

/** The key of an example: its words as the page's lookup compares them, without the article. Null when it is empty or too long to be kept. */
export function factKey(text: unknown): string | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > FACT_LIMITS.text) return null;
  return stripDet(spelled(t)) || null;
}

/** What one answer (a model's, or the judge's) says of one example: the class it named and the two sides, A and B. */
export interface Opinion {
  name: string;
  model: string;
  judge: boolean;
  cls: string;
  sides: readonly [Side, Side];
}

/**
 * What an answer's text says of an example: its last fact line about the example that gives a definite answer on either side (a line the tutor wrote
 * again to correct the first is the one the page's note shows), else its first line about it; null when no line names it. The example is matched by
 * its key, so case, the article and punctuation do not matter.
 */
export function opinionOf(text: string, example: string): Pick<Opinion, "cls" | "sides"> | null {
  const k = factKey(example);
  if (!k) return null;
  let first: Pick<Opinion, "cls" | "sides"> | null = null, sure: Pick<Opinion, "cls" | "sides"> | null = null;
  for (const ln of (text || "").split("\n")) {
    const f = parseFactLine(ln);
    if (!f || factKey(f.example) !== k) continue;
    const o = { cls: f.cls, sides: [f.a, f.b] as const };
    if (f.a.answer !== "unsure" || f.b.answer !== "unsure") sure = o;
    else first ??= o;
  }
  return sure ?? first;
}

/**
 * How the analyses of one explain question settle one side of an example:
 * - single: one model answered (the tutor as ever, or the only Quorum model that could be used)
 * - unanimous: two or more models answered, and every one gave the same yes or no
 * - partial: two or more models, the definite ones agree but some were unsure
 * - ruled: the models differed and the judge gave a yes or no
 * - split: the models differed and nobody ruled; the answer is the majority's (on a tie, the strongest model's)
 */
export type Strength = "single" | "unanimous" | "partial" | "ruled" | "split";
export interface Ruling {
  answer: Answer;
  reason: string;
  cls: string;
  strength: Strength;
  /** every answer that counted, for the audit: the models in their order (weakest first), then the judge */
  votes: { model: string; answer: Answer }[];
}

const definite = (a: Answer) => a !== "unsure";
// A reason that names the pair's own letters ("a white one is B") is about that pair: the same category is the other letter in another pair, so it is not kept.
const ABOUT_PAIR = /\b(?:is|are|be|in|of|to|not|both|and|or|than) [AB]\b/;
// the reason, without the pervasion that may follow it (the note's own steps come from the term data), cut to size
const reasonOf = (s: Side) => {
  const r = s.say.split(/\s*;?\s*pervasion\s*:/i)[0].trim().replace(/[.;,\s]+$/, "");
  return ABOUT_PAIR.test(r) ? "" : r.slice(0, FACT_LIMITS.reason);
};

/** The ruling on side 0 (A) or 1 (B) of an example. `models` are the models' opinions in their order (weakest first), `judge` the judge's when it ruled. Null when nobody said anything. */
export function ruleSide(models: readonly Opinion[], judge: Opinion | null, side: 0 | 1): Ruling | null {
  const all = judge ? [...models, judge] : [...models];
  if (!all.length) return null;
  const votes = all.map((o) => ({ model: o.model, answer: o.sides[side].answer }));
  const of = (o: Opinion, strength: Strength): Ruling => ({ answer: o.sides[side].answer, reason: reasonOf(o.sides[side]), cls: o.cls, strength, votes });
  const sure = models.filter((o) => definite(o.sides[side].answer));
  const answers = new Set(sure.map((o) => o.sides[side].answer));
  const allSure = models.length >= 2 && sure.length === models.length;
  // the judge, when it gave a yes or no: it settles a split, and it is unanimous only with every model behind it
  if (judge && definite(judge.sides[side].answer)) return of(judge, answers.size === 1 && allSure && answers.has(judge.sides[side].answer) ? "unanimous" : "ruled");
  if (!models.length) return of(judge!, "single");
  if (answers.size > 1) {
    const yes = sure.filter((o) => o.sides[side].answer === "yes").length, no = sure.length - yes;
    const pick = yes === no ? sure[sure.length - 1].sides[side].answer : yes > no ? "yes" : "no";
    return of([...sure].reverse().find((o) => o.sides[side].answer === pick)!, "split");
  }
  // the models agree where they are sure: the strongest sure one speaks for them; nobody sure: the strongest model's "unsure"
  const speaker = sure.length ? sure[sure.length - 1] : models[models.length - 1];
  return of(speaker, models.length === 1 ? "single" : allSure ? "unanimous" : "partial");
}

/** One stored fact, as worker/learned.ts reads and writes it (the columns of example_facts). */
export interface FactRow {
  answer: Answer;
  cls: string;
  reason: string;
  state: FactState;
  /** analyses that gave `answer` */
  agree: number;
  /** analyses that gave another yes or no, or were split */
  against: number;
  src: FactSource;
  /** the last analysis, for the audit */
  models: { model: string; answer: Answer }[];
  epoch: number;
  /** the example as it was last typed */
  text: string;
  seen: number;
  first_day: string;
  last_day: string;
}

const FIRST: Record<Strength, FactState> = { single: "candidate", partial: "candidate", ruled: "candidate", unanimous: "checked", split: "disputed" };

/**
 * The row after an analysis: `stored` is the row as it was (null: none), `r` the ruling of this explain question. The rules (docs/SERVER.md):
 * a first analysis is checked only when every model gave the same answer, and disputed when they differed with no ruling; a later analysis that
 * agrees with a candidate makes it checked, one that gives the other yes or no makes the row disputed, and an "unsure" changes nothing but the
 * counters. Only the maintainer settles a dispute. A row of an older epoch starts again; a reviewed row is never changed by a model.
 */
export function learn(stored: FactRow | null, r: Ruling, at: { src: FactSource; text: string; day: string; epoch?: number }): FactRow {
  const epoch = at.epoch ?? FACTS_EPOCH;
  const fresh = (): FactRow => ({
    answer: r.answer,
    cls: r.cls,
    reason: r.reason,
    state: FIRST[r.strength],
    agree: 1,
    against: r.strength === "split" ? 1 : 0,
    src: at.src,
    models: r.votes,
    epoch,
    text: at.text,
    seen: (stored?.seen ?? 0) + 1,
    first_day: stored?.first_day ?? at.day,
    last_day: at.day,
  });
  if (!stored) return fresh();
  const seen = { ...stored, text: at.text, seen: stored.seen + 1, last_day: at.day };
  if (stored.state === "reviewed") return seen;
  if (stored.epoch !== epoch) return fresh();
  // an unsure row starts again with the next analysis, but a dispute (a flag's, or the models') is closed only by the maintainer
  if (!definite(stored.answer)) return stored.state === "disputed" ? { ...fresh(), state: "disputed" } : fresh();
  const heard = { ...seen, models: r.votes, src: at.src };
  if (!definite(r.answer)) return heard;
  if (r.strength === "split" || r.answer !== stored.answer) return { ...heard, state: "disputed", against: stored.against + 1 };
  return { ...heard, agree: stored.agree + 1, state: stored.state === "candidate" ? "checked" : stored.state, cls: stored.cls || r.cls, reason: stored.reason || r.reason };
}

/** Whether a row may answer a check without the AI: the maintainer's decision, or a checked row of this epoch, with a yes or no. */
export const servable = (row: Pick<FactRow, "state" | "answer" | "epoch">, epoch: number = FACTS_EPOCH): boolean =>
  definite(row.answer) && (row.state === "reviewed" || (row.state === "checked" && row.epoch === epoch));

// a learner's words or a stored reason inside a line: nothing that would end the line, a field or the quoted example
const inLine = (s: string) => String(s ?? "").replace(/[|\r\n]+/g, " ").replace(/"/g, "'").replace(/\s+/g, " ").trim();

/**
 * The tutor's line for an example whose two sides are known (`parseFactLine` reads it back): `cellName` as the line names the cell ("Both", "A not B"),
 * `a` and `b` the answers on the pair's two categories with their reasons, the class the first that has one.
 */
export function knownLine(cellName: string, text: string, a: Pick<FactRow, "answer" | "reason" | "cls">, b: Pick<FactRow, "answer" | "reason" | "cls">): string {
  const cls = inLine(a.cls || b.cls);
  return `${cellName}: "${inLine(text)}"${cls ? ` | class: ${cls}` : ""} | A ${a.answer}: ${inLine(a.reason)} | B ${b.answer}: ${inLine(b.reason)}`;
}
