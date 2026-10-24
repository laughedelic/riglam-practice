// The reference examples (docs/DATA.md) as the tutor and the page read them: the types of the format (written by
// src/data/examples.js), a tolerant reader, the name index, matching a learner's words to the examples, and the facts the
// tutor's lookup tool returns. Pure functions of the data, like lookup.ts.
import { spelled, stripDet, upChain } from "./lookup";
import type { DataIndex } from "./lookup";

/**
 * One example. The device part has the fields down to `gloss`, and `s`; the server's has `src`, `web`, `base` and `mem` instead of `s`.
 * Classes are names of terms of the open data.
 */
export interface Example {
  /** its name: "a clay pot" */
  n: string;
  /** other names a learner may use, in English and Russian (the server's part has Chinese and Tibetan too) */
  al?: string[];
  /** the classes it is an instance of */
  cls?: string[];
  /** the classes the sources say it is not */
  not?: string[];
  /** it does not exist (the horn of a rabbit) */
  ne?: boolean;
  /** 1 (a plain thing) to 4 */
  lv: number;
  /** the stage of the learning ladder, 1 to 9 (format 3); format 2 has none, and a level counts as stage level + 5 (src/domain/stages.ts) */
  st?: number;
  /** the operations applied to its base, which the level is computed from */
  sc?: number;
  /** thing, representation, relation, negation */
  k?: string;
  /** combination (two things taken together), statement, ... */
  f?: string;
  /** confirmed (in two or more sources), textbook (in the course textbook), commentator */
  cf?: string;
  /** how sure the gloss is, when not high */
  cn?: string;
  /** "any item of the class would do" */
  inc?: boolean;
  /** the background it needs: glossed, expert */
  bg?: string;
  /** one sentence on why it is a good example */
  gloss?: string;
  /** device part: the ids of the published sources it is in */
  s?: string[];
  /** server part: the places in the sources, as [id, place] */
  src?: [string, string][];
  web?: string[];
  base?: string;
  mem?: string[];
}

export interface Examples {
  format: string;
  version: number;
  /** the stamp of the open data the device part was checked against */
  built?: string;
  /** source id -> its tier: "open" or "course" */
  sources: Record<string, { tier?: string }>;
  items: Example[];
}

/** The levels of the examples, from 1 (a plain thing) to 4. */
export const LEVELS: readonly number[] = [1, 2, 3, 4];

/** The levels a learner draws examples from: any mix, never none. */
export type Levels = readonly number[];

/** A new device draws from level 1 alone, plain things being the gentlest start; the exercise offers the next level once the answers come easily. */
export const DEFAULT_LEVELS: Levels = [1];

/** The valid levels in a stored value (a list, or "1,2"), once each, in order; the default when none is valid. */
export function normLevels(raw: unknown): number[] {
  const list: unknown[] = typeof raw === "string" ? raw.split(",").map((s) => (s.trim() ? +s : NaN)) : Array.isArray(raw) ? raw : [];
  const ok = LEVELS.filter((l) => list.includes(l));
  return ok.length ? ok : [...DEFAULT_LEVELS];
}

/** Levels 1 up to `max`. */
export const upTo = (max: number): number[] => LEVELS.filter((l) => l <= max);

const LISTS = ["al", "cls", "not", "s"] as const;
const TEXTS = ["k", "f", "cf", "cn", "bg", "gloss"] as const;
const FLAGS = ["ne", "inc"] as const;
const isTexts = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Whether `it` has a name and a level and every optional field the code reads is of its type (a wrong one would throw where it is read). */
function usable(it: unknown): it is Example {
  const e = it as Record<string, unknown> | null;
  if (!e || typeof e !== "object" || typeof e.n !== "string" || !e.n.trim() || typeof e.lv !== "number") return false;
  return LISTS.every((f) => e[f] === undefined || isTexts(e[f]))
    && TEXTS.every((f) => e[f] === undefined || typeof e[f] === "string")
    && FLAGS.every((f) => e[f] === undefined || typeof e[f] === "boolean")
    && (e.sc === undefined || typeof e.sc === "number") && (e.st === undefined || typeof e.st === "number");
}

