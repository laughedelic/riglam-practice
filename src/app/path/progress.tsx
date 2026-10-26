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
import { STAGES } from "../../domain/stages.ts";
import type { TermMark } from "../../domain/intro.ts";

const R = 11.5, C = 2 * Math.PI * R, GAP = 12;
const point = (a: number) => { const t = ((a - 90) * Math.PI) / 180; return (15 + R * Math.cos(t)).toFixed(2) + " " + (15 + R * Math.sin(t)).toFixed(2); };
/** The arc of the ring from angle `a0` to `a1`, in degrees clockwise from the top. */
const arc = (a0: number, a1: number) => "M" + point(a0) + "A" + R + " " + R + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + point(a1);
const right = (ts: readonly { mark: TermMark }[]) => ts.filter((t) => t.mark === "ok").length;

/**
 * The ring. A stage with new terms: one segment per term, its class the term's mark (`ok` green, a miss red, `wait` fainter: the path CSS), one whole
 * circle for a single term. A stage without, or one whose terms were right before: filled clockwise from the top by the run. Once the next stage is due
 * the disc turns green (it comes in at Next).
 */
export function ProgressRing() {
  const p = progressNow(), terms = p.shows === "terms" ? p.terms : null, done = terms ? right(terms) : state.stageRun.up;
  const ref = useRef<HTMLButtonElement>(null), was = useRef(done);
  // an answer that counts moves the ring (the fill follows with a transition), and the ring gives a small bump
  useEffect(() => {
    if (done > was.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 450, easing: "ease" });
    was.current = done;
  }, [done]);
  const open = state.sessOpen && state.sessPage === "progress", sp = terms ? 360 / terms.length : 0;
  const where = terms ? ", " + done + " of " + terms.length + " new terms answered right" : p.next ? ", " + Math.round(p.frac * 100) + " percent of the way to stage " + p.next : "";
  return <button type="button" ref={ref} class={"pib pring" + (p.full ? " full" : "") + (open ? " on" : "")} aria-expanded={open ? "true" : "false"}
    aria-label={"Progression: stage " + p.top + where + ". How it works"} onClick={openProgress}>
    <svg viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r={R} />
      {!terms ? <><circle class="track" cx="15" cy="15" r={R} /><circle class="arc" cx="15" cy="15" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - p.frac)} transform="rotate(-90 15 15)" /></>
        : terms.length === 1 || p.full ? <circle class={"tseg " + terms[0]!.mark} cx="15" cy="15" r={R} />
        : terms.map((t, i) => <path class={"tseg " + t.mark} d={arc(i * sp + GAP / 2, (i + 1) * sp - GAP / 2)} />)}
      <text x="15" y="18.8">{p.top}</text></svg>
  </button>;
}

const WORD: Record<number, string> = { 5: "five", 10: "ten", 15: "fifteen", 20: "twenty", 25: "twenty-five", 30: "thirty" };
const num = (n: number) => WORD[n] || String(n);

/** The page: the lines are short, and the words are the stage station's where it has them ("reached", "The stages follow your answers"). The new terms of the stage follow what it introduces, each with its mark. */
export function ProgressPage() {
  const p = progressNow(), info = STAGES.find((s) => s.n === p.top), n = p.terms.length;
  const add = info ? info.adds.charAt(0).toLowerCase() + info.adds.slice(1).replace(/\.$/, "") : "";
  const items: ComponentChildren[] = [];
  const list = <ul class="tterms">{p.terms.map((t) => <li class={t.mark}><i class={"tmk " + t.mark} aria-hidden="true" /><span class="ttn">{state.CAT[t.id]?.term || t.id}</span></li>)}</ul>;
  if (add) items.push("Stage " + p.top + " introduces " + add + ".");
  if (n) items.push(list);
  if (p.next && p.shows === "terms") {
    items.push("Stage " + p.next + " is reached once your last answer on " + (n === 1 ? "this term" : "each of these terms") + " is right.");
    items.push("A wrong answer takes back only that term’s mark.", "Progression works across all exercises.", "Review keeps the earlier stages fresh; it does not move the ring.");
  } else if (p.next) {
    items.push("Stage " + p.next + " is reached after " + num(p.need) + " right answers in a row on what is new.");
    items.push("Progression works across all exercises.", "Review answers count too, but as smaller steps.", "A wrong answer on the new terms resets the stage progress.");
  } else items.push(state.stageRun.manual ? "The stages move when you move them." : "This is the last stage.");
  items.push(<>The stages follow your answers. To choose them yourself, or to stop them from moving up, use the <button type="button" class="plnk" onClick={() => openPage(null)}>practice options</button>.</>);
  return <div class="wtext tup"><ul class="tup-bul">{items.map((t) => <li class={t === list ? "tlist" : undefined}>{t}</li>)}</ul></div>;
}
