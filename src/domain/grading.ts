// Checking an answer: which cells can hold something, whether the relation is right, and whether an example written in
// a cell really belongs there. Three separate checks: the relation, which cells can be filled (both deterministic),
// and the examples themselves (deterministic when the item is in the practice list, otherwise "cmp" until Claude
// verifies them, see verdict.ts).
import type { DebateAnswer } from "../ai-shared/card";
import { QCELL } from "../ai-shared/debate";
import { matchItem, pairCats } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS, REL, refOf } from "../ai-shared/relations";
import type { CellId, PairLike, RelKey } from "../ai-shared/relations";
import type { CellResult, DebateInput, GradeDraft, GradeResult, PracticeAnswer } from "./types";
import { FEATURE, inUniverse } from "./universe";
import { cap } from "./util";

/** The check of an example the term data knows: right ("ok") or in another cell ("bad"), with the text to show. */
export interface Judgement {
  v: "ok" | "bad";
  msg: string[];
}

/** The chain of terms from a type up to Existent, shortened to three, lower-cased; the page turns the separator into arrows. */
export function termLine(ix: DataIndex, t: string): string {
  const ch = (ix.DATA.chains && ix.DATA.chains[t]) || null;
  return ch ? ch.slice(0, 3).join("").toLowerCase() : (t || "").toLowerCase();
}

/**
 * Where the learner's example `t` belongs for the pair, compared with the cell `c` it was written in. Null when the
 * example is not in the practice list (or not usable for these categories), which the caller shows as "not checked".
 * `cats` are the pair's categories when they are known; otherwise they are looked up from the labels.
 */
export function judgeText(ix: DataIndex, p: PairLike, c: CellId, t: string, cats?: readonly (string | null | undefined)[]): Judgement | null {
  const [ca, cb] = cats || pairCats(ix, p);
  if (!ca || !cb) return null;
  const feat = FEATURE.has(ca) || FEATURE.has(cb);
  const it = matchItem(ix, t, feat);
  if (!it) return null;
  if (!inUniverse(ix, it, ca, cb)) return null;
  const x = it.c.includes(ca), y = it.c.includes(cb);
  const where = x && y ? "both" : x ? "anb" : y ? "bna" : "nei";
  const nm = cap(t.trim().replace(/[.!]+$/, ""));
  if (where === c) {
    if (it.ne) {
      const ref = p.ex && p.ex[c], better = ref && !(matchItem(ix, ref) || { ne: false }).ne;
      return { v: "ok", msg: ["Right. ", nm + " does not exist, and a non-existent counts as neither." + (better ? " An existent such as " + ref + " is the better example when there is one." : "")] };
    }
    return { v: "ok", msg: ["Right. ", nm + ": " + termLine(ix, it.t) + "."] };
  }
  return { v: "bad", msg: ["Belongs elsewhere. ", nm + " is " + { both: "both", anb: "A but not B", bna: "B but not A", nei: "neither" }[where] + " (" + termLine(ix, it.t) + ")."] };
}

/** Checks a practice answer: the relation chosen, then each cell (emptiness, or the example written in it). */
export function grade(ix: DataIndex, p: PairLike, u: PracticeAnswer): GradeResult {
  if (!u.rel) throw new Error("grade: no relation was chosen");
  const emptyCells = REL[u.rel].empty;
  const cells = {} as Record<CellId, CellResult>;
  for (const c of CELLS) {
    const key = refOf(p, c), why = (p.why && p.why[c]) || "";
    const none = emptyCells.includes(c) || u.cells[c].none, t = (u.cells[c].t || "").trim();
    let v: string, msg: string[], kind: CellResult["kind"] = "occ";
    if (none) {
      if (key) { v = "bad"; msg = ["Counter-example: ", key]; } else { v = "ok"; msg = ["Right, empty. ", why]; }
    } else if (t) {
      if (!key) { v = "bad"; msg = ["Nothing can go here. ", why]; }
      else {
        kind = "ex";
        const j = judgeText(ix, p, c, t);
        if (j) { v = j.v; msg = j.msg; if (j.v === "bad") msg[1] += " Example: " + key + "."; } else { v = "cmp"; msg = ["Not checked. ", "Reference: " + key + "."]; }
      }
    } else if (key) { v = "bad"; msg = ["Missing. For example: ", key]; } else { v = "ok"; msg = ["Right, empty. ", why]; }
    cells[c] = { v, msg, kind };
  }
  return summarize({ relOk: u.rel === p.relation && !u.late, cells });
}

