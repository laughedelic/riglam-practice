// Small helpers on text, choices and stored answers.
import type { HistoryEntry } from "./types";

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** One of `a` at random (`rng` returns a number in [0, 1), `Math.random` by default). */
export const pick = <T>(a: readonly T[], rng: () => number = Math.random): T => a[Math.floor(rng() * a.length)];

/** The grade of a stored answer; older records have only `correct`. */
export const gradeOf = (a: HistoryEntry | null | undefined): string => (a ? a.grade || (a.correct ? "ok" : "bad") : "");
export const isMiss = (a: HistoryEntry | null | undefined): boolean => {
  const g = gradeOf(a);
  return g === "bad" || g === "part";
};