/** The usable examples in `value` (a name, a level, and optional fields of their types), or null when it is not the format at all: data from elsewhere costs examples, never an error. */
export function readExamples(value: unknown): Examples | null {
  const v = value as Partial<Examples> | null;
  if (!v || typeof v !== "object" || !Array.isArray(v.items)) return null;
  const items = v.items.filter(usable);
  return { format: String(v.format ?? ""), version: Number(v.version ?? 0), ...(typeof v.built === "string" ? { built: v.built } : {}), sources: v.sources && typeof v.sources === "object" ? v.sources : {}, items };
}

/** The examples with their names indexed: a normalized name or alias, also without its article, gives every example that has it. */
export interface ExampleIndex {
  items: Example[];
  BYNAME: Record<string, Example[]>;
}

export function makeExampleIndex(data: Examples): ExampleIndex {
  const BYNAME: Record<string, Example[]> = Object.create(null);
  for (const it of data.items) {
    const keys = new Set([it.n, ...(it.al ?? [])].flatMap((s) => { const k = spelled(s); return [k, stripDet(k)]; }).filter(Boolean));
    for (const k of keys) (BYNAME[k] ??= []).push(it);
  }
  return { items: data.items, BYNAME };
}

/** Every example a learner's words name, so that a name two examples share shows as two; empty when none does. */
export function matchExamples(eix: ExampleIndex, text: unknown): Example[] {
  const k = spelled(text);
  if (!k) return [];
  const bare = stripDet(k);
  // the name without its article first: every name is indexed both ways, so "a kipa" finds what "kipa" finds, never only the example that has "a kipa" as an alias
  for (const t of [bare, k, bare.replace(/s$/, ""), bare.replace(/es$/, "")]) if (eix.BYNAME[t]) return eix.BYNAME[t];
  return [];
}

/** What the tutor is told about an example: its classes with their chains up to Existent, what it is not, its level, kind and confirmation, and the gloss. */
export function exampleFacts(ix: DataIndex, it: Example) {
  const known = (c: string) => Object.hasOwn(ix.DATA.terms, c);
  return {
    item: it.n,
    existent: !it.ne,
    classes: (it.cls ?? []).filter(known).map((c) => upChain(ix, c).join(" > ")),
    ...(it.not?.length ? { not: it.not.filter(known) } : {}),
    level: it.lv,
    ...(it.k ? { kind: it.k } : {}),
    ...(it.f ? { form: it.f } : {}),
    ...(it.cf ? { confirmation: it.cf } : {}),
    ...(it.gloss ? { why: it.gloss } : {}),
  };
}

/** How well the sources confirm an example, best first. */
const CONFIRMED = ["confirmed", "textbook", "commentator"];
const rank = (ex: Pick<Example, "cf">) => { const i = CONFIRMED.indexOf(ex.cf ?? ""); return i < 0 ? CONFIRMED.length : i; };

/**
 * Examples of a term, for its definition card and the tutor's examples_of: its own (an instance of the term itself) before those of its subclasses, then the lowest
 * level, the better confirmed, and the name. A statement is not an example of a term and an example the sources say it is not an instance of
 * the term does not count. Up to `max`; after the term's own, as many different subclasses as possible first, so that a broad term shows a
 * spread and not three of one kind. Only examples of `levels` (all by default). The same list for the same data.
 */
export function examplesFor(ix: DataIndex, items: readonly Example[], term: string, max = 3, levels: Levels = LEVELS): Example[] {
  if (!Object.hasOwn(ix.DATA.terms, term)) return [];
  const ranked: { ex: Example; own: boolean; cls: string }[] = [];
  for (const ex of items) {
    if (ex.k === "statement" || !levels.includes(ex.lv) || ex.not?.includes(term)) continue;
    const classes = (ex.cls ?? []).filter((c) => upChain(ix, c).includes(term));
    if (classes.length) ranked.push({ ex, own: classes.includes(term), cls: classes.includes(term) ? term : classes[0] });
  }
  ranked.sort((a, b) => Number(b.own) - Number(a.own) || a.ex.lv - b.ex.lv || rank(a.ex) - rank(b.ex) || a.ex.n.localeCompare(b.ex.n));
  const out = ranked.filter((r) => r.own).slice(0, max);
  const seen = new Set<string>();
  for (const r of ranked) {
    if (out.length < max && !r.own && !seen.has(r.cls)) {
      out.push(r);
      seen.add(r.cls);
    }
  }
  for (const r of ranked) if (out.length < max && !out.includes(r)) out.push(r);
  return out.map((r) => r.ex);
}
