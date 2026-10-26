// The name of the station that goes on from an answer: "Next pair", "Next syllogism" ... for the next question of the exercise, or, when something comes before it,
// what that is: "Next: new stage" when the stage is due (practice/stage-offer.ts), "Next: new definition" or "Next: repetition" when a stop of a course term is (practice/stops.ts).
import { stageUpDue } from "../practice/stage-offer.ts";
import { dueStop } from "../practice/stops.ts";
import type { StationKind } from "./shell.tsx";

/** The name of the Next station: `question`, what the exercise's next question is called ("Next pair"), unless a stage or a stop comes first (the stage goes first, as in next()). */
export function nextName(question: string): string {
  if (stageUpDue()) return "Next: new stage";
  const s = dueStop();
  return s ? "Next: " + (s.why === "new" ? "new definition" : "repetition") : question;
}
/** The look of the Next station: its own (green) when a new stage comes first, else the usual big blue one. */
export const nextKind = (): StationKind | undefined => (stageUpDue() ? "up" : undefined);
