// A course term's stop on the Path (practice/stops.ts): before the next question, a station of its own with the term, where it sits in the course and its
// definition. Nothing to answer and no score, so it is drawn in paper and ink, not in a question's gold: Next goes on to the question. One optional mark,
// a clock turning forward, brings it again in a few questions. Without the Magic Key it shows where the term sits, and says where the definition comes from.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { againOn, stopHead, stopTerm, toggleAgain } from "../practice/stops.ts";
import { AGAIN_AFTER } from "../../domain/intro.ts";
import { Scroll } from "./scroll.tsx";
import { Def } from "./terms.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Icon, St, Sx } from "./ui.tsx";

/** The stop on the answer on screen, under the exercise's top bar. */
export function stopScreen(title: string): { cls: string; node: ComponentChildren } {
  const s = state.ui!.stop!, h = stopHead(s), t = stopTerm(s), ch = (state.DATA!.terms[t.name] || {}).ch || "", again = againOn(s.cat);
  return { cls: "done", node: <>
    <TopBar title={title} tools />
    <Scroll>
      <Sx cls="cur first tstop"><Gap h={14} /><Head d={<D cls="sec tsd" />} h={h.h} sub={h.sub} /><Gap h={4} />
        <St d={<D cls="sub done" />} cls="stm thing hasstar">
          <button type="button" class={"pib pstar tagain" + (again ? " on" : "")} aria-pressed={again ? "true" : "false"} aria-label="Show it again later" onClick={() => toggleAgain(s.cat)}><Icon n="again" /></button>
          <span class="cs" lang="en">{t.name}</span>{ch ? <small class="pcatm">{ch}</small> : null}</St>
        <div class="wtext tstop-def"><Def term={t.name} trail={[]} plain /></div>
        {!t.def && state.unlock ? <p class="tstop-key">Its definition comes with the Magic Key from your study group's link.</p> : null}
        {again ? <p class="tstop-key" role="status">It comes again in about {AGAIN_AFTER} questions. Tap the clock again to take it off.</p> : null}
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="on to the question" act={() => next()} /></Foot>
  </> };
}
