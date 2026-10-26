// The name of the station that goes on from an answer: "Next pair", "Next syllogism" ... for the next question of the exercise, or, when a stop of a course term is due before it
// (practice/stops.ts), what that is: "Next: new definition", "Next: repetition".
import { dueStop } from "../practice/stops.ts";

/** The name of the Next station: `question`, what the exercise's next question is called ("Next pair"), unless a stop comes first. */
export function nextName(question: string): string {
  const s = dueStop();
  return s ? "Next: " + (s.why === "new" ? "new definition" : "repetition") : question;
}
