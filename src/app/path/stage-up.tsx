// A stage coming in, as a station of its own between a result and the next question (practice/stage-offer.ts, takeStageUp): which stage it is and what
// it introduces. "New stage" with the stage it comes from, then the stage as the title ("Stage 3 reached"), the nine stages as a row of rings (the progression
// ring of each stage: a segment for each of its new terms, colored by the last answer on it; a tap on a ring shows its terms in a tooltip), and two parts, each a small stop
// on the line: Topics, what the stage introduces with the new terms it brings, and Progression, what the stages are. The first time that is said in three short
// lines; in a later upgrade it is one line, with the rest folded under "How the stages work". The learner may stay on the stage they are on a while longer (and
// take that back), or choose the stages themselves in the practice options. The stages carry no names here, only numbers. Drawn like the stop of a course term
// (path/stop.tsx): paper and ink, not a question's gold.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { stayOnStage, undoStay } from "../practice/stage-offer.ts";
import { stopAfterStage } from "../practice/stops.ts";
import { openStageOptions } from "../shell/session.js";
import { MAX_STAGE, STAGES, runNeed } from "../../domain/stages.ts";
import { stopName } from "./next.ts";
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
 * The nine stages as a row of rings, each as the progression ring of its stage (path/rings.tsx): the stages passed with the marks their terms have now and their
 * segments kept, the new one with a halo, those ahead fainter. A ring shows its terms with their marks in a tooltip under the row: a mouse over it, or a tap, which
 * pins it until a tap elsewhere, Escape, or a second tap on the ring.
 */
function Rings({ n }: { n: number }) {
  const [tip, setTip] = useState<{ n: number; pin: boolean } | null>(null), box = useRef<HTMLDivElement>(null);
  const at = tip ? tip.n : 0, marks = at ? marksOf(at) : [], pinned = !!tip && tip.pin;
  useEffect(() => {
    if (!pinned) return;
    const away = (e: Event) => { if (!box.current || !box.current.contains(e.target as Node)) setTip(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setTip(null); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc, true); };
  }, [pinned]);
  return <div class="tup-rw" ref={box}>
    <div class="tup-rings" role="group" aria-label={"Stage " + n + " of " + MAX_STAGE}>
      {STAGES.map((s) => {
        const m = marksOf(s.n);
        return <button type="button" class={"tup-rg " + (s.n < n ? "done" : s.n === n ? "now" : "ahead") + (at === s.n ? " on" : "")} aria-expanded={at === s.n ? "true" : "false"}
          aria-label={"Stage " + s.n + (m.length ? ", " + rightOf(m) + " of " + m.length + " new terms answered right" : ", no new terms")}
          onClick={() => setTip(pinned && at === s.n ? null : { n: s.n, pin: true })}
          onPointerEnter={(e) => { if (e.pointerType === "mouse" && !pinned) setTip({ n: s.n, pin: false }); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setTip((t) => (t && !t.pin ? null : t)); }}>
          <svg class="rgs" viewBox="0 0 30 30" aria-hidden="true"><circle class="disc" cx="15" cy="15" r="11.5" />
            {m.length ? <Segs marks={m} split /> : <circle class={"tseg " + (s.n < n ? "ok" : "wait")} cx="15" cy="15" r="11.5" />}
            {s.n === n ? <circle class="halo" cx="15" cy="15" r="14.8" /> : null}
            <text x="15" y="18.8">{s.n}</text></svg></button>;
      })}
    </div>
    {at ? <div class="tup-rgp" style={"--c:" + (at - 0.5) / MAX_STAGE} role="region" aria-label={"Stage " + at + ", its new terms"}>
      <p class="tup-rgl">Stage {at}</p>{marks.length ? <TermList marks={marks} /> : <p class="tup-note">It introduces no new terms.</p>}</div> : null}
  </div>;
}
/** A part of the station: its label beside a small node on the line, then its text under the column. */
const Part = ({ label, children }: { label: string; children: ComponentChildren }) => <>
  <St d={<D cls="sub done" />} cls="stm thing tstop-sec"><span class="tstop-sech">{label}</span></St>
  <div class="wtext tup">{children}</div></>;

/** The station on the answer on screen, under the exercise's top bar. */
export function stageUpScreen(title: string): { cls: string; node: ComponentChildren } {
  const up = state.ui!.up!, n = up.stage, from = n - 1, info = STAGES.find((x) => x.n === n), newTerms = marksOf(n);
  const after = stopAfterStage();     // the first term of the stage comes at once, as a stop: the station says so
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
    <Foot>{after ? <Station name={stopName(after)} act={() => next()} /> : <Station name="Next" hint="on to the question" act={() => next()} />}</Foot>
  </> };
}
