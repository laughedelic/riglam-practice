// Checking an answer: which cells can hold something, whether the relation is right, and whether an example written in
// a cell really belongs there. Three separate checks: the relation, which cells can be filled (both deterministic),
// and the examples themselves (deterministic when the item is in the practice list, otherwise "cmp" until Claude
// verifies them, see verdict.ts; an item whose name leaves the cell's quality open is "cmp" for good, vague.ts).
import type { DebateAnswer } from "../ai-shared/card";
import { QCELL } from "../ai-shared/debate";
import { matchItem, pairCats, sameNames } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS, NEG_CELL, REL, refOf } from "../ai-shared/relations";
import type { CellId, PairLike, RelKey } from "../ai-shared/relations";
import type { CellResult, DebateInput, GradeDraft, GradeResult, PracticeAnswer } from "./types";
import { FEATURE, inUniverse } from "./universe";
import { cap } from "./util";
import { vagueVerdict } from "./vague";

/**
 * The check of an example the term data knows: right ("ok") or in another cell ("bad"), with the text to show; or open ("cmp" with `open`, the
 * categories its name leaves open), which no one settles: the learner is asked to name the quality.
 */
export interface Judgement {
  v: "ok" | "bad" | "cmp";
  msg: string[];
  open?: string[];
}

/**
 * The chain of terms from a type up to Existent, shortened to three, lower-cased; the page turns the separator into "is a". It goes on up to the
 * terms `to` (the pair's) when they are on it, and names one the chain reaches only by a term mutually inclusive with it right after that term:
 * "... functional thing, existent, hidden phenomenon", since the chains end at existent, which hidden phenomenon is the same as.
 */
export function termLine(ix: DataIndex, t: string, to: readonly string[] = []): string {
  const ch = (ix.DATA.chains && ix.DATA.chains[t]) || null;
  if (!ch) return (t || "").toLowerCase();
  let end = Math.min(ch.length, 3);
  const after = new Map<number, string>();
  for (const term of to) {
    const i = ch.indexOf(term), j = i >= 0 ? i : ch.findIndex((n) => sameNames(ix, term).has(n));
    if (j < 0) continue;
    end = Math.max(end, j + 1);
    if (i < 0) after.set(j, term);
  }
  return ch.slice(0, end).flatMap((n, k) => (after.has(k) ? [n, after.get(k)!] : [n])).join("\uE000").toLowerCase();
}

/**
 * Where the learner's example `t` belongs for the pair, compared with the cell `c` it was written in. Null when the
 * example is not in the practice list (or not usable for these categories), which the caller shows as "not checked".
 * `cats` are the pair's categories when they are known; otherwise they are looked up from the labels. With a negated side, the thing's place in
 * the plain pair moves as NEG_CELL says.
 */
export function judgeText(ix: DataIndex, p: PairLike, c: CellId, t: string, cats?: readonly (string | null | undefined)[]): Judgement | null {
  const [ca, cb] = cats || pairCats(ix, p);
  if (!ca || !cb) return null;
  const feat = FEATURE.has(ca) || FEATURE.has(cb);
  const it = matchItem(ix, t, feat);
  if (!it) return null;
  const vague = vagueVerdict(ix, it, t, [ca, cb], c, p.neg);
  if (vague) return vague.v === "cmp" ? { v: "cmp", msg: vague.msg, open: [ca, cb].filter((_, k) => vague.open[k]) } : { v: "bad", msg: vague.msg };
  if (!inUniverse(ix, it, ca, cb)) return null;
  const x = it.c.includes(ca), y = it.c.includes(cb), plain: CellId = x && y ? "both" : x ? "anb" : y ? "bna" : "nei";
  const to = [ca, cb].flatMap((id) => ix.CAT[id]?.term ?? []);           // the line goes on up to the pair's terms
  const where = p.neg ? NEG_CELL[p.neg][plain] : plain;
  const nm = cap(t.trim().replace(/[.!]+$/, ""));
  if (where === c) {
    if (it.ne && p.neg) return { v: "ok", msg: ["Right. ", nm + " does not exist, and a “non-” term takes in what does not exist."] };
    if (it.ne) {
      const ref = p.ex && p.ex[c], better = ref && !(matchItem(ix, ref) || { ne: false }).ne;
      return { v: "ok", msg: ["Right. ", nm + " does not exist, and a non-existent counts as neither." + (better ? " An existent such as " + ref + " is the better example when there is one." : "")] };
    }
    return { v: "ok", msg: ["Right. ", nm + ": " + termLine(ix, it.t, to) + "."] };
  }
  return { v: "bad", msg: ["Belongs elsewhere. ", nm + " is " + { both: "both", anb: "A but not B", bna: "B but not A", nei: "neither" }[where] + " (" + termLine(ix, it.t, to) + ")."] };
}

/**
 * How a check says the course's reference example of a case the learner did not fill: `refs` (Detailed guidance, the default) names it; past Detailed
 * the message only says that there is one, and Explain can still ask Claude for it. An example the learner wrote in the wrong place keeps the reference.
 */
