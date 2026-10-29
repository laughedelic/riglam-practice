// The cases of the tutor eval (eval/tutor/README.md): stored answers re-asked with today's card and ask, each with what the
// tutor's lines should say of every example. The stored answers and the labels are private (data-private/eval/); this file
// only rebuilds the requests the page would send for them and joins the labels in.
import DATA from "../../src/data/drill-data.json";
import { cardBody, explainAsk } from "../../src/ai-shared/card";
import type { AnswerView, DebateAnswer } from "../../src/ai-shared/card";
import { QCELL } from "../../src/ai-shared/debate";
import { leavesOpen, makeIndex, matchItem, noteCats } from "../../src/ai-shared/lookup";
import type { DataIndex } from "../../src/ai-shared/lookup";
import { CELLS, NEG_CELL, plainLabel, REL } from "../../src/ai-shared/relations";
import type { CellId, RelKey } from "../../src/ai-shared/relations";
import { grade, gradeDebate } from "../../src/domain/grading";
import { findPair, gradeFind, nameThing } from "../../src/domain/find";
import { FEATURE, inUniverse, pairOf } from "../../src/domain/universe";
import type { GradeResult, Pair } from "../../src/domain/types";
import type { Neg } from "../../src/ai-shared/relations";

export const ix: DataIndex = makeIndex(DATA as never);

export type Yn = "yes" | "no";
/**
 * What a side should say: yes or no; "open" when the example's name does not say the quality the side is about (the tutor's "unsure"
 * is right there); "debated" when the sources or readings differ, so no answer is graded right or wrong (a judge reads whether the
 * tutor names the readings); "unsure" when what the example names is unclear. A list: every answer in it is right.
 */
export type Kind = Yn | "unsure" | "open" | "debated";
export type Want = Kind | readonly Kind[];
export interface Label { a: Want; b: Want; why?: string }

/** One stored answer as data-private/eval/staging-answers.jsonl keeps it (compact: see README.md). */
export type Row = [col: string, mode: "cells" | "debate" | "find", catA: string | null, catB: string | null, a: string, b: string, neg: string, rel: RelKey, chosen: RelKey | "", cells: string[], qs: string];

export interface Example {
  cell: CellId;
  text: string;
  /** the page's verdict before the tutor: ok/bad (the term data settled it), cmp (not checked), open (the name leaves a side's quality open) */
  page: "ok" | "bad" | "cmp" | "open";
  /** what the data says, for a listed thing; else the label's; null when no one has labelled it yet */
  want: Label | null;
  from: "data" | "label" | "none";
}
export interface Case {
  id: string;
  mode: Row[1];
  src: string;
  pair: Pair;
  request: { kind: "explain"; cats: string[]; turns: { role: "user"; content: string }[] };
  /** pair-finding with a pair of the learner's own: the relation the pair has, if labelled */
  relation?: RelKey | null;
  asked?: RelKey;
  examples: Example[];
}

/** A fixed rng, so that the reference examples of a rebuilt pair are the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NOW = () => Date.UTC(2026, 9, 29);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(a|an|the) /, "");
export const labelKey = (p: Pick<Pair, "catA" | "catB" | "neg" | "a" | "b">, text: string) => `${p.catA ?? p.a}|${p.catB ?? p.b}|${p.neg ?? ""}|${norm(text)}`;

/** What the term data says of a listed thing for the pair, as the grading reads it; null when it is not listed or not usable for the pair. */
function dataLabel(p: Pair, text: string): Label | null {
  const [ca, cb] = [p.catA, p.catB];
  if (!ca || !cb) return null;
  const it = matchItem(ix, text, FEATURE.has(ca) || FEATURE.has(cb));
  if (!it || !inUniverse(ix, it, ca, cb)) return null;
  // a quality the name leaves open ("a car" for black) is open on that side, as the page reads it (src/domain/vague.ts)
  const side = (c: string, neg: boolean): Kind => (leavesOpen(it, c) ? "open" : it.c.includes(c) !== neg ? "yes" : "no");
  const a = side(ca, p.neg === "a" || p.neg === "ab"), b = side(cb, p.neg === "b" || p.neg === "ab");
  return { a, b, why: "practice list: " + it.n };
}