/** What three answers of the debate give: Q1 accepted = no common locus; Q2 and Q3 accepted = pervasion each way. Null when time ran out on one of them, "bad" when they contradict each other. */
export function deriveRel(ans: readonly DebateAnswer[]): RelKey | "bad" | null {
  const s = ans.slice(0, 3).map((a) => a.say);
  if (s.some((x) => x !== "accept" && x !== "why")) return null; // time ran out on one of them
  const [x, y, z] = s.map((v) => v === "accept");
  if (x && !y && !z) return "con";
  if (!x && y && z) return "mi";
  if (!x && y && !z) return "3ab";
  if (!x && !y && z) return "3ba";
  if (!x && !y && !z) return "4";
  return "bad"; // accepting no-common-locus together with a pervasion
}

/** Checks a debate: each of the four questions has one counter-example cell, which the learner accepted or answered with an example. */
export function gradeDebate(ix: DataIndex, p: PairLike, u: DebateInput): GradeResult {
  const cells = {} as Record<CellId, CellResult>, dec = {} as Record<CellId, boolean>;
  QCELL.forEach((c, i) => {
    const a = u.ans[i], ref = refOf(p, c), has = !!ref, why = (p.why && p.why[c]) || "", t = (a.text || "").trim();
    let v: string, msg: string[], kind: CellResult["kind"] = "occ", dok = false;
    if (a.say === "accept") {
      if (!has) { v = "ok"; msg = ["Right. ", why]; dok = true; } else { v = "bad"; msg = ["Counter-example: ", ref as string]; }
    } else if (a.say === "why") {
      if (!has) { v = "bad"; msg = ["Nothing can be posited. ", why]; }
      else {
        dok = true; kind = "ex";
        if (!t) { v = "bad"; msg = [a.timeout ? "Time ran out. " : "No example. ", "For example: " + ref + "."]; }
        else {
          const j = judgeText(ix, p, c, t, [p.catA, p.catB]);
          if (j) { v = j.v; msg = j.msg.slice(); if (v === "bad") msg[1] += " Example: " + ref + "."; }
          else { v = "cmp"; msg = ["Not checked. ", "Reference: " + ref + "."]; }
        }
      }
    } else { v = "bad"; msg = ["Time ran out. ", has ? "For example: " + ref + "." : why]; }
    cells[c] = { v, msg, kind }; dec[c] = dok;
  });
  return summarize({ relOk: u.rel === p.relation && !u.late, cells, dec, implied: deriveRel(u.ans) });
}

/** Adds the counts and the overall grade to a draft. It changes the object it is given and returns it, so that verdicts that arrive later can be counted in again. */
export function summarize(res: GradeDraft): GradeResult {
  const out = res as GradeResult, cs = CELLS.map((c) => res.cells[c]);
  out.occBad = cs.filter((r) => r.kind === "occ" && r.v === "bad").length;
  out.exBad = cs.filter((r) => r.kind === "ex" && r.v === "bad").length;
  out.exOpen = cs.filter((r) => r.v === "cmp").length;
  out.exN = cs.filter((r) => r.kind === "ex").length;
  out.overall = !out.relOk ? "bad" : (out.occBad || out.exBad) ? "part" : out.exOpen ? "pend" : "ok";
  return out;
}
