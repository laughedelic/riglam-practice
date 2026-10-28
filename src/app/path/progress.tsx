// The progression in the top bar of an exercise: a ring after the exercise's name, with the stage's number inside, and the page of the practice options
// sheet that a tap on it opens (shell/session.js, "progress"): a few short lines on what the stage introduces and what the next one waits for. On a stage with
// new terms the ring has a segment for each, in the order the learner first answered them, colored by the last answer on it; on a stage without, it fills
// with the right answers in a row. The numbers are the ones of src/domain/stages.ts (stageProgress) and src/domain/intro.ts (termMark), read through
// practice/stage-offer.ts.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { progressNow } from "../practice/stage-offer.ts";
import { openPage, openProgress } from "../shell/session.js";
import { OPEN_CAP } from "../../domain/intro.ts";
import { STAGES } from "../../domain/stages.ts";
import { openProgression } from "./progression.tsx";
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

/** How new terms come, here and on the Progression page (src/domain/intro.ts, OPEN_CAP). */
export const FLOW = "New terms come one at a time, a few questions apart, while fewer than " + num(OPEN_CAP) + " of your terms are not right yet. With " + num(OPEN_CAP) + ", the questions stay on those until one of them is.";

/**
 * The page: the lines are short, and the words are the stage station's where it has them ("reached", "The stages follow your answers"). The new terms of the
 * stage follow what it introduces, each with its mark; a link at the foot opens the Progression page with every stage (path/progression.tsx).
 */
export function ProgressPage() {
  const p = progressNow(), info = STAGES.find((s) => s.n === p.top), n = p.terms.length;
  const add = info ? info.adds.charAt(0).toLowerCase() + info.adds.slice(1).replace(/\.$/, "") : "";
  const items: ComponentChildren[] = [];
  const list = <TermList marks={p.terms} />;
  if (add) items.push("Stage " + p.top + " introduces " + add + ".");
  if (n) items.push(list);
  if (p.next && p.flow) {
    items.push(FLOW, p.need ? "Stage " + p.next + " comes in after " + num(p.need) + " right answers in a row, with its first new term."
      : "Stage " + p.next + " begins with its first new term, after " + (n === 1 ? "this one" : "the last of these") + ".");
    items.push("A wrong answer takes back only that term’s mark.", "Progression works across all exercises.", "Review keeps the earlier stages fresh; it does not move the ring.");
  } else if (p.next && p.shows === "terms") {
    items.push("Stage " + p.next + " is reached once your last answer on " + (n === 1 ? "this term" : "each of these terms") + " is right.");
    items.push("A wrong answer takes back only that term’s mark.", "Progression works across all exercises.", "Review keeps the earlier stages fresh; it does not move the ring.");
  } else if (p.next) {
    items.push("Stage " + p.next + " is reached after " + num(p.need) + " right answers in a row on what is new.");
    items.push("Progression works across all exercises.", "Review answers count too, but as smaller steps.", "A wrong answer on the new terms resets the stage progress.");
  } else items.push(state.stageRun.manual ? "The stages move when you move them." : "This is the last stage.");
  items.push(<>The stages follow your answers. To choose them yourself, or to stop them from moving up, use the <button type="button" class="plnk" onClick={() => openPage(null)}>practice options</button>.</>);
  return <div class="wtext tup"><ul class="tup-bul">{items.map((t) => <li class={t === list ? "tlist" : undefined}>{t}</li>)}</ul>
    <p class="tup-note"><button type="button" class="plnk" onClick={() => openProgression(p.top, "sheet")}>All stages and their terms</button></p></div>;
}
