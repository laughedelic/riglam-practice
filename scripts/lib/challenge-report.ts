// What written challenges come to on the app's data (src/domain/challenge.ts): what is wrong with them, or how each question of each will be asked
// and what answers it: the data, or, for a question about what the data does not have, the answer the challenge carries, which is printed whole so
// that it can be read against the reference before it is given out. For scripts/challenge.ts, which prints it before the challenges are loaded.
import { CELLS, REL, catByLabel, makeIndex } from "../../src/ai-shared";
import type { DataIndex, DrillData } from "../../src/ai-shared";
import { challengeQuestion, checkChallenges, dayText, isCarried, itemAnswer, itemLine } from "../../src/domain/challenge";
import type { CarriedPair, CarriedSyllogism, Challenge, ChallengeSet } from "../../src/domain/challenge";
import { judgeable } from "../../src/domain/universe";

/** The exercises by the names the app shows. */
const EXERCISE: Record<string, string> = { practice: "Relations", debate: "Pervasions", find: "Find a pair", syllogism: "Syllogisms", categories: "Categories", instance: "Find an instance" };

export interface ChallengeReport {
  /** they can be loaded: each is a challenge, no id names two, the data makes every question written by its categories, and no question carries an answer for a pair the data has */
  ok: boolean;
  /** what to print */
  lines: string[];
  /** the challenges as they are loaded, all of them in one row (`ChallengeSet`): JSON text with nothing in it but what the app reads; null when one of them is not a challenge */
  body: string | null;
}

/**
 * The report of `raw`, the challenges as they were written (a challenge, a list of them, or `{challenges: [...]}`), on the open term data. They are
 * loaded together: the row holds all of them, and a challenge left out of it is taken away from the devices.
 */
export function challengeReport(data: DrillData, raw: unknown): ChallengeReport {
  const { challenges, problems } = checkChallenges(raw);
  if (problems.length) return { ok: false, lines: ["Not ready:", ...problems.map((p) => "  " + p)], body: null };
  const ix = makeIndex(data), each = challenges.map((c) => oneReport(ix, c)), set: ChallengeSet = { challenges };
  const n = challenges.length;
  return {
    ok: each.every((r) => r.ok),
    lines: [n + (n === 1 ? " challenge" : " challenges") + ", by their day:", "", ...each.flatMap((r, i) => (i ? ["", ...r.lines] : r.lines))],
    body: JSON.stringify(set),
  };
}

/** The report of one challenge. */
function oneReport(ix: DataIndex, challenge: Challenge): { ok: boolean; lines: string[] } {
  const missing: number[] = [], known: number[] = [];
  const rows = challenge.items.map((g, i) => {
    const q = challengeQuestion(ix, challenge, i), name = EXERCISE[g.exercise] ?? g.exercise;
    if (!q) { missing.push(i + 1); return `  ${i + 1}  ${name}: the data cannot make this question (${JSON.stringify(g)})`; }
    const l = itemLine(q), answer = itemAnswer(q), line = `  ${i + 1}  ${name}: ${"pair" in l ? l.pair[0] + " and " + l.pair[1] : l.text}`;
    if (!isCarried(g)) return line + (answer ? `\n       the data answers: ${answer}` : "");
    const has = g.exercise === "syllogism" ? null : inData(ix, g);
    if (has) known.push(i + 1);
    return [line, `       the challenge answers: ${answer}`, ...(g.exercise === "syllogism" ? syllogismRows(g) : pairRows(g)), ...(has ? [`       the data has this pair: write it as "a": "${has[0]}", "b": "${has[1]}", and the data checks the examples`] : [])].join("\n");
  });
  return {
    ok: !missing.length && !known.length,
    lines: [
      ...head(challenge), ...rows,
      ...(missing.length ? ["", `Not ready: question ${missing.join(", ")} cannot be asked. Use the ids of the categories in src/data/drill-data.json.`] : []),
      ...(known.length ? ["", `Not ready: question ${known.join(", ")} carries an answer for a pair the data has.`] : []),
    ],
  };
}
/** The two categories of a carried pair's sides, when the data has both and judges the pair: such a pair is the data's to answer. */
function inData(ix: DataIndex, g: CarriedPair): [string, string] | null {
  const a = catByLabel(ix, g.terms[0].many), b = catByLabel(ix, g.terms[1].many);
  return a && b && a !== b && judgeable(ix, a, b) ? [a, b] : null;
}
const CELL_SAID = { both: "both", anb: "A not B", bna: "B not A", nei: "neither" } as const;
/** What a carried pair brings, a line for each case: its example, or that it is empty and why; then how one of each side is called. */
function pairRows(g: CarriedPair): string[] {
  const { ex, why } = g.answer, empty = REL[g.answer.relation].empty;
  return [
    ...CELLS.map((c) => `         ${CELL_SAID[c]}: ${ex[c] ?? "empty" + (why?.[c] ? " (" + why[c] + ")" : empty.includes(c) ? "" : " ?")}`),
    ...(g.answer.note ? [`         note: ${g.answer.note}`] : []),
    `         one of each: ${g.terms[0].one} · ${g.terms[1].one}`,
  ];
}
/** What a carried syllogism brings: the three checks, and the counter-example of a pervasion that fails. */
function syllogismRows(g: CarriedSyllogism): string[] {
  const a = g.answer, line = (k: "reason" | "pervasion" | "thesis") => (a.lines?.[k] ? " (" + a.lines[k] + ")" : "");
  return [
    `         reason: ${a.reason ? "established" : "not established"}${line("reason")}`,
    `         pervasion: ${a.pervasion === true ? "holds" : a.pervasion === "opposite" ? "opposite" : "fails"}${line("pervasion")}${a.witness ? "; counter-example: " + a.witness : ""}`,
    `         thesis: ${a.thesis ? "true" : "false"}${line("thesis")}`,
  ];
}
const head = (c: Challenge): string[] => [`${c.title} (${dayText(c.date)}, id ${c.id})`, ...(c.note ? [`  ${c.note}`] : []), ""];
