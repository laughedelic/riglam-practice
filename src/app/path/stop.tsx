// A course term's stop on the Path (practice/stops.ts): before the next question, a station of its own with the term, its names, and sections for its
// definition, where it sits in the course and examples (path/stop-def.tsx). Nothing to answer and no score, so it is drawn in paper and ink, not in a
// question's gold: Next goes on to the question. One optional mark, a clock turning forward, brings it again in a few questions; a short hint under it
// says so for a moment. Without the Magic Key it shows where the term sits, and says where the definition comes from.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { againOn, stopHead, stopTerm, toggleAgain } from "../practice/stops.ts";
import { Scroll } from "./scroll.tsx";
import { FitTerm, StopSections } from "./stop-def.tsx";
import { Names } from "./terms.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Icon, St, Sx } from "./ui.tsx";

/** How long the hint under the clock stays, in milliseconds. */
const HINT_MS = 3000;
/** The clock: a tap asks to see the term again, and a short hint under it says so for a few seconds; a second tap takes the ask back and the hint goes. */
function AgainMark({ cat, on }: { cat: string; on: boolean }) {
  const [hint, setHint] = useState(false), timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const press = () => {
    clearTimeout(timer.current); toggleAgain(cat);
    setHint(!on);
    if (!on) timer.current = window.setTimeout(() => setHint(false), HINT_MS);
  };
  return <>
    <button type="button" class={"pib pstar tagain" + (on ? " on" : "")} aria-pressed={on ? "true" : "false"} aria-label="Show it again later" onClick={press}><Icon n="again" /></button>
    {hint && on ? <span class="tagain-hint" role="status">Will be shown again</span> : null}
  </>;
}

/** The stop on the answer on screen, under the exercise's top bar. */
export function stopScreen(title: string): { cls: string; node: ComponentChildren } {
  const s = state.ui!.stop!, h = stopHead(s), t = stopTerm(s), again = againOn(s.cat);
  return { cls: "done", node: <>
    <TopBar title={title} tools />
    <Scroll>
      <Sx cls="cur first tstop"><Gap h={14} /><Head d={<D cls="sec tsd" />} h={h.h} sub={h.sub} /><Gap h={4} />
        <St d={<D cls="sub done" />} cls="stm thing hasstar">
          <AgainMark cat={s.cat} on={again} />
          <FitTerm text={t.name} /><Names term={t.name} /></St>
        <StopSections s={s} name={t.name} def={t.def} />
        {!t.def && state.unlock ? <p class="tstop-key">Its definition comes with the Magic Key from your study group's link.</p> : null}
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="on to the question" act={() => next()} /></Foot>
  </> };
}
