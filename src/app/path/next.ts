// The name of the station that goes on from an answer: "Next" for the next question of the exercise, in every exercise, or, when something comes before it,
// what that is: "Next: new stage" when the stage is due (practice/stage-offer.ts), "Next: new definition" or "Next: repetition" when a stop of a course term is (practice/stops.ts).
// So a colon after Next always means that something else comes first, and the same Next leads from a stop or a stage on to the question.
import { stageUpDue } from "../practice/stage-offer.ts";
import { dueStop } from "../practice/stops.ts";
import type { Stop } from "../../domain/intro.ts";
import type { StationKind } from "./shell.tsx";

/** The name of the station that goes on to the question, and what it says when it is pulled: the same on a result, a stop and a stage. */
export const NEXT = "Next";
export const ON_TO_QUESTION = "on to the question";
/** What the Next station says when a stop of a course term comes first. */
export const stopName = (s: Stop): string => "Next: " + (s.why === "new" ? "new definition" : "repetition");
/** The name of the Next station: `question`, plain Next (a retry of mistakes says "Back to new pairs" when it is over), unless a stage or a stop comes first (the stage goes first, as in next()). */
export function nextName(question: string = NEXT): string {
  if (stageUpDue()) return "Next: new stage";
  const s = dueStop();
  return s ? stopName(s) : question;
}
/** The look of the Next station, by what it goes on to: a new stage (green), a new term or a term that comes again (teal), else the next question (gold). */
export function nextKind(): StationKind {
  if (stageUpDue()) return "up";
  const s = dueStop();
  return s ? stopKind(s) : "q";
}
/** The look of the station that goes on to the stop `s`. */
export const stopKind = (s: Stop): StationKind => (s.why === "new" ? "def" : "rep");
