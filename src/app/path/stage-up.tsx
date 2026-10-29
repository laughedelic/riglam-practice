// A stage coming in, as a station of its own between a result and the next question (practice/stage-offer.ts, takeStageUp): which stage it is and what
// it adds. The first time it says what the stages are, in a few lines; the later ones only say what comes in. Nothing to answer: Next takes the stage,
// and the learner may stay on the stage they are on a while longer, or choose the stages themselves in the practice options. Drawn like the stop of a
// course term (path/stop.tsx): paper and ink, not a question's gold.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { stayOnStage } from "../practice/stage-offer.ts";
import { openStageOptions } from "../shell/session.js";
import { stageName } from "../shell/stages.js";
import { STAGES, runNeed } from "../../domain/stages.ts";
import { Scroll } from "./scroll.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Sx } from "./ui.tsx";

/** The station on the answer on screen, under the exercise's top bar. */
export function stageUpScreen(title: string): { cls: string; node: ComponentChildren } {
  const up = state.ui!.up!, n = up.stage, from = n - 1, info = STAGES.find((x) => x.n === n), name = stageName(n).toLowerCase(), fromName = stageName(from).toLowerCase();
  const opts = <button type="button" class="plnk" onClick={openStageOptions}>practice options</button>;
  return { cls: "done", node: <>
    <TopBar title={title} tools />
    <Scroll>
      <Sx cls="cur first tstop"><Gap h={14} /><Head d={<D cls="sec tsd" />} h={"Stage " + n} sub={name} /><Gap h={4} />
        <div class="wtext tup">
          {up.first ? <>
            <p>The practice is built in stages. Each one adds a new kind of thing to ask about, from everyday things toward abstract ideas, and they are the same in every exercise.</p>
            <p>You have been on stage {from}, {fromName}. Stage {n}, {name}, comes in now. {info ? info.adds : ""}</p>
            <p>Everything you have practiced stays in the mix, and each new term comes with its definition before it is asked.</p>
          </> : <p>Stage {n}, {name}, comes in now. {info ? info.adds : ""} The earlier stages stay in the mix.</p>}
          {up.stayed
            ? <p class="tup-note" role="status">Stage {n} stays out for now. It comes in after {runNeed(state.stageRun)} right answers in a row on stage {from}.</p>
            : <p><button type="button" class="pbtn quiet" onClick={stayOnStage}>Stay on stage {from} a while longer</button></p>}
          <p class="tup-note">The stages follow your answers. To choose them yourself, or to stop them from moving up, use the {opts}.</p>
        </div>
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="on to the question" act={() => next()} /></Foot>
  </> };
}
