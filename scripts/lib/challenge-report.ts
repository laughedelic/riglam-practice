// What a written challenge comes to on the app's data (src/domain/challenge.ts): what is wrong with it, or how each of its questions will be asked
// and what the data answers. For scripts/challenge.ts, which prints it before a challenge is loaded.
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { challengeQuestion, checkChallenge, dayText, itemAnswer, itemLine } from "../../src/domain/challenge";
import type { Challenge } from "../../src/domain/challenge";

/** The exercises by the names the app shows. */
const EXERCISE: Record<string, string> = { practice: "Relations", debate: "Pervasions", find: "Find a pair", syllogism: "Syllogisms", categories: "Categories", instance: "Find an instance" };

export interface ChallengeReport {
  /** it can be loaded: it is a challenge, and the data makes every one of its questions */
  ok: boolean;
  /** what to print */
  lines: string[];
  /** the challenge as it is loaded: JSON text with nothing in it but what the app reads; null when it is not one */
  body: string | null;
}

/** The report of `raw`, a challenge as it was written, on the open term data. */
export function challengeReport(data: DrillData, raw: unknown): ChallengeReport {
  const { challenge, problems } = checkChallenge(raw);
  if (!challenge) return { ok: false, lines: ["Not a challenge:", ...problems.map((p) => "  " + p)], body: null };
  const ix = makeIndex(data), missing: number[] = [];
  const rows = challenge.items.map((g, i) => {
    const q = challengeQuestion(ix, challenge, i), name = EXERCISE[g.exercise] ?? g.exercise;
    if (!q) { missing.push(i + 1); return `  ${i + 1}  ${name}: the data cannot make this question (${JSON.stringify(g)})`; }
    const l = itemLine(q), answer = itemAnswer(q);
    return `  ${i + 1}  ${name}: ${"pair" in l ? l.pair[0] + " and " + l.pair[1] : l.text}` + (answer ? `\n       the data answers: ${answer}` : "");
  });
  return {
    ok: !missing.length,
    lines: [...head(challenge), ...rows, ...(missing.length ? ["", `Not ready: question ${missing.join(", ")} cannot be asked. Use the ids of the categories in src/data/drill-data.json.`] : [])],
    body: JSON.stringify(challenge),
  };
}
const head = (c: Challenge): string[] => [`${c.title} (${dayText(c.date)}, id ${c.id})`, ...(c.note ? [`  ${c.note}`] : []), ""];
