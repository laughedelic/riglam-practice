// Sprint: the clock of a step. The times it can have, what they start from, where they are kept, and which an exercise uses. What the page does at the end of a
// step lives with the exercises (app/shell/timers.js); the numbers and the rules about them are here, so that they are tested apart from the page.

/** The times, by what they time: choosing the relation (`rel`), choosing between Accept and Why? (`q`), writing an example or a name (`ex`), the reply to a syllogism
 *  (`syl`), the categories of Categories ticked on one screen (`cats`) and one category said yes or no (`cat`). */
export type TimeKind = "rel" | "q" | "ex" | "syl" | "cats" | "cat";
export const TIME_KINDS: TimeKind[] = ["rel", "q", "ex", "syl", "cats", "cat"];
/** What a time is, from the start, in ms. */
export const TIME_DEFAULT: Record<TimeKind, number> = { rel: 15000, q: 10000, ex: 20000, syl: 15000, cats: 20000, cat: 5000 };
/** The key a time is kept under on the device (the first three are older than the others; their names stay). */
export const TIME_KEY: Record<TimeKind, string> = { rel: "rd-timer-rel", q: "rd-timer-q", ex: "rd-timer", syl: "rd-timer-syl", cats: "rd-timer-cats", cat: "rd-timer-cat" };
export const TIME_MIN = 2000;
export const TIME_MAX = 120000;

/** A time as it was kept: that, if it is a number of ms in range, else what the time starts from. */
export function readTime(kind: TimeKind, raw: unknown): number {
  const v = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= TIME_MIN && v <= TIME_MAX ? Math.round(v) : TIME_DEFAULT[kind];
}

/**
 * The stage of the last seconds a countdown is in, given the time `left` of its `limit` (ms): 0 none, 1 the bar is red and beats, 2 the beat is quicker, 3 quickest. A short countdown
 * has the same three stages on a smaller scale: the red starts in the last half of it (at most 5 s), the beat quickens in the last 20% (at most 2 s) and again in the last 10% (at most
 * 1 s). A 10 s or longer clock: 5 s, 2 s and 1 s left; a 5 s clock: 2.5 s, 1 s and 0.5 s left; the shortest, 2 s: 1 s, 0.4 s and 0.2 s left.
 */
export function beatStage(left: number, limit: number): 0 | 1 | 2 | 3 {
  if (left > Math.min(5000, limit * 0.5)) return 0;
  if (left > Math.min(2000, limit * 0.2)) return 1;
  return left > Math.min(1000, limit * 0.1) ? 2 : 3;
}

/** All the times at their start. */
export const defaultTimes = (): Record<TimeKind, number> => ({ ...TIME_DEFAULT });

/** How many times the time of a step is given to the step: naming the two terms of a pair takes two writings. */
export const NAME_TIMES = 2;

/** The times an exercise uses, in the order its Sprint page lists them (`ex` is "Writing" wherever it is used). */
export function timesOf(exercise: string): TimeKind[] {
  switch (exercise) {
    case "practice": return ["rel", "ex"];
    case "debate": return ["rel", "q", "ex"];
    case "syllogism": return ["syl"];
    case "find": return ["ex"];
    case "categories": return ["cats", "cat"];
    case "instance": return ["ex"];
    default: return [];
  }
}

/** What time up on a case of examples does: the case stays as it is typed (empty if nothing is), and the path goes on to the next case still without an example. After
 *  the last one the pair is checked. A case that has run out is not asked again. Returns the cell to open next, or null when the pair is to be checked. */
export function nextAfterTimeUp(order: string[], at: number, done: (cell: string) => boolean): string | null {
  const rest = [...order.slice(at + 1), ...order.slice(0, Math.max(0, at))];
  return rest.find((c) => !done(c)) ?? null;
}
