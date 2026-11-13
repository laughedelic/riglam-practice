// The challenges on the Path (practice/challenge.ts holds what they are and runs them). Two things are drawn here.
//
// Their stop on the roadmap, in the corner beside the name, on a dashed thread of its own that comes in from the top edge: the challenges come from
// outside the tree of the exercises. While one came that was not seen on their page the stop has a gold frame, its thread is gold and it says "new";
// then it says how many wait ("3 open"), and nothing once none does. While a question of one is on screen the stop is where you are, and "continue"
// when one waits in its exercise.
//
// And their page, which stands in for Review: a timeline, the earliest above and the latest lowest, by the station. Each challenge that waits is on it,
// folded to its day, a small diamond for each question (filled once it has an answer, in the color of how it went) and its title, but for the open
// one, which unfolds under its title: the count, the note, and the questions as stops on a dashed stretch of the line, each under the name of its
// exercise, with how it went once it has an answer. A title unfolds its challenge and folds the one open before. A question is opened by its stop; the
// station at the foot starts the open challenge, goes on with it, or asks it again. A challenge that is done, back from its last question, folds, takes
// the ink of a walked stretch and rides up the thread behind the top of the page, where a small stop says how many are done there: pulled down
// (path/back.tsx) or pressed, it brings them all back, folded, above those that wait. The top bar goes back to the roadmap.
import { useContext, useEffect } from "preact/hooks";
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { moves } from "../shell/motion.js";
import { CHALLENGE_NAME, challengeHeld, challengeShown, challengeStation, challengeStop, challengeTimeline, challengeWaits, endFall, foldFall, openChallenge, openItem, revealOpen, showChallenge } from "../practice/challenge.ts";
import type { ChallengeView } from "../practice/challenge.ts";
import { exName } from "../shell/exercises.js";
import { dayText } from "../../domain/challenge.ts";
import type { ItemLine, ItemMark } from "../../domain/challenge.ts";
import { pullByItself } from "./back.tsx";
import { FootPin } from "./news.tsx";
import { Scroll } from "./scroll.tsx";
import { PullCtx, Station, TopBar } from "./shell.tsx";
import { D, Gap, St, Sx, dia } from "./ui.tsx";

/** Where the stop stands on the roadmap's tree: the corner at the right of the name. */
const AT = { x: 322, y: 50 };
/** How a question went, in words. */
const SAID: Record<ItemMark, string> = { ok: "right", part: "partly right", bad: "not right", pend: "not checked yet" };
/** The diamond of a question that has an answer. */
const STOP: Record<ItemMark, string> = { ok: "ok", part: "pt", bad: "no", pend: "pt" };
const count = (n: number) => n + (n === 1 ? " question" : " questions");
/** How long a challenge that is done stays open with its answers before it folds, and folded before it rides up (ms). */
const SHOW = 750, FOLD = 420;

/** The stop of the challenges on the roadmap's tree: nothing while there are none. */
export function ChallengeStop() {
  if (!state.chals.length) return null;
  const { x, y } = AT, s = challengeStop(), h = challengeHeld(), cur = !!h && challengeShown() && !state.optsOpen, cont = !cur && !!h && challengeWaits();
  const sub = cur && h ? (h.at + 1) + " of " + h.doc.items.length : s.fresh ? "new" : cont ? "continue" : s.text;
  const said = cur && h ? "here, question " + sub + ": " + h.doc.title : s.fresh ? "new: " + s.title : cont && h ? "continue: " + h.doc.title : s.text || "all done";
  const act = () => { showChallenge(); };
  return <g class="chn" role="button" tabIndex={0} aria-label={CHALLENGE_NAME + ", " + said} aria-current={cur ? "page" : undefined}
    onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}>
    <path class={"lnp" + (s.fresh ? " new" : "")} d={"M" + x + " -6 V" + (y - (s.fresh ? 14 : 9))} />
    <rect class="hit" x={x - 56} y={y - 16} width="112" height="68" />
    {s.fresh ? <polygon class="chring" points={dia(x, y, 14)} /> : null}
    <polygon class={"nd " + (cur ? "cur" : "")} points={dia(x, y, 9)} />
    <text class={"en " + (cur ? "cur" : "")} x={x} y={y + 29} text-anchor="middle">{CHALLENGE_NAME}</text>
    {sub ? <text class={"ed " + (s.fresh || cont ? "cont" : "chs")} x={x} y={y + 44} text-anchor="middle">{sub}</text> : null}
  </g>;
}

