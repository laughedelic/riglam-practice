// What the term data says about a term or a category, as the small objects the tutor card and the lookup tool return.
import type { DataIndex } from "./lookup";

export type Facts = Record<string, unknown>;

export function termFacts(ix: DataIndex, name: string): Facts | null {
  const t = ix.DATA.terms[name];
  if (!t) return null;
  const f: Facts = { term: t.name, definition: t.d, chapter: t.ch, chain: (ix.DATA.chains[name] || []).join(" > ") };
  if (t.d_ru) f.definition_ru = t.d_ru;
  if (t.mi && t.mi.length) f.mutually_inclusive = t.mi;
  if (t.contra && t.contra.length) f.contradictory = t.contra;
  // three and four possibilities the knowledge base states for this term
  if (t.included_in && t.included_in.length) f.three_possibilities_included_in = t.included_in;
  if (t.overlaps && t.overlaps.length) f.four_possibilities_with = t.overlaps;
  if (t.note) f.kb_note = t.note.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  if (t.wylie) f.wylie = t.wylie;
  return f;
}

export function catFacts(ix: DataIndex, cid: string, label: string): Facts | null {
  const c = ix.CAT[cid];
  if (!c) return null;
  if (c.kind === "dudra") return Object.assign({ label, type: c.type }, termFacts(ix, c.term ?? ""));
  return { label, everyday_category: true, maps_to: c.type };
}
