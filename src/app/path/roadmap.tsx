// The roadmap: every exercise as a stop on a tree, under the exercise. The back chevron in the top bar or the system Back slides the exercise away to the right and shows it; "Continue", when the exercise
// has an attempt under way, slides the exercise back in from the right (a stop does the same). Each exercise shows today's last answers as small diamonds, "continue" when an attempt waits in it, and the planned one (Debate, which the three branches lead to, and
// the path goes on from it) is dashed. Above its foot a line is pinned while a newer version waits (Update), or while
// What's new has something not read yet (path/news.tsx). Where the trunk parts into the three branches stands the stop of Daily practice (practice/daily.ts), which draws on all of them: a
// session of questions from every exercise; under its name, how many questions it has, "continue" while one waits, where it stands while its question is on screen, and "done today".
// In the corner beside the name, while there is one, stands the stop of the challenge that everyone gets (path/challenge.tsx), on a thread of its own; the roadmap asks to look for another every time it opens.
// The foot goes to Review and Settings, the Magic Key while this device has none. A Preview says on that line which build it is and has the way to look again. The roadmap looks for a newer version every time it opens.
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { EXERCISES, parked, todayCount, unfinished } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { openKey, toggleOpts } from "../shell/options.js";
import { setTab } from "../shell/tabs.js";
import { givenUnderWay } from "../practice/given.ts";
import { DAILY_NAME, dailyRun, dailySize, dailyShown, dailyToday, startDaily } from "../practice/daily.ts";
import { challengeShown, lookForChallenge } from "../practice/challenge.ts";
import { ChallengeStop } from "./challenge.tsx";
import { isEx } from "../shell/render.js";
import { BRAND, Lockup, NAME_BOTTOM, NAME_Y } from "./brand.tsx";
import { Icon, dia } from "./ui.tsx";
import { pathNote } from "./shell.tsx";
import { StageRings } from "./progression.tsx";
import { RoadPin } from "./news.tsx";

// where each stop stands on the tree: a stop's name, and "continue" under it, are 54 px tall, and the line to the stop below starts under them
const PLACES: Record<string, { x: number; y: number }> = {
  practice: { x: 74, y: 270 }, find: { x: 74, y: 354 }, debate: { x: 74, y: 438 }, syllogism: { x: 195, y: 312 }, categories: { x: 316, y: 270 }, instance: { x: 316, y: 354 },
};
const PLANNED = { name: "Debate", x: 195, y: 542 };
// Daily practice stands on the trunk, above the fork (the trunk parts at y 196)
const DAILY = { x: 195, y: 132 };
const MINI: Record<string, string> = { ok: "ok", part: "part", bad: "bad", pend: "pend" };

/** Today's answers in an exercise, oldest first. */
function todayOf(k: string): string[] {
  const t = today();
  const list = k === "debate" ? Object.values(state.debates) : Object.values(state.answers).filter((a) => (k === "practice" ? !a.mode : a.mode === ({ find: "find", syllogism: "syllogism", categories: "categories", instance: "instance" } as Record<string, string>)[k]));
  return list.filter((a) => dayOf(a.at) === t).sort((a, b) => (a.at || "").localeCompare(b.at || "")).map((a) => MINI[gradeOf(a)] || "bad");
}
function go(k: string) {
  if (state.mode !== "quiz") return;
  setTab(k);
}
// Settings from the roadmap stands over it: Back and its own way back go to the roadmap (shell/history.js)
function openSettings() { state.fromRoad = true; state.menuOpen = false; state.sessOpen = false; state.sessPage = null; state.skipAsk = false; toggleOpts(true); }

