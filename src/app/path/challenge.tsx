// The challenge on the Path (practice/challenge.ts holds what it is and runs it). Two things are drawn here.
//
// Its stop on the roadmap, in the corner beside the name, on a dashed thread of its own that comes in from the top edge: the challenge comes from outside
// the tree of the exercises. While the challenge is new the stop has a gold frame, its thread is gold and it says "new"; once its page was opened it is a
// plain stop that says how many questions it has, then how many are done, with the answers as small diamonds beside it (under it when they are more than
// four). While one of its questions is on screen the stop is where you are, and "continue" when one waits in its exercise.
//
// And its page, which stands in for Review: the day and the count in the heading, the title, the note, and the questions as stops on a dashed stretch of
// the line, each under the name of its exercise, with how it went once it has an answer. A question is opened by its stop; the station at the foot starts
// the challenge, goes on with it, or asks it again. The top bar goes back to the roadmap.
import { state } from "../state.js";
import { CHALLENGE_NAME, challengeShown, challengeStation, challengeView, challengeWaits, openItem, showChallenge } from "../practice/challenge.ts";
import { exName } from "../shell/exercises.js";
import { dayText } from "../../domain/challenge.ts";
import type { ItemLine, ItemMark } from "../../domain/challenge.ts";
import { FootPin } from "./news.tsx";
import { Scroll } from "./scroll.tsx";
import { Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, St, Sx, dia } from "./ui.tsx";

/** Where the stop stands on the roadmap's tree: the corner at the right of the name. */
const AT = { x: 322, y: 50 };
/** The most answers that fit beside the stop; more go in a row under it. */
const BESIDE = 4;
/** How a question went, in words. */
const SAID: Record<ItemMark, string> = { ok: "right", part: "partly right", bad: "not right", pend: "not checked yet" };
/** The diamond of a question that has an answer. */
const STOP: Record<ItemMark, string> = { ok: "ok", part: "pt", bad: "no", pend: "pt" };
const count = (n: number) => n + (n === 1 ? " question" : " questions");

/** The stop of the challenge on the roadmap's tree: nothing while there is none. */
export function ChallengeStop() {
  const v = challengeView(); if (!v) return null;
  const { x, y } = AT, fresh = v.standing === "new", cur = challengeShown() && !state.optsOpen, cont = !cur && challengeWaits();
  const sub = fresh ? "new" : cur ? (v.at + 1) + " of " + v.doc.items.length : cont ? "continue" : v.standing === "done" ? "done" : v.standing === "under" ? v.done + " of " + v.n + " done" : count(v.doc.items.length);
  const marks = v.doc.items.map((_, i) => v.rec.marks[i]).filter((m): m is ItemMark => !!m);
  const under = marks.length > BESIDE, left = x - ((marks.length - 1) * 11) / 2;
  const act = () => { showChallenge(); };
  return <g class="chn" role="button" tabIndex={0} aria-label={CHALLENGE_NAME + ", " + (cur ? "here, question " + sub : sub) + ": " + v.doc.title} aria-current={cur ? "page" : undefined}
    onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}>
    <path class={"lnp" + (fresh ? " new" : "")} d={"M" + x + " -6 V" + (y - (fresh ? 14 : 9))} />
    <rect class="hit" x={x - 56} y={y - 16} width="112" height={under ? 82 : 68} />
    {fresh ? <polygon class="chring" points={dia(x, y, 14)} /> : null}
    <polygon class={"nd " + (cur ? "cur" : "")} points={dia(x, y, 9)} />
    {marks.map((m, i) => <polygon class={"rm " + m} points={under ? dia(left + i * 11, y + 57, 3.6) : dia(x + 20 + i * 11, y, 3.6)} />)}
    <text class={"en " + (cur ? "cur" : "")} x={x} y={y + 29} text-anchor="middle">{CHALLENGE_NAME}</text>
    <text class={"ed " + (fresh || cont ? "cont" : "chs")} x={x} y={y + 44} text-anchor="middle">{sub}</text>
  </g>;
}

/** The words of a question on the page: the two terms of a pair, or its line. */
const Line = ({ l }: { l: ItemLine }) => "pair" in l ? <>{l.pair[0]} <i>and</i> {l.pair[1]}</> : <>{l.text}</>;

/** The challenge's page. */
export function ChallengePage() {
  const v = challengeView(); if (!v) return null;
  const all = v.standing === "done", st = challengeStation();
  return <>
    <TopBar title={CHALLENGE_NAME} />
    <Scroll>
      <Sx cls={(all ? "walked" : "cur") + " first tight chp"}><Gap h={14} />
        <Head d={<D cls={"sec " + (all ? "done" : "now")} />} h={dayText(v.doc.date)} sub={count(v.doc.items.length) + (v.done ? " · " + v.done + " done" : "")} />
        <Gap h={6} />
        <St d={<span />}><h2 class="tn long">{v.doc.title}</h2></St>
        {v.doc.note ? <><Gap h={8} /><St d={<span />}><p class="chnote">{v.doc.note}</p></St></> : null}
        <Gap h={12} /></Sx>
      <Sx cls={(all ? "walked" : "gap") + " chq"}>
        {v.doc.items.map((it, i) => {
          const l = v.lines[i], m = v.rec.marks[i], here = v.at === i;
          const body = <><span class="chl">{exName(it.exercise)}{here ? <b>continue</b> : null}</span>
            <span class="cht">{l ? <Line l={l} /> : "Not in this version of the app"}</span>
            {m ? <span class="chv">{SAID[m]}</span> : null}</>;
          return <St d={<D cls={"sub " + (m ? STOP[m] : l ? "pk" : "nil")} />} cls={"sb chi" + (m ? " done" : "") + (l ? "" : " off")}>
            {l ? <button type="button" class="chb" onClick={() => { openItem(i); }}>{body}</button> : <div class="chb">{body}</div>}
          </St>;
        })}
      </Sx>
      <Sx cls={"ptail" + (all ? "" : " dtail")} />
    </Scroll>
    <FootPin />
    <footer class={"foot" + (st ? "" : " nostation")}>{st ? <Station name={st.name} act={st.act} /> : <span />}<span class="aux" /></footer>
  </>;
}