/** The words of a question on the page: the two terms of a pair, or its line. */
const Line = ({ l }: { l: ItemLine }) => "pair" in l ? <>{l.pair[0]} <i>and</i> {l.pair[1]}</> : <>{l.text}</>;

/** A challenge on the timeline: its heading (day, the diamonds of its questions, title), and what folds: its note and its questions. */
function One({ v, open, first }: { v: ChallengeView; open: boolean; first: boolean }) {
  const id = v.doc.id, done = !v.waits, len = v.doc.items.length;
  const unfold = () => {
    if (open) return;
    openChallenge(id);
    setTimeout(() => { revealOpen(moves()); }, moves() ? 350 : 0);       // once the folds have moved
  };
  return <div class="chx" data-id={id} data-open={open ? "" : undefined} data-zone={done ? "past" : "todo"}>
    <section class={"sx chp " + (done ? "walked" : open ? "cur" : "gap") + (first ? " first" : "")}>
      <St d={<D cls={"sec " + (done ? "done" : open ? "now" : "todo")} />} cls="sechead">
        <span class="ph">{dayText(v.doc.date)}
          <span class="chm" aria-hidden="true">{v.doc.items.map((_, i) => { const m = v.rec.marks[i]; return <i class={m ? STOP[m] : ""} />; })}</span>
          <span class="chc">{count(len) + (v.done ? " · " + v.done + " done" : "")}</span></span>
      </St>
      <St d={<span />}><h2 class="chh"><button type="button" class="chtt" aria-expanded={open} onClick={unfold}
        aria-label={dayText(v.doc.date) + ", " + v.doc.title + ", " + (done ? "done" : v.done + " of " + v.n + " answered")}>{v.doc.title}</button></h2></St>
      <div class="chfold" inert={!open}><div>{v.doc.note ? <St d={<span />}><p class="chnote">{v.doc.note}</p></St> : null}<Gap h={12} /></div></div>
    </section>
    <div class="chfold" inert={!open}><div>
      <section class={"sx chq " + (done ? "walked" : "gap")}>
        {v.doc.items.map((it, i) => {
          const l = v.lines[i], m = v.rec.marks[i], here = v.at === i;
          const body = <><span class="chl">{exName(it.exercise)}{here ? <b>continue</b> : null}</span>
            <span class="cht">{l ? <Line l={l} /> : "Not in this version of the app"}</span>
            {m ? <span class="chv">{SAID[m]}</span> : null}</>;
          return <St d={<D cls={"sub " + (m ? STOP[m] : l ? "pk" : "nil")} />} cls={"sb chi" + (m ? " done" : "") + (l ? "" : " off")}>
            {l ? <button type="button" class="chb" onClick={() => { openItem(id, i); }}>{body}</button> : <div class="chb">{body}</div>}
          </St>;
        })}
      </section>
    </div></div>
  </div>;
}

/** The top of the thread while done challenges are behind it: a small stop that says how many, the handle of the pull (path/back.tsx). Pressed, it pulls by itself. */
function Past({ n }: { n: number }) {
  const pull = useContext(PullCtx);
  const go = (e: Event) => { const main = (e.currentTarget as HTMLElement).closest<HTMLElement>(".main"); if (main) pullByItself(main, pull); };
  return <section class="sx walked chpast first" role="button" tabIndex={0} aria-label={n + " done. Pull down or press to bring " + (n === 1 ? "it" : "them") + " back"}
    onClick={go} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } }}>
    <St d={<D cls="sub" />}><span class="ph"><b>{n} done</b><span>pull down</span></span></St>
  </section>;
}

