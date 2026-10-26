// The pieces of the progression rings (path/progress.tsx, the ring in the top bar; path/stage-up.tsx, a ring for each stage): a stage's new terms drawn as the
// segments of a ring, one each, in the order the learner first answered them (src/domain/intro.ts, stageMarks) and colored by the last answer on it, and the
// same terms as a list with the same marks. The colors are in the path CSS, by the term's mark (`tseg ok`, `tseg miss`, `tmk wait` ...).
import { state } from "../state.js";
import { stageMarks } from "../../domain/intro.ts";
import type { StageMark } from "../../domain/intro.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";

const R = 11.5, GAP = 12;
const point = (a: number) => { const t = ((a - 90) * Math.PI) / 180; return (15 + R * Math.cos(t)).toFixed(2) + " " + (15 + R * Math.sin(t)).toFixed(2); };
/** The arc of the ring from angle `a0` to `a1`, in degrees clockwise from the top. */
const arc = (a0: number, a1: number) => "M" + point(a0) + "A" + R + " " + R + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + point(a1);

/** The new terms of a stage with their marks on this device (none before the term data is in, and on the classic page, which has no term stops). */
export const marksOf = (stage: number): StageMark[] => (state.design === "path" && state.intro && state.DATA ? stageMarks(state as unknown as DataIndex, state.intro, stage) : []);
/** How many of the terms have their last answer right. */
export const rightOf = (marks: readonly StageMark[]): number => marks.filter((t) => t.mark === "ok").length;

/** The segments inside a 30 by 30 ring: one whole circle for a single term or when every term is right, else an arc for each with a gap between. */
export function Segs({ marks }: { marks: readonly StageMark[] }) {
  if (marks.length === 1 || marks.every((t) => t.mark === "ok")) return <circle class={"tseg " + marks[0]!.mark} cx="15" cy="15" r={R} />;
  const sp = 360 / marks.length;
  return <>{marks.map((t, i) => <path class={"tseg " + t.mark} d={arc(i * sp + GAP / 2, (i + 1) * sp - GAP / 2)} />)}</>;
}

/** The list of a stage's new terms, each with the mark of its segment. */
export const TermList = ({ marks }: { marks: readonly StageMark[] }) => <ul class="tterms">{marks.map((t) =>
  <li class={t.mark}><i class={"tmk " + t.mark} aria-hidden="true" /><span class="ttn">{state.CAT[t.id]?.term || t.id}</span></li>)}</ul>;