function Node({ k, name }: { k: string; name: string }) {
  const at = PLACES[k];
  // while a session's question is on screen in the exercise, "here" is the session's stop, not the exercise's; the same with a question of the challenge
  const cur = state.tab === k && !state.optsOpen && !dailyShown() && !challengeShown(), cont = !cur && parked(k), c = cur ? "cur" : "";
  const vs = todayOf(k).slice(-4);
  const act = () => go(k);
  return <g role="button" tabIndex={0} aria-label={name + (cur ? ", here" : cont ? ", continue" : "")} aria-current={cur ? "page" : undefined}
    onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}>
    <rect class="hit" x={at.x - 56} y={at.y - 12} width="112" height="66" />
    <polygon class={"nd " + c} points={dia(at.x, at.y, 9)} />
    {vs.map((v, i) => <polygon class={"rm " + v} points={dia(at.x + 20 + i * 11, at.y, 3.6)} />)}
    <text class={"en " + c} x={at.x} y={at.y + 28} text-anchor="middle">{name}</text>
    {cont ? <text class="ed cont" x={at.x} y={at.y + 44} text-anchor="middle">continue</text> : null}
  </g>;
}
/** The stop of Daily practice: it starts a session, or goes on with the one under way. */
function DailyNode() {
  const run = dailyRun(), cur = dailyShown() && !state.optsOpen, cont = !!run && !run.end && !cur, c = cur ? "cur" : "";
  const sub = cur && run ? (run.at + 1) + " of " + run.steps.length : cont ? "continue" : dailyToday() ? "done today" : dailySize();
  const act = () => { if (state.mode === "quiz" && !startDaily()) pathNote("Nothing to practice yet"); };
  return <g role="button" tabIndex={0} aria-label={DAILY_NAME + ", " + (cur ? "here, question " + sub : sub)} aria-current={cur ? "page" : undefined}
    onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}>
    <rect class="hit" x={DAILY.x - 70} y={DAILY.y - 12} width="140" height="62" />
    <polygon class={"nd " + c} points={dia(DAILY.x, DAILY.y, 9)} />
    <text class={"en " + c} x={DAILY.x} y={DAILY.y + 28} text-anchor="middle">{DAILY_NAME}</text>
    <text class={"ed " + (cont ? "cont" : "pl")} x={DAILY.x} y={DAILY.y + 44} text-anchor="middle">{sub}</text>
  </g>;
}
function Planned({ name, x, y }: { name: string; x: number; y: number }) {
  return <g>
    <polygon class="nd plan" points={dia(x, y, 9)} />
    <text class="en plan" x={x} y={y + 28} text-anchor="middle">{name}</text>
    <text class="ed pl" x={x} y={y + 44} text-anchor="middle">coming</text>
  </g>;
}
export function Roadmap() {
  const on = state.menuOpen, box = useRef<HTMLDivElement>(null), was = useRef(on);
  useEffect(() => {
    if (on && !was.current) {
      const n = box.current && box.current.querySelector<SVGElement>("[aria-current=page]"); if (n) n.focus({ preventScroll: true });
      // every time the roadmap opens it looks for a newer version, unless the device is offline (a look from the last few seconds stands)
      if (navigator.onLine !== false && state.updates) void state.updates.check(8000);
      lookForChallenge();      // and for another challenge (practice/challenge.ts)
    }
    // closed, it gives the focus to the top bar of the screen under it, unless that screen took it already (the Magic Key page, to its field)
    else if (!on && was.current) {
      const a = document.activeElement, b = box.current && box.current.closest(".pa")?.querySelector<HTMLElement>(".tstn");
      if (b && (!a || a === document.body || !!box.current?.contains(a))) b.focus({ preventScroll: true });
    }
    was.current = on;
  }, [on]);
  // "Continue" goes back to the exercise under the roadmap, so it is there only when that exercise has an attempt to continue; with a pair only drawn (the first time the app opens) the way in is its stop.
  // A given question under the roadmap (practice/given.ts) is continued the same way, whatever the exercise's own attempt behind it is.
  const n = todayCount().n, back = state.mode === "quiz" && isEx() && (unfinished(state.tab) || givenUnderWay());
  return <div ref={box} class={"road" + (on ? " on" : "")} role="dialog" aria-modal="true" aria-label="Roadmap" aria-hidden={on ? "false" : "true"} inert={!on}>
    <div class="rbody">
      <svg class="tree" viewBox="0 0 390 662" role="group" aria-label="The exercises">
        <defs><linearGradient id="rdfade" gradientUnits="userSpaceOnUse" x1="0" y1="598" x2="0" y2="656"><stop offset="0" style="stop-color:var(--ink3)" /><stop offset="1" style="stop-color:var(--ink3);stop-opacity:0" /></linearGradient></defs>
        <svg class="rhead rfig" x="177" y="6" width="36" height="48" viewBox="100 50 312 412" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND }} />
        <Lockup x={195} y={NAME_Y} />
        <path class="ln" d={"M195 " + (NAME_Y + NAME_BOTTOM + 5) + " V" + (DAILY.y - 9)} /><path class="ln" d={"M195 " + (DAILY.y + 54) + " V196"} />
        <DailyNode />
        <ChallengeStop />
        <path class="ln" d="M195 196 C195 214 74 208 74 228 V261" /><path class="ln" d="M195 196 V303" /><path class="ln" d="M195 196 C195 214 316 208 316 228 V261" />
        <path class="ln" d="M74 324 V345" /><path class="ln" d="M74 408 V429" /><path class="ln" d="M316 324 V345" />
        <path class="lnp" d="M74 492 C74 516 195 508 195 533" /><path class="lnp" d="M195 366 V533" /><path class="lnp" d="M316 408 V492 C316 516 195 508 195 533" />
        <path class="lnp fade" d="M195 598 V656" style={{ stroke: "url(#rdfade)" }} />
        {EXERCISES.map((e) => <Node k={e.k} name={e.name} />)}
        <Planned {...PLANNED} />
      </svg>
    </div>
    {state.leaveAsk ? <div class="rnote" role="status"><span>Back again to close</span></div> : null}
    {back ? <div class="rgo"><button type="button" class="lk rcont" onClick={() => toggleMenu(false)}>Continue<Icon n="chev" /></button></div> : null}
    <RoadPin />
    <div class={"rfoot" + (state.unlock ? " keyed" : "")}>
      <StageRings />
      {state.unlock ? <span class="rsp" aria-hidden="true" /> : null}
      <button type="button" class="lk" onClick={() => setTab("review")}>Review · {n} today</button>
      <button type="button" class="lk" onClick={openSettings}>Settings</button>
      {state.unlock ? <button type="button" class="lk" onClick={() => openKey()}><Icon n="key" />Magic Key</button> : null}
    </div>
  </div>;
}