/**
 * A challenge done, back from its last question (`state.chalFall`): it shows its answers for a moment, folds, and rides up the thread behind the top
 * of the page; a copy of it, with the paper behind it, is what rides up over the ones above, while the challenge itself gives its room back. Then the
 * small stop at the top counts it, and the latest that waits opens. With reduced motion it is simply behind the top. Left before it is, it is there.
 */
function useFall(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const still = !moves();
    let t = 0, over = false, ghost: HTMLElement | null = null, n: HTMLElement | null = null;
    const stop = () => {
      over = true; clearTimeout(t);
      if (ghost) ghost.remove();
      if (n) { n.getAnimations().forEach((a) => a.cancel()); n.style.height = ""; n.style.visibility = ""; n.style.overflow = ""; }
    };
    const land = () => {
      if (over) return;
      stop(); endFall(); render();
      const row = document.querySelector<HTMLElement>("#path .chpast");
      if (row && !still) { row.classList.add("bump"); setTimeout(() => row.classList.remove("bump"), 700); }
      requestAnimationFrame(() => { revealOpen(!still); });
    };
    const ride = () => {
      const sc = document.querySelector<HTMLElement>("#path .pscroll");
      n = sc ? sc.querySelector<HTMLElement>('.chx[data-id="' + CSS.escape(id) + '"]') : null;
      if (!sc || !n || !n.animate) { land(); return; }
      const r = n.getBoundingClientRect(), top = r.top - sc.getBoundingClientRect().top, up = Math.max(0, top) + r.height + 16, ms = Math.min(900, 440 + up * 0.9);
      ghost = n.cloneNode(true) as HTMLElement;
      ghost.classList.add("fly"); ghost.style.top = (top + sc.scrollTop) + "px"; ghost.setAttribute("aria-hidden", "true"); ghost.inert = true;
      sc.appendChild(ghost);
      n.style.height = r.height + "px"; n.style.visibility = "hidden"; n.style.overflow = "hidden";
      n.animate([{ height: r.height + "px" }, { height: "0px" }], { duration: ms, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" });
      ghost.animate([{ transform: "translateY(0)" }, { transform: "translateY(" + -up + "px)" }], { duration: ms, easing: "cubic-bezier(.5,0,.75,.35)", fill: "forwards" }).finished.then(land, land);
      t = window.setTimeout(land, ms + 400);
    };
    t = window.setTimeout(() => {
      foldFall();
      if (still) { land(); return; }
      t = window.setTimeout(ride, FOLD);
    }, still ? 0 : SHOW);
    return () => { if (!over) { stop(); endFall(); } };
  }, [id]);
}

/** The challenges' page. */
export function ChallengePage() {
  const t = challengeTimeline(), fall = state.chalFall;
  useFall(fall);
  if (!t.shown.length && !t.hidden) return null;
  const st = challengeStation();
  return <>
    <TopBar title={CHALLENGE_NAME} />
    <Scroll>
      {t.hidden ? <Past n={t.hidden} /> : null}
      {t.shown.map((v, i) => <One key={v.doc.id} v={v} open={t.open === v.doc.id} first={!t.hidden && i === 0} />)}
      {t.waiting || fall ? null : <Sx cls="walked chnone"><St d={<span />}><p class="chnote">Nothing is waiting. The next challenge shows up here.</p></St></Sx>}
      <Sx cls={"ptail" + (t.waiting ? " dtail" : "")} />
    </Scroll>
    <FootPin />
    <footer class={"foot" + (st ? "" : " nostation")}>{st ? <Station name={st.name} act={st.act} /> : <span />}<span class="aux" /></footer>
  </>;
}
