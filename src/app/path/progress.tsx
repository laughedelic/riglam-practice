// The progression in the top bar of an exercise: a ring after the exercise's name that fills with the right answers in a row towards the next stage, with
// the stage's number inside, and the page of the practice options sheet that a tap on it opens (shell/session.js, "progress"): a few short lines on what the
// stage adds and how the run works. The numbers are the ones of src/domain/stages.ts (stageProgress, runAfter), read through practice/stage-offer.ts.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { progressNow } from "../practice/stage-offer.ts";
import { openPage, openProgress } from "../shell/session.js";
import { STAGES } from "../../domain/stages.ts";

const R = 11.5, C = 2 * Math.PI * R;

/** The ring: filled clockwise from the top by the run; once the run is full the disc turns green (the next stage comes in with the next right answer on what is new). */
export function ProgressRing() {
  const p = progressNow(), up = state.stageRun.up, ref = useRef<HTMLButtonElement>(null), was = useRef(up);
  // an answer that counts moves the ring (the fill follows with a transition), and the ring gives a small bump
  useEffect(() => {
    if (up > was.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 450, easing: "ease" });
    was.current = up;
  }, [up]);
  const full = p.full && !p.waiting, open = state.sessOpen && state.sessPage === "progress";
  return <button type="button" ref={ref} class={"pib pring" + (full ? " full" : "") + (open ? " on" : "")} aria-expanded={open ? "true" : "false"}
    aria-label={"Progression: stage " + p.top + (p.next ? ", " + Math.round(p.frac * 100) + " percent of the way to stage " + p.next : "") + ". How it works"}
    onClick={openProgress}>
    <svg viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r={R} /><circle class="track" cx="15" cy="15" r={R} />
      <circle class="arc" cx="15" cy="15" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - p.frac)} transform="rotate(-90 15 15)" /><text x="15" y="18.8">{p.top}</text></svg>
  </button>;
}

const WORD: Record<number, string> = { 5: "five", 10: "ten", 15: "fifteen", 20: "twenty", 25: "twenty-five", 30: "thirty" };
const num = (n: number) => WORD[n] || String(n);

/** The page: the lines are short, and the words are the stage station's where it has them ("reached", "The stages follow your answers"). */
export function ProgressPage() {
  const p = progressNow(), info = STAGES.find((s) => s.n === p.top);
  const add = info ? info.adds.charAt(0).toLowerCase() + info.adds.slice(1).replace(/\.$/, "") : "";
  const items: ComponentChildren[] = [];
  if (add) items.push("Stage " + p.top + " adds " + add + ".");
  if (p.next) {
    items.push("Stage " + p.next + " is reached after " + num(p.need) + " right answers in a row on what is new.");
    if (p.waiting) items.push("Stage " + p.next + " comes in once you have met the new terms of stage " + p.top + ".");
    items.push("Progression works across all exercises.", "Review answers count too, but as smaller steps.", "A wrong answer on the new terms resets the stage progress.");
  } else items.push(state.stageRun.manual ? "The stages move when you move them." : "This is the last stage.");
  items.push(<>The stages follow your answers. To choose them yourself, or to stop them from moving up, use the <button type="button" class="plnk" onClick={() => openPage(null)}>practice options</button>.</>);
  return <div class="wtext tup"><ul class="tup-bul">{items.map((t) => <li>{t}</li>)}</ul></div>;
}