export interface GradeOptions { refs?: boolean }
/** The message of a case whose reference example is not named (GradeOptions). */
const THERE_IS = "There is an example.";

/** Checks a practice answer: the relation chosen, then each cell (emptiness, or the example written in it). */
export function grade(ix: DataIndex, p: PairLike, u: PracticeAnswer, o: GradeOptions = {}): GradeResult {
  const refs = o.refs !== false;
  if (!u.rel) throw new Error("grade: no relation was chosen");
  const emptyCells = REL[u.rel].empty;
  const cells = {} as Record<CellId, CellResult>;
  for (const c of CELLS) {
    const key = refOf(p, c), why = (p.why && p.why[c]) || "";
    const none = emptyCells.includes(c) || u.cells[c].none, t = (u.cells[c].t || "").trim();
    let v: string, msg: string[], kind: CellResult["kind"] = "occ", open: string[] | undefined;
    if (none) {
      if (key) { v = "bad"; msg = ["Counter-example: ", refs ? key : "there is one."]; } else { v = "ok"; msg = ["Right, empty. ", why]; }
    } else if (t) {
      if (!key) { v = "bad"; msg = ["Nothing can go here. ", why]; }
      else {
        kind = "ex";
        const j = judgeText(ix, p, c, t);
        if (j) { v = j.v; msg = j.msg; if (j.v === "bad") msg[1] += " Example: " + key + "."; open = j.open; } else { v = "cmp"; msg = ["Not checked. ", refs ? "Reference: " + key + "." : ""]; }
      }
    } else if (key) { v = "bad"; msg = refs ? ["Missing. For example: ", key] : ["Missing. ", THERE_IS]; } else { v = "ok"; msg = ["Right, empty. ", why]; }
    cells[c] = open ? { v, msg, kind, uns: true, vague: open } : { v, msg, kind };
  }
  return summarize({ relOk: u.rel === p.relation && !u.late, cells, ...(refs ? {} : { noRefs: true }) });
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

/** Checks a debate: each of the four questions has one counter-example cell, which the learner accepted or answered with an example. `o` as for `grade`. */
export function gradeDebate(ix: DataIndex, p: PairLike, u: DebateInput, o: GradeOptions = {}): GradeResult {
  const refs = o.refs !== false, cells = {} as Record<CellId, CellResult>, dec = {} as Record<CellId, boolean>;
  QCELL.forEach((c, i) => {
    const a = u.ans[i], ref = refOf(p, c), has = !!ref, why = (p.why && p.why[c]) || "", t = (a.text || "").trim();
    let v: string, msg: string[], kind: CellResult["kind"] = "occ", dok = false, open: string[] | undefined;
    if (a.say === "accept") {
      if (!has) { v = "ok"; msg = ["Right. ", why]; dok = true; } else { v = "bad"; msg = ["Counter-example: ", refs ? ref as string : "there is one."]; }
    } else if (a.say === "why") {
      if (!has) { v = "bad"; msg = ["Nothing can be posited. ", why]; }
      else {
        dok = true; kind = "ex";
        if (!t) { v = "bad"; msg = [a.timeout ? "Time ran out. " : "No example. ", refs ? "For example: " + ref + "." : ""]; }
        else {
          const j = judgeText(ix, p, c, t, [p.catA, p.catB]);
          if (j) { v = j.v; msg = j.msg.slice(); if (v === "bad") msg[1] += " Example: " + ref + "."; open = j.open; }
          else { v = "cmp"; msg = ["Not checked. ", refs ? "Reference: " + ref + "." : ""]; }
        }
      }
    } else { v = "bad"; msg = ["Time ran out. ", has ? (refs ? "For example: " + ref + "." : THERE_IS) : why]; }
    cells[c] = open ? { v, msg, kind, uns: true, vague: open } : { v, msg, kind }; dec[c] = dok;
  });
  return summarize({ relOk: u.rel === p.relation && !u.late, cells, dec, implied: deriveRel(u.ans), ...(refs ? {} : { noRefs: true }) });
}

/** Adds the counts and the overall grade to a draft. It changes the object it is given and returns it, so that verdicts that arrive later can be counted in again. */
export function summarize(res: GradeDraft): GradeResult {
  const out = res as GradeResult, cs = CELLS.map((c) => res.cells[c]);
  out.occBad = cs.filter((r) => r.kind === "occ" && r.v === "bad").length;
  out.exBad = cs.filter((r) => r.kind === "ex" && r.v === "bad").length;
  out.exOpen = cs.filter((r) => r.v === "cmp" && !r.vague).length;
  out.exVague = cs.filter((r) => r.v === "cmp" && r.vague).length;
  out.exN = cs.filter((r) => r.kind === "ex").length;
  out.overall = out.relOpen ? "pend" : !out.relOk ? "bad" : (out.occBad || out.exBad) ? "part" : out.exOpen || out.exVague ? "pend" : "ok";
  return out;
}
