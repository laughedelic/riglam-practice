// Daily practice on the Path (practice/daily.ts runs the session). Two things are drawn here.
//
// What a question of a session has at the top of its thread, in the first section and above its heading: a small walked stop on the line holds the
// session's questions as small diamonds, a group for each round and one for what came back, colored as they went, the one being asked in gold; under
// them the line that says what this question carries over from the one before. Its result has the same row without that line, the question's own
// diamond in the color of its answer. The exercise below it and the top bar are as they always are. A question that is not a session's has the gap
// every first section starts with.
//
// And the session's last station, after its last question: a screen of its own, drawn like the station of a new stage (paper and ink, not a question's
// gold). It says how it went (how many were right, then each round by what it was about with its questions as they went, and what came back), and
// offers one more round, at the learner's own pace or as a Sprint round, against the clock: the Sprint round first, as a challenge, when every question was
// right. Its station at the foot goes back to the roadmap, as the top bar does.
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { DAILY_NAME, dailyRun, dailyShown, leaveDaily, moreDaily } from "../practice/daily.ts";
import type { DailyMark, DailyRun } from "../practice/daily.ts";
import { sessionTally } from "../../domain/session.ts";
import type { SessionTally } from "../../domain/session.ts";
import { FootPin } from "./news.tsx";
import { Scroll } from "./scroll.tsx";
import { Station, TopBar, pathNote } from "./shell.tsx";
import { FitTerm } from "./stop-def.tsx";
import { D, Gap, Head, Minis, St, Sx } from "./ui.tsx";

/** The color of a question that was answered: an answer whose examples wait for Claude is partly right's until the check is in; a skipped one stays hollow. */
const MINI: Record<DailyMark, string> = { "": "nil", ok: "ok", part: "part", bad: "bad", pend: "part", skip: "nil" };
/** The same in words, for a screen reader. */
const SAID: Record<DailyMark, string> = { "": "not answered", ok: "right", part: "partly right", bad: "wrong", pend: "waiting for Claude", skip: "skipped" };

/** The marks of the session's steps, group by group. */
function byGroup(s: DailyRun): { name: string; marks: DailyMark[]; from: number }[] {
  let from = 0;
  return s.groups.map((g) => { const out = { name: g.name, marks: s.marks.slice(from, from + g.n), from }; from += g.n; return out; });
}

/**
 * The top of a first section: the session's row when the question on screen is a session's, else the gap of `h` px that the section starts with. On the question the row
 * has the line that ties it to the one before; on its result (`done`) it has the diamonds alone, the question's own in the color of its answer.
 */
export function ThreadTop({ done = false, h = 14 }: { done?: boolean; h?: number }) {
  const s = dailyRun();
  if (!s || !dailyShown()) return <Gap h={h} />;
  const n = s.steps.length, tie = done ? "" : s.steps[s.at].tie, went = SAID[s.marks[s.at]];
  return <>
    <St d={<D cls="sub done" />} cls="dly">
      <span class="dlym" role="img" aria-label={"Question " + (s.at + 1) + " of " + n + " in this session" + (done ? ": " + went : "")}>
        {byGroup(s).map((g) => <Minis list={g.marks.map((m, k) => (g.from + k === s.at ? "at " + (done ? MINI[m] : "now") : MINI[m]))} />)}
        <span class="dlyn" aria-hidden="true">{(s.at + 1) + " of " + n}</span>
      </span>
      {tie ? <span class="dlyt hand">{tie}</span> : null}
    </St>
    <Gap h={8} />
  </>;
}

/** What the tally says beside the count of the right ones: "1 partly right, 2 wrong and 1 skipped." Nothing when every question was right. */
function restOf(t: SessionTally): string {
  const parts = [t.partly ? t.partly + " partly right" : "", t.wrong ? t.wrong + " wrong" : "", t.skipped ? t.skipped + " skipped" : "", t.waiting ? t.waiting + " waiting for Claude’s check" : ""].filter(Boolean);
  if (!parts.length) return "";
  const last = parts.pop() as string;
  return (parts.length ? parts.join(", ") + " and " + last : last) + ".";
}

/** The last station: how the session went, and one more round. */
function DailyEnd({ s }: { s: DailyRun }) {
  // the station at the foot has the focus, as after a check, so that Enter goes on (quiet: the app moved it there, so no ring is drawn on it until a Tab)
  useEffect(() => {
    const st = document.querySelector<HTMLElement>("#path #stn"); if (!st) return;
    st.dataset.quiet = "1"; st.addEventListener("blur", () => { delete st.dataset.quiet; }, { once: true }); st.focus({ preventScroll: true });
  }, []);
  const t = sessionTally(s.marks), rest = restOf(t);
  const more = (sprint: boolean) => () => { if (!moreDaily(sprint)) pathNote("Nothing more to practice for now"); };
  const round = (name: string, sprint: boolean) => <button type="button" class="plnk" onClick={more(sprint)}>{name}</button>;
  return <>
    <TopBar title={DAILY_NAME} back={{ label: "Back to the roadmap", go: leaveDaily }} />
    <Scroll>
      <Sx cls="cur first tstop dend"><Gap h={14} /><Head d={<D cls="sec tsd" mark="check" />} h="Session done" sub={t.n + (t.n === 1 ? " question" : " questions")} /><Gap h={4} />
        <St d={<D cls="sub done" />} cls="stm thing"><FitTerm text={t.right + " of " + t.n + " right"} whole /></St>
        <div class="wtext tup">
          <ul class="dlyg" aria-label="How each round went">
            {byGroup(s).map((g) => <li><span class="dlygn">{g.name}</span>
              <span role="img" aria-label={g.marks.map((m) => SAID[m]).join(", ")}><Minis list={g.marks.map((m) => MINI[m])} /></span></li>)}
          </ul>
          {rest ? <p class="tup-note">{rest}</p> : null}
          {t.right === t.n
            ? <p class="tup-note">Everything right. Up for a challenge? <span class="nw">{round("Sprint round", true)},</span> or <span class="nw">{round("one more round", false)}</span> without the clock.</p>
            : <p class="tup-note">Want more today? <span class="nw">{round("One more round", false)},</span> or a <span class="nw">{round("Sprint round", true)}</span> against the clock.</p>}
        </div>
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <FootPin />
    <footer class="foot"><Station back name="Back to the roadmap" act={leaveDaily} /><span class="aux" /></footer>
  </>;
}
/** The session's last station, in front of the exercise its last question was in. */
export function dailyEndScreen(s: DailyRun): { cls: string; node: ComponentChildren } {
  return { cls: "done", node: <DailyEnd s={s} /> };
}
