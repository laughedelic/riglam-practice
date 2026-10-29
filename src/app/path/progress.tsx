// The progression in the top bar of an exercise: a ring after the exercise's name, with the stage's number inside, and the page of the practice options
// sheet that a tap on it opens (shell/session.js, "progress"): the stage, its new terms with their marks and the nine stages' rings. On a stage with
// new terms the ring has a segment for each, in the order the learner first answered them, colored by the last answer on it; on a stage without, it fills
// with the right answers in a row. The numbers are the ones of src/domain/stages.ts (stageProgress) and src/domain/intro.ts (termMark), read through
// practice/stage-offer.ts.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { DEPTH_NAME, depthNow } from "../practice/difficulty.ts";
import { progressNow } from "../practice/stage-offer.ts";
import { openProgress } from "../shell/session.js";
import { paceSpacing } from "../../domain/intro.ts";
import { LADDER_TOP, STAGES } from "../../domain/stages.ts";
import { StageRings, openDifficulty, openProgression } from "./progression.tsx";
import { Segs, TermList, rightOf } from "./rings.tsx";

const R = 11.5, C = 2 * Math.PI * R;

/**
 * The ring. A stage with new terms: one segment per term, its class the term's mark (`ok` green, a miss red, `wait` fainter: the path CSS), one whole
 * circle for a single term. A stage without, or one whose terms were right before: filled clockwise from the top by the run. Once the next stage is due
 * the disc turns green (it comes in at Next).
 */
export function ProgressRing() {
  const p = progressNow(), terms = p.shows === "terms" ? p.terms : null, done = terms ? rightOf(terms) : state.stageRun.up;
  const ref = useRef<HTMLButtonElement>(null), was = useRef(done);
  // an answer that counts moves the ring (the fill follows with a transition), and the ring gives a small bump
  useEffect(() => {
    if (done > was.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 450, easing: "ease" });
    was.current = done;
  }, [done]);
  const open = state.sessOpen && state.sessPage === "progress";
  const where = terms ? ", " + done + " of " + terms.length + " new terms answered right" : p.next ? ", " + Math.round(p.frac * 100) + " percent of the way to stage " + p.next : "";
  return <button type="button" ref={ref} class={"pib pring" + (p.full ? " full" : "") + (open ? " on" : "")} aria-expanded={open ? "true" : "false"}
    aria-label={"Progression: stage " + p.top + where + ". How it works"} onClick={openProgress}>
    <svg class="rgs" viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r={R} />
      {terms ? <Segs marks={terms} /> : <><circle class="track" cx="15" cy="15" r={R} /><circle class="arc" cx="15" cy="15" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - p.frac)} transform="rotate(-90 15 15)" /></>}
      <text x="15" y="18.8">{p.top}</text></svg>
  </button>;
}

const WORD: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 10: "ten", 15: "fifteen", 20: "twenty", 25: "twenty-five", 30: "thirty" };
/** A count in words, as the lines here say it ("five right answers in a row", "three of your terms"). */
export const num = (n: number) => WORD[n] || String(n);

/** How new terms come at a pace of `n` (src/domain/intro.ts, PACES and paceSpacing), here and on the Progression page. */
export const flow = (n: number): string => "New terms come one at a time, at most one every " + num(paceSpacing(n)) + " questions, while fewer than " + num(n) + " of your terms are not right yet. With " + num(n) + ", the questions stay on those until one of them is.";

/**
 * What the stages are and how they move, in full: the fold "How the stages work" on the Progression page (path/progression.tsx) and on the stage station
 * (path/stage-up.tsx), in the same words. `diff` says where the Difficulty page is, after the line on the last stage.
 */
export const HowStages = ({ diff }: { diff: ComponentChildren }) => <ul class="tup-bul">
  <li>Each stage adds a new kind of thing to ask about, from everyday things toward abstract ideas.</li>
  <li>Stage 0 is everyday things only. The course terms start at stage 1, in three groups of three stages.</li>
  <li>The earlier stages stay in the mix, and Review keeps them fresh.</li>
  <li>Each new term comes with its definition first.</li>
  <li>{flow(state.pace)}</li>
  <li>A stage begins with its first new term, once the stage before has brought all of its own. A wrong answer takes back only that term’s mark.</li>
  <li>{"Stage " + LADDER_TOP + " is the last. Chains of reasoning come after it as a difficulty of their own, like the negations: "}{diff}.</li>
  <li>Progression works across all exercises.</li>
  <li>A stage’s ring has a segment for each of its new terms, and each term a diamond: green when your last answer on it was right, red when it was wrong, open while it is not asked yet.</li>
</ul>;

/**
 * The sheet under the ring: the stage, its new terms with their marks, the nine stages as a row of rings (a tap opens one on the Progression page), and the way
 * to all the stages and to the difficulty. How the stages work is on the Progression page; a line on what comes next stays only where something other than
 * the stage's own terms leads on: a run of right answers (stage 0, a stage stayed on, or one whose terms were right before), the stages moved by hand, the
 * last stage.
 */
export function ProgressPage() {
  const p = progressNow(), info = STAGES.find((s) => s.n === p.top), n = p.terms.length;
  let next: ComponentChildren = null;
  if (p.next && p.flow) { if (p.need) next = "Stage " + p.next + " comes in after " + num(p.need) + " right answers in a row, with its first new term."; }
  else if (p.next && p.shows === "terms") next = "Stage " + p.next + " is reached once your last answer on " + (n === 1 ? "this term" : "each of these terms") + " is right.";
  else if (p.next) next = "Stage " + p.next + " is reached after " + num(p.need) + " right answers in a row on what is new.";
  else if (state.stageRun.manual) next = "The stages move when you move them.";
  else {
    const d = depthNow();
    next = <>This is the last stage. Chains of reasoning come after it, as a difficulty of their own: {d ? "depth is at " + DEPTH_NAME[d] + " now" : "a result suggests them once your last answer on each of these terms is right"}.</>;
  }
  return <div class="wtext tup">
    {info ? <p class="tup-lead">{info.name}</p> : null}
    {n ? <TermList marks={p.terms} /> : null}
    {next ? <p>{next}</p> : null}
    <div class="tup-rs"><StageRings from="sheet" /></div>
    <p class="tup-note"><button type="button" class="plnk" onClick={() => openProgression(p.top, "sheet")}>All stages and their terms</button> · <button type="button" class="plnk" onClick={openDifficulty}>Difficulty</button></p>
  </div>;
}
