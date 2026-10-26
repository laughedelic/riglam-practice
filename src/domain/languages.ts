// The languages a term can be shown in beside its English name, and how its name is written in each. English is always shown. Russian is the one
// language that also has definitions (the page keeps it as the definitions' language, state.defLang); the others are names only, for now.
import type { Term } from "../ai-shared/data";

export type LangId = "ru" | "bo" | "skt" | "zh";
/** The languages, in the order a term's names are shown. */
export const LANGS: readonly { id: LangId; name: string; note: string }[] = [
  { id: "ru", name: "Russian", note: "the name of each term and, where there is one, its definition" },
  { id: "bo", name: "Tibetan", note: "the name in Tibetan script, with its Wylie transliteration" },
  { id: "skt", name: "Sanskrit", note: "the name in transliteration" },
  { id: "zh", name: "Chinese", note: "the name in traditional and simplified characters, with its pinyin" },
];
/** The languages that are only names (Russian is the definitions' language, kept apart). */
export const NAME_LANGS: readonly LangId[] = ["bo", "skt", "zh"];

/** A stored choice of languages (JSON or a list), checked: the name-only languages in their order, none when it cannot be read. */
export function normLangs(raw: unknown): LangId[] {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(v) ? NAME_LANGS.filter((id) => v.includes(id)) : [];
}

/** A term's name in one language: `main` in the language's own script, `rest` the transliteration or the other writing of it, in brackets. */
export interface TermName { id: LangId; lang: string; main: string; rest: string }

/**
 * The names of a term in the languages that are on, in the order of LANGS; a language the term has no name in is left out.
 * Tibetan is `བོད (wylie)`; Chinese `traditional（simplified，pinyin）`, the simplified only where it differs.
 */
export function termNames(t: Pick<Term, "ru" | "wylie" | "bo" | "skt" | "zh" | "zhs" | "py">, on: readonly string[]): TermName[] {
  const out: TermName[] = [];
  for (const { id } of LANGS) {
    if (!on.includes(id)) continue;
    if (id === "ru" && t.ru) out.push({ id, lang: "ru", main: t.ru, rest: "" });
    else if (id === "skt" && t.skt) out.push({ id, lang: "sa-Latn", main: t.skt, rest: "" });
    else if (id === "bo" && (t.bo || t.wylie)) out.push({ id, lang: t.bo ? "bo" : "", main: t.bo || t.wylie!, rest: t.bo && t.wylie ? ` (${t.wylie})` : "" });
    else if (id === "zh" && (t.zh || t.zhs)) {
      const inner = [t.zhs && t.zhs !== t.zh ? t.zhs : "", t.py].filter(Boolean).join("，");
      out.push({ id, lang: "zh-Hant", main: t.zh || t.zhs!, rest: inner ? `（${inner}）` : "" });
    }
  }
  return out;
}
