// The stamp of the term data: what grades an answer, as one short string.
import type { DrillData } from "../ai-shared/data";

/** What the definitions and notes add to the open data (src/data/course.js, merge): a term's fields, and the groups' notes at the top. */
const COURSE_FIELDS = ["d", "d_ru", "note"];

/**
 * The open tier of the term data as one short string, the same whether the definitions and notes are merged in or locked: two copies with the same
 * stamp grade every answer alike. An attempt kept on the device carries it, and is not put back under other data (src/app/shell/keep.ts).
 */
export function dataStamp(data: DrillData): string {
  const terms: Record<string, unknown> = {};
  for (const [key, term] of Object.entries(data.terms ?? {})) {
    const t: Record<string, unknown> = { ...term };
    for (const f of COURSE_FIELDS) delete t[f];
    terms[key] = t;
  }
  const text = JSON.stringify({ ...data, terms, notes: undefined });
  let h = 2166136261, g = 5381; // FNV-1a and djb2: two 32-bit hashes, so that two different copies are next to never taken for one
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h = Math.imul(h ^ c, 16777619); g = (Math.imul(g, 33) + c) | 0; }
  return (h >>> 0).toString(36) + "." + (g >>> 0).toString(36) + "." + text.length.toString(36);
}
