// Answers made from the practice list, so that every example's label comes from the term data and needs no one's review.
// A fixed seed draws the same set every time. The draw leans to what the tutor finds hard: pairs with a quality a name can leave open
// (a color, a material), negated sides, things the name leaves open, and things written in the wrong cell or for a wrong relation.
import { CELLS } from "../../src/ai-shared/relations";
import type { CellId, Neg, RelKey } from "../../src/ai-shared/relations";
import { leavesOpen } from "../../src/ai-shared/lookup";
import type { Item } from "../../src/ai-shared/data";
import { buildPool, cellsFor, FEATURE, makePair, negateCells, relOfCells } from "../../src/domain/universe";
import { ix, labelKey } from "./cases";
import type { Label, Row } from "./cases";
import type { Example as RefExample } from "../../src/ai-shared/examples";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RELS: readonly RelKey[] = ["mi", "con", "3ab", "3ba", "4"];

/** `n` answers: about 6 in 10 four-cells, the rest debates. */
export function generatedRows(n: number, seed = 20261029): Row[] {
  const r = rng(seed), pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  // a pair with a feature category comes up three times as often: its things can leave the quality open
  const pool = buildPool(ix).filter((e) => e.a !== e.b).flatMap((e) => (FEATURE.has(e.a) || FEATURE.has(e.b) ? [e, e, e] : [e]));
  const rows: Row[] = [];
  const seen = new Set<string>();
  while (rows.length < n) {
    const e = pick(pool);
    const neg = (r() < 1 / 3 ? pick(["a", "b", "ab"] as const) : undefined) as Neg | undefined;
    const p = makePair(ix, e, r, () => Date.UTC(2026, 9, 29), undefined, undefined, neg);
    const key = `${p.catA}|${p.catB}|${neg ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = neg ? negateCells(cellsFor(ix, p.catA!, p.catB!), neg) : cellsFor(ix, p.catA!, p.catB!);
    const rel = relOfCells(cells);
    const sense = ix.CAT[p.catA!].sense || ix.CAT[p.catB!].sense, body = ix.DATA.bodySkip.includes(p.catA!) || ix.DATA.bodySkip.includes(p.catB!);
    const open = ix.DATA.items.filter((it: Item) => leavesOpen(it, p.catA, p.catB) && !(sense && it.comp) && !(body && it.body));
    const all = CELLS.flatMap((c) => cells[c].map((it) => ({ c, it })));
    // what goes in a cell: the right kind of thing mostly, else one from another cell, or one the name leaves open
    const fill = (c: CellId): string => {
      const x = r();
      if (open.length && x < 0.15) return pick(open).n;
      const others = all.filter((o) => o.c !== c);
      if (others.length && (x < 0.35 || !cells[c].length)) return cells[c].length || r() < 0.3 ? pick(others).it.n : "-";
      return cells[c].length ? pick(cells[c]).n : "-";
    };
    const neg2 = neg ?? "";
    if (r() < 0.6) {
      const chosen = r() < 0.7 ? rel : pick(RELS.filter((x) => x !== rel));
      rows.push(["g", "cells", p.catA!, p.catB!, p.a, p.b, neg2, rel, chosen, CELLS.map(fill), ""]);
    } else {
      // a debate question asks whether its cell can be empty: Why? with an example says no, Accept says yes
      const ex: string[] = [], qs: string[] = [];
      for (const c of CELLS) {
        const why = cells[c].length ? r() < 0.85 : r() < 0.2;
        if (why) { const t = fill(c); ex.push(t === "-" ? pick(all.length ? all : [{ c, it: { n: "a chair" } as Item }]).it.n : t); qs.push("w"); }
        else { ex.push("-"); qs.push("a"); }
      }
      rows.push(["g", "debate", p.catA!, p.catB!, p.a, p.b, neg2, rel, rel, ex, qs.join("")]);
    }
  }
  return rows;
}

/**
 * Answers for pairs of Dudra categories, written with the source-verified reference examples (the device part of GET /api/course/examples):
 * the sources' own wording ("the color of a white conch", "a blue sapphire"), which the practice list does not have. An example's class
 * gives its categories where every listed thing of that type has the same Dudra categories; one the sources say it is not never counts as one.
 * Only examples of levels 1 and 2 that the sources confirm or a textbook gives, and whose classes agree.
 * Returns the answers and their labels, under the keys `labels.json` uses.
 */
export function referenceRows(examples: readonly RefExample[], n: number, seed = 20261030): { rows: Row[]; labels: Record<string, Label> } {
  const r = rng(seed), pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const dudra = new Set(Object.keys(ix.CAT).filter((c) => ix.CAT[c].kind !== "everyday"));
  // per type of the practice list, its Dudra categories, where all its things agree
  const byType = new Map<string, Set<string>[]>();
  for (const it of ix.DATA.items) (byType.get(it.t) ?? byType.set(it.t, []).get(it.t)!).push(new Set(it.c.filter((c) => dudra.has(c))));
  const typeCats = new Map<string, Set<string>>();
  for (const [t, ls] of byType) { const k = (s: Set<string>) => [...s].sort().join(); if (ls.every((s) => k(s) === k(ls[0]))) typeCats.set(t, ls[0]); }
  const known = examples.flatMap((ex) => {
    if (ex.k === "statement" || ex.ne || (ex.lv ?? 9) > 2 || (ex.cf !== "confirmed" && ex.cf !== "textbook")) return [];
    // two classes that give different categories (a feeling "in the retinue of a mental consciousness") leave it to the tutor's reading
    const sets = (ex.cls ?? []).map((c) => typeCats.get(c)).filter((s): s is Set<string> => !!s);
    const cats = sets[0];
    if (!cats || sets.some((s) => [...s].sort().join() !== [...cats].sort().join())) return [];
    if ([...cats].some((c) => ex.not?.includes(ix.CAT[c].term ?? ""))) return [];
    const text = /^[A-Z][a-z]+ [A-Z]/.test(ex.n) || /^Buddha/.test(ex.n) ? ex.n : ex.n[0].toLowerCase() + ex.n.slice(1);
    return [{ text, cats, why: `reference: ${ex.n} (${(ex.cls ?? []).join(", ")}; ${ex.cf ?? "?"})` }];
  });
  const pool = buildPool(ix).filter((e) => e.a !== e.b && dudra.has(e.a) && dudra.has(e.b));
  const rows: Row[] = [], labels: Record<string, Label> = {}, seen = new Set<string>();
  let tries = 0;
  while (rows.length < n && tries++ < 5000) {
    const e = pick(pool);
    const neg = (r() < 1 / 4 ? pick(["a", "b"] as const) : undefined) as Neg | undefined;
    const p = makePair(ix, e, r, () => Date.UTC(2026, 9, 29), undefined, undefined, neg);
    const key = `${p.catA}|${p.catB}|${neg ?? ""}`;
    if (seen.has(key)) continue;
    const na = neg === "a", nb = neg === "b";
    const cells: Record<CellId, typeof known> = { both: [], anb: [], bna: [], nei: [] };
    for (const k of known) { const a = k.cats.has(p.catA!) !== na, b = k.cats.has(p.catB!) !== nb; cells[a && b ? "both" : a ? "anb" : b ? "bna" : "nei"].push(k); }
    const filled = CELLS.filter((c) => cells[c].length);
    if (filled.length < 2) continue;
    seen.add(key);
    const all = CELLS.flatMap((c) => cells[c].map((k) => ({ c, k })));
    const fill = (c: CellId): string => {
      const misplace = r() < 0.25;
      const k = !misplace && cells[c].length ? pick(cells[c]) : pick(all.filter((o) => o.c !== c)).k;
      const a = k.cats.has(p.catA!) !== na, b = k.cats.has(p.catB!) !== nb;
      labels[labelKey(p, k.text)] = { a: a ? "yes" : "no", b: b ? "yes" : "no", why: k.why };
      return k.text;
    };
    const rel = relOfCells(neg ? negateCells(cellsFor(ix, p.catA!, p.catB!), neg) : cellsFor(ix, p.catA!, p.catB!));
    if (r() < 0.6) rows.push(["r", "cells", p.catA!, p.catB!, p.a, p.b, neg ?? "", rel, r() < 0.7 ? rel : pick(RELS.filter((x) => x !== rel)), CELLS.map((c) => (cells[c].length || r() < 0.3 ? fill(c) : "-")), ""]);
    else {
      const ex: string[] = [], qs: string[] = [];
      for (const c of CELLS) if (cells[c].length ? r() < 0.85 : r() < 0.2) { ex.push(fill(c)); qs.push("w"); } else { ex.push("-"); qs.push("a"); }
      rows.push(["r", "debate", p.catA!, p.catB!, p.a, p.b, neg ?? "", rel, rel, ex, qs.join("")]);
    }
  }
  return { rows, labels };
}
