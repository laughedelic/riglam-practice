// A stage coming in, as a station of its own between a result and the next question (practice/stage-offer.ts, takeStageUp): which stage it is and what
// it introduces. "New stage" with the stage it comes from, then the stage as the title ("Stage 3 reached"), the nine stages as a row of rings (the progression
// ring of each stage: a segment for each of its new terms, colored by the last answer on it; a tap on a ring lists its terms), and two parts, each a small stop
// on the line: Topics, what the stage introduces with the new terms it brings, and Progression, what the stages are. The first time that is said in three short
// lines; in a later upgrade it is one line, with the rest folded under "How the stages work". The learner may stay on the stage they are on a while longer (and
// take that back), or choose the stages themselves in the practice options. The stages carry no names here, only numbers. Drawn like the stop of a course term
// (path/stop.tsx): paper and ink, not a question's gold.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { stayOnStage, undoStay } from "../practice/stage-offer.ts";
import { openStageOptions } from "../shell/session.js";
import { MAX_STAGE, STAGES, runNeed } from "../../domain/stages.ts";
import { Segs, TermList, marksOf, rightOf } from "./rings.tsx";
import { Scroll } from "./scroll.tsx";
import { FitTerm } from "./stop-def.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, St, Sx } from "./ui.tsx";

/** A part that is folded away and can be opened again: what the stages are, in an upgrade after the first. */
function Fold({ label, children }: { label: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return <div class="tup-fold"><button type="button" class="tup-foldb" aria-expanded={open ? "true" : "false"} onClick={() => setOpen(!open)}>{label}</button>{open ? <div class="tup-foldc">{children}</div> : null}</div>;
}
/**
 * The nine stages as a row of rings, each as the progression ring of its stage (path/rings.tsx): the stages passed with the marks their terms have now, the new
 * one and those ahead fainter. A tap on a ring opens the list of its terms with their marks under the row, and a second tap closes it.
 */
function Rings({ n }: { n: number }) {
  const [open, setOpen] = useState(0), marks = open ? marksOf(open) : [];
  return <>
    <div class="tup-rings" role="group" aria-label={"Stage " + n + " of " + MAX_STAGE}>
      {STAGES.map((s) => {
        const m = marksOf(s.n);
        return <button type="button" class={"tup-rg " + (s.n < n ? "done" : s.n === n ? "now" : "ahead") + (open === s.n ? " on" : "")} aria-pressed={open === s.n ? "true" : "false"}
          aria-label={"Stage " + s.n + (m.length ? ", " + rightOf(m) + " of " + m.length + " new terms answered right" : ", no new terms")} onClick={() => setOpen(open === s.n ? 0 : s.n)}>
          <svg class="rgs" viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r="11.5" />
            {m.length ? <Segs marks={m} /> : <circle class={"tseg " + (s.n < n ? "ok" : "wait")} cx="15" cy="15" r="11.5" />}
            <text x="15" y="18.8">{s.n}</text></svg></button>;
      })}
    </div>
    {open ? <div class="tup-rgp" role="region" aria-label={"Stage " + open + ", its new terms"}>
      <p class="tup-rgl">Stage {open}</p>{marks.length ? <TermList marks={marks} /> : <p class="tup-note">It introduces no new terms.</p>}</div> : null}
  </>;
}
/** A part of the station: its label beside a small node on the line, then its text under the column. */
const Part = ({ label, children }: { label: string; children: ComponentChildren }) => <>
  <St d={<D cls="sub done" />} cls="stm thing tstop-sec"><span class="tstop-sech">{label}</span></St>
  <div class="wtext tup">{children}</div></>;

/** The station on the answer on screen, under the exercise's top bar. */
export function stageUpScreen(title: string): { cls: string; node: ComponentChildren } {
  const up = state.ui!.up!, n = up.stage, from = n - 1, info = STAGES.find((x) => x.n === n), newTerms = marksOf(n);
  const mix = "The earlier stages stay in the mix.";
  const kind = <li>Each stage adds a new kind of thing to ask about, from everyday things toward abstract ideas.</li>, term = <li>Each new term comes with its definition first.</li>;
  const opts = <p class="tup-note">The stages follow your answers. To choose them yourself, or to stop them from moving up, use the <button type="button" class="plnk" onClick={openStageOptions}>practice options</button>.</p>;
  return { cls: "done", node: <>
    <TopBar title={title} tools />
    <Scroll>
      <Sx cls="cur first tstop tstage"><Gap h={14} /><Head d={<D cls="sec tsd" />} h="New stage" sub={from + " → " + n} /><Gap h={4} />
        <St d={<D cls="sub done" />} cls="stm thing"><FitTerm text={"Stage " + n + " reached"} whole /></St>
        <div class="wtext tup"><Rings n={n} /></div>
        {info ? <Part label="Topics"><p class="tup-lead">{info.adds}</p>{newTerms.length ? <TermList marks={newTerms} /> : null}</Part> : null}
        <Part label="Progression">{up.first
          ? <><ul class="tup-bul">{kind}<li>{mix}</li>{term}</ul>{opts}</>
          : <><p>{mix}</p><Fold label="How the stages work"><ul class="tup-bul">{kind}{term}</ul>{opts}</Fold></>}</Part>
        <div class="wtext tup">{up.stayed
          ? <p class="tup-note" role="status">Stage {n} stays out for now. It comes in after {runNeed(state.stageRun)} right answers in a row on stage {from}. <button type="button" class="plnk" onClick={undoStay}>Undo</button></p>
          : <p class="tup-note">Not sure yet? <span class="nw"><button type="button" class="plnk" onClick={stayOnStage}>Stay on stage {from} a while longer</button>.</span></p>}</div>
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="on to the question" act={() => next()} /></Foot>
  </> };
}
