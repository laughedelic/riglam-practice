import type { Guidance } from "./stages";

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

/** What a full bar shows when nothing was answered, by the level of guidance of the exercise (practice/guided.ts): the answer explained ("explain", Detailed), the answer
 *  alone ("name", Hints), or nothing, and the next question comes at once ("skip", None). Something answered is checked as it stands at every level: the level changes what
 *  is shown, not what counts (a time-up that counts as wrong is kept as wrong, at None too, and Review lists it). */
export type TimeUpView = "explain" | "name" | "skip";
export const timeUpView = (g: Guidance): TimeUpView => (g === "detailed" ? "explain" : g === "hints" ? "name" : "skip");
