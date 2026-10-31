// The pieces of the progression rings (path/progress.tsx, the ring in the top bar; path/stage-up.tsx and path/progression.tsx, a ring for each stage): a stage's new terms drawn as the
// segments of a ring, one each, in the order the learner first answered them (src/domain/intro.ts, stageMarks) and colored by the last answer on it, and the
// same terms as a list with the same marks. The colors are in the path CSS, by the term's mark (`tseg ok`, `tseg miss`, `tmk wait` ...).
import { state } from "../state.js";
import { stageMarks, stopCat } from "../../domain/intro.ts";
import type { StageMark } from "../../domain/intro.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";

const R = 11.5, GAP = 12;
const point = (a: number) => { const t = ((a - 90) * Math.PI) / 180; return (15 + R * Math.cos(t)).toFixed(2) + " " + (15 + R * Math.sin(t)).toFixed(2); };
/** The arc of the ring from angle `a0` to `a1`, in degrees clockwise from the top. */
const arc = (a0: number, a1: number) => "M" + point(a0) + "A" + R + " " + R + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + point(a1);

/** The new terms of a stage with their marks on this device (none before the term data is in). */
export const marksOf = (stage: number): StageMark[] => (state.intro && state.DATA ? stageMarks(state as unknown as DataIndex, state.intro, stage) : []);
/** How many of the terms have their last answer right. */
export const rightOf = (marks: readonly StageMark[]): number => marks.filter((t) => t.mark === "ok").length;

/**
 * The segments inside a 30 by 30 ring: one whole circle for a single term or, in the top bar, when every term is right (the ring is complete); else an arc
 * for each with a gap between. `split`: an arc for each even when they are all right, as in the row of stages, where a stage passed keeps its segments.
 */
export function Segs({ marks, split = false }: { marks: readonly StageMark[]; split?: boolean }) {
  if (marks.length === 1 || (!split && marks.every((t) => t.mark === "ok"))) return <circle class={"tseg " + marks[0]!.mark} cx="15" cy="15" r={R} />;
  const sp = 360 / marks.length;
  return <>{marks.map((t, i) => <path class={"tseg " + t.mark} d={arc(i * sp + GAP / 2, (i + 1) * sp - GAP / 2)} />)}</>;
}

/** The list of a stage's new terms, each with the mark of its segment. */
export const TermList = ({ marks }: { marks: readonly StageMark[] }) => <ul class="tterms">{marks.map((t) =>
  <li class={t.mark}><i class={"tmk " + t.mark} aria-hidden="true" /><span class="ttn">{(state.DATA && stopCat(state as unknown as DataIndex, t.id)?.term) || t.id}</span></li>)}</ul>;

/** Where a stage stands for a learner whose highest stage is `top`: passed, the one they are on, or ahead. */
export const stageWhere = (n: number, top: number): "done" | "now" | "ahead" => (n < top ? "done" : n === top ? "now" : "ahead");
/**
 * The ring of one stage, as the stages show in a row (the stage station, the roadmap's foot) and on the Progression page: a segment for each of its new terms
 * with the mark it has now, kept when the stage is passed; a stage without new terms one circle, full once passed; the stage the learner is on with a halo.
 */
export function StageRing({ n, top }: { n: number; top: number }) {
  const m = marksOf(n);
  return <svg class="rgs" viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r={R} />
    {m.length ? <Segs marks={m} split /> : <circle class={"tseg " + (n < top ? "ok" : "wait")} cx="15" cy="15" r={R} />}
    {n === top ? <circle class="halo" cx="15" cy="15" r="14.8" /> : null}
    <text x="15" y="18.8">{n}</text></svg>;
}
/** What a stage's ring says to a screen reader. */
export const ringLabel = (n: number, marks: readonly StageMark[]): string => "Stage " + n + (marks.length ? ", " + rightOf(marks) + " of " + marks.length + " new terms answered right" : ", no new terms");