/** A listed thing whose name leaves a side open ("a car" for black things): open on that side, the data's answer on the other. */
function openLabel(p: Pair, text: string, given?: readonly string[]): Label | null {
  const it = matchItem(ix, text, FEATURE.has(p.catA!) || FEATURE.has(p.catB!));
  if (!it) return null;
  const vague = given ?? [p.catA!, p.catB!].filter((c) => leavesOpen(it, c));
  if (!vague.length) return null;
  const side = (c: string, neg: boolean): Kind => (vague.includes(c) ? "open" : it.c.includes(c) !== neg ? "yes" : "no");
  return { a: side(p.catA!, p.neg === "a" || p.neg === "ab"), b: side(p.catB!, p.neg === "b" || p.neg === "ab"), why: "practice list: " + it.n + " (its name leaves a side open)" };
}

export function buildCase(row: Row, n: number, labels: Record<string, Label & { rel?: RelKey }>, src = "staging"): Case {
  const [, mode, catA, catB, la, lb, negRaw, , chosen, cellTexts, qs] = row;
  const neg = (negRaw || undefined) as Neg | undefined;
  const r = rng(n + 1);
  let p: Pair;
  if (mode === "find") p = findPair(ix, chosen as RelKey, nameThing(ix, la), nameThing(ix, lb), r, NOW);
  else p = pairOf(ix, catA!, catB!, neg === "a" || neg === "ab" ? plainLabel(la) : la, neg === "b" || neg === "ab" ? plainLabel(lb) : lb, r, NOW, undefined, undefined, neg);
  p.id = `eval-${n}`;
  const cells = Object.fromEntries(CELLS.map((c, i) => {
    const t = cellTexts[i] ?? "";
    return [c, t === "-" ? { t: "", none: true } : { t: t.replace(/@$/, "") }];
  })) as AnswerView["cells"];
  let res: GradeResult, U: AnswerView;
  if (mode === "debate") {
    const ans: DebateAnswer[] = QCELL.map((c, i) => {
      const s = qs[i];
      return s === "a" ? { say: "accept", text: "" } : s === "w" ? { say: "why", text: cells[c].t } : s === "t" ? { say: "accept", text: "", timeout: true } : { say: null, text: "" };
    });
    res = gradeDebate(ix, p, { ans, rel: (chosen || null) as RelKey | null } as never);
    U = { debate: true, rel: (chosen || null) as RelKey | null, cells, ans, res };
  } else if (mode === "find") {
    res = gradeFind(ix, p, { rel: chosen as RelKey, cells } as never);
    U = { find: true, rel: chosen as RelKey, cells, res };
  } else {
    res = grade(ix, p, { rel: chosen as RelKey, cells } as never);
    U = { rel: chosen as RelKey, cells, res };
  }
  const own = !!p.own;
  const examples: Example[] = [];
  for (const c of CELLS) {
    const t = cells[c].t.trim(), rc = res.cells[c];
    if (!t || cells[c].none) continue;   // an example in a cell that must be empty is asked of the tutor too
    const page = rc.v === "cmp" ? (rc.vague?.length ? "open" : "cmp") : rc.v === "ok" ? "ok" : "bad";
    const d = own || rc.vague?.length ? null : dataLabel(p, t);
    const l = labels[labelKey(p, t)];
    // an open side is the learner's to name: the tutor should say unsure there
    // a side the name leaves open is open, even where the other side already rules the example out of the cell
    // (a hand label, where there is one, says how that open side reads in this pair: the frying pan is usually hot)
    const want = rc.vague?.length ? l ?? openLabel(p, t, rc.vague) : d ?? l ?? (own ? null : openLabel(p, t)) ?? null;
    examples.push({ cell: c, text: t, page: page as Example["page"], want, from: d ? "data" : l ? "label" : "none" });
  }
  const request = { kind: "explain" as const, cats: noteCats(ix, p), turns: [{ role: "user" as const, content: cardBody(ix, p, U) + "\n\n" + explainAsk({ ...U, own } as never, !!p.neg) }] };
  const rl = labels[`${p.a}|${p.b}|relation`];
  return { id: `${src}-${String(n).padStart(2, "0")}`, mode, src, pair: p, request, examples, ...(own ? { asked: chosen as RelKey, relation: rl?.rel ?? null } : {}) };
}

export { REL, NEG_CELL };
