// The settings an exercise keeps its own value of (Blitz, the tutor and voice; app/practice/per-exercise.ts puts them in place), and how a stored record
// of them (`rd-per-ex`) is read.
/** The settings an exercise keeps its own value of. */
export interface Own { blitzUse?: boolean; autoExplain?: boolean; read?: boolean; answer?: string }
export type OwnKey = keyof Own;
export const EXERCISES = ["practice", "debate", "find", "syllogism", "categories", "instance"];
const ANSWERS = ["off", "tap", "auto"];

/** A stored record of the exercises' own values, checked: what cannot be read is left out. */
export function normPerEx(raw: unknown): Record<string, Own> {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  const out: Record<string, Own> = {};
  if (!v || typeof v !== "object") return out;
  for (const ex of EXERCISES) {
    const o = (v as Record<string, unknown>)[ex]; if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>, own: Own = {};
    if (typeof r.blitzUse === "boolean") own.blitzUse = r.blitzUse;
    if (typeof r.autoExplain === "boolean") own.autoExplain = r.autoExplain;
    if (typeof r.read === "boolean") own.read = r.read;
    if (typeof r.answer === "string" && ANSWERS.includes(r.answer)) own.answer = r.answer;
    if (Object.keys(own).length) out[ex] = own;
  }
  return out;
}

