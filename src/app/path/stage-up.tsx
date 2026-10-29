// A stage coming in, as a station of its own between a result and the next question (practice/stage-offer.ts, takeStageUp): which stage it is and what
// it introduces. "New stage" with the stage it comes from, then the stage as the title ("Stage 3 reached"), the nine stages of course terms as a row of rings (the progression
// ring of each stage: a segment for each of its new terms, colored by the last answer on it; a tap on a ring shows its terms in a tooltip), and two parts, each a small stop
// on the line: Topics, what the stage introduces with the new terms it brings, and Progression, what the stages are. The first time that is said in a few short
// lines (stage 1 says that the course terms start there); in a later upgrade it is one line, with the rest folded under "How the stages work", the Progression
// page's words (path/progress.tsx, HowStages). Both say when a stage opens a group of three, and stage 9 that it is the last, with the depth after it on the
// Progression page. The learner may stay on the stage they are on a while longer (and take that back), or choose the stages themselves on that page.
// The stages carry no names here, only numbers. Drawn like the stop of a course term (path/stop.tsx): paper and ink, not a question's gold.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { stayOnStage, undoStay } from "../practice/stage-offer.ts";
import { stopAfterStage } from "../practice/stops.ts";
import { PACE_NAME } from "../practice/difficulty.ts";
import { LADDER_TOP, RING_STAGES, STAGES, runNeed } from "../../domain/stages.ts";
import { HowStages } from "./progress.tsx";
import { openDifficulty, openStages } from "./progression.tsx";
import { stopName } from "./next.ts";
import { StageRing, TermList, marksOf, ringLabel, stageWhere } from "./rings.tsx";
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
 * The stages of course terms as a row of rings (stage 0, everyday things alone, is not among them; the steps of depth are offered on a result, not at a
 * station: practice/stage-offer.ts), each as the progression ring of its stage (path/rings.tsx): the stages passed with the marks their terms have now and their
 * segments kept, the new one with a halo, those ahead fainter. A ring shows its terms with their marks in a tooltip under the row: a mouse over it, or a tap, which
 * pins it until a tap elsewhere, Escape, or a second tap on the ring.
 */
function Rings({ n }: { n: number }) {
  const [tip, setTip] = useState<{ n: number; pin: boolean } | null>(null), box = useRef<HTMLDivElement>(null);
  const at = tip ? tip.n : 0, marks = at ? marksOf(at) : [], pinned = !!tip && tip.pin;
  useLayoutEffect(() => {      // not after the paint: Escape or a tap elsewhere right after the tap on a ring must already close it
    if (!pinned) return;
    const away = (e: Event) => { if (!box.current || !box.current.contains(e.target as Node)) setTip(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setTip(null); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc, true); };
  }, [pinned]);
  return <div class="tup-rw" ref={box}>
    <div class="tup-rings" style={"--n:" + RING_STAGES.length} role="group" aria-label={"Stage " + n + " of " + RING_STAGES.length}>
      {RING_STAGES.map((s) => {
        const m = marksOf(s.n);
        return <button type="button" class={"tup-rg " + stageWhere(s.n, n) + (at === s.n ? " on" : "")} aria-expanded={at === s.n ? "true" : "false"} aria-label={ringLabel(s.n, m)}
          onClick={() => setTip(pinned && at === s.n ? null : { n: s.n, pin: true })}
          onPointerEnter={(e) => { if (e.pointerType === "mouse" && !pinned) setTip({ n: s.n, pin: false }); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setTip((t) => (t && !t.pin ? null : t)); }}>
          <StageRing n={s.n} top={n} /></button>;
      })}
    </div>
    {at ? <div class="tup-rgp" style={"--c:" + (at - 0.5) / RING_STAGES.length} role="region" aria-label={"Stage " + at + ", its new terms"}>
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
  const page = <button type="button" class="plnk" onClick={openDifficulty}>Progression page</button>;
  const start = n === 1 ? "Stage 0 was everyday things only. The course terms start here: nine stages of them, in three groups of three."
    : "Each stage adds a new kind of thing to ask about, from everyday things toward abstract ideas.";
  const group = info && info.group && n > 1 ? "Stage " + n + " begins the " + (n < 7 ? "second" : "third") + " group of three: " + info.group.charAt(0).toLowerCase() + info.group.slice(1) + "." : "";
  const pace = <>New terms come one at a time, each with its definition first, at a {PACE_NAME[state.pace] || "steady"} pace (set it on the {page}).</>;
  const last = n === LADDER_TOP ? <>This is the last stage. Chains of reasoning come after it, as a difficulty of their own: Depth, on the {page}.</> : null;
  const opts = <p class="tup-note">The stages follow your answers. To choose them yourself, switch Natural progression off on the <button type="button" class="plnk" onClick={openStages}>Progression page</button>.</p>;
  return { cls: "done", node: <>
    <TopBar title={title} tools />
    <Scroll>
      <Sx cls="cur first tstop tstage"><Gap h={14} /><Head d={<D cls="sec tsd" />} h="New stage" sub={from + " → " + n} /><Gap h={4} />
        <St d={<D cls="sub done" />} cls="stm thing"><FitTerm text={"Stage " + n + " reached"} whole /></St>
        <div class="wtext tup"><Rings n={n} /></div>
        {info ? <Part label="Topics"><p class="tup-lead">{info.adds}</p>{newTerms.length ? <TermList marks={newTerms} /> : null}</Part> : null}
        <Part label="Progression">{up.first
          ? <><ul class="tup-bul"><li>{start}</li>{group ? <li>{group}</li> : null}<li>{mix}</li><li>{pace}</li>{last ? <li>{last}</li> : null}</ul>{opts}</>
          : <><p>{mix}{group ? " " + group : ""}</p>{last ? <p>{last}</p> : null}<Fold label="How the stages work"><HowStages diff={<>Depth, on the {page}</>} />{opts}</Fold></>}</Part>
        <div class="wtext tup">{up.stayed
          ? <p class="tup-note" role="status">Stage {n} stays out for now. It comes in after {runNeed(state.stageRun)} right answers in a row on stage {from}. <button type="button" class="plnk" onClick={undoStay}>Undo</button></p>
          : <p class="tup-note">Not sure yet? <span class="nw"><button type="button" class="plnk" onClick={stayOnStage}>Stay on stage {from} a while longer</button>.</span></p>}</div>
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot>{after ? <Station name={stopName(after)} act={() => next()} /> : <Station name="Next" hint="on to the question" act={() => next()} />}</Foot>
  </> };
}
