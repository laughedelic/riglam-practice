// The roadmap: every exercise as a stop on a tree, slid in from the left by the back chevron in the top bar or the system Back (the Path's menu). Each exercise shows today's last answers as
// small diamonds, "continue" when an attempt waits in it, and the planned one (Debate, which Pervasions and Syllogisms lead to) is dashed. Its foot goes to Review and
// Settings, the Magic Key while this device has none, and the version with the way to update.
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { EXERCISES, parked, todayCount } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { toggleOpts } from "../shell/options.js";
import { setTab } from "../shell/tabs.js";
import { Icon, Knob, dia } from "./ui.tsx";

const BRAND = '<polygon points="256,61 371,177 256,292 141,177" fill="#faaf3f"/><polygon points="256,162 400,306 256,451 112,306" fill="#3155a4"/><polygon points="321,227 256,292 191,227 256,162" fill="#4c8a63"/>';
// where each stop stands on the tree: a stop's name, and "continue" under it, are 54 px tall, and the line to the stop below starts under them
const PLACES: Record<string, { x: number; y: number }> = {
  practice: { x: 74, y: 198 }, find: { x: 74, y: 282 }, debate: { x: 74, y: 366 }, syllogism: { x: 196, y: 282 }, categories: { x: 316, y: 198 }, instance: { x: 316, y: 282 },
};
const PLANNED = { name: "Debate", x: 135, y: 480 };
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
function openSettings() { state.menuOpen = false; state.menuPeek = false; state.sessOpen = false; state.sessPage = null; state.skipAsk = false; toggleOpts(true); }

function Node({ k, name }: { k: string; name: string }) {
  const at = PLACES[k];
  const cur = state.tab === k && !state.optsOpen, cont = !cur && parked(k), c = cur ? "cur" : "";
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
function Planned({ name, x, y }: { name: string; x: number; y: number }) {
  return <g>
    <polygon class="nd plan" points={dia(x, y, 9)} />
    <text class="en plan" x={x} y={y + 28} text-anchor="middle">{name}</text>
    <text class="ed pl" x={x} y={y + 44} text-anchor="middle">coming</text>
  </g>;
}
// the version, and where the look for a newer one stands (platform.about, platform.updates)
function Version() {
  const a = state.about, u = state.updates; if (!a) return null;
  const st = u ? u.status() : null, v = "v" + a.version;
  if (st === "ready") return <p class="rver" role="status">{v} · update available · <button type="button" onClick={() => u!.apply()}>install</button></p>;
  if (st === "downloading") return <p class="rver" role="status">{v} · downloading an update</p>;
  if (st === "checking") return <p class="rver" role="status">{v} · checking for an update</p>;
  if (st === "unknown") return <p class="rver" role="status">{v} · could not check · <button type="button" onClick={() => u!.check()}>check again</button></p>;
  if (st === "current") return <p class="rver" role="status">{v} · up to date · <button type="button" onClick={() => u!.check()}>check</button></p>;
  return <p class="rver" role="status">{v + (a.latest === "newer" ? " · a newer version is out" : "")}</p>;
}

export function Roadmap() {
  const on = state.menuOpen, box = useRef<HTMLDivElement>(null), was = useRef(on);
  useEffect(() => {
    if (on && !was.current) { const n = box.current && box.current.querySelector<SVGElement>("[aria-current=page]"); if (n) n.focus({ preventScroll: true }); }
    else if (!on && was.current) { const b = box.current && box.current.closest(".pa")?.querySelector<HTMLElement>(".tstn"); if (b) b.focus({ preventScroll: true }); }
    was.current = on;
  }, [on]);
  const n = todayCount().n;
  return <div ref={box} class={"road" + (on ? " on" : "")} role="dialog" aria-modal="true" aria-label="Roadmap" aria-hidden={on ? "false" : "true"} inert={!on}>
    <div class="rbody">
      <svg class="tree" viewBox="0 0 390 530" role="group" aria-label="The exercises">
        <svg x="176" y="10" width="38" height="50" viewBox="100 50 312 412" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND }} />
        <text class="bn" x="195" y="92" text-anchor="middle">riglam</text>
        <path class="ln" d="M195 102 V124" />
        <path class="ln" d="M195 124 C195 142 74 136 74 156 V189" /><path class="ln" d="M195 124 V273" /><path class="ln" d="M195 124 C195 142 316 136 316 156 V189" />
        <path class="ln" d="M74 252 V273" /><path class="ln" d="M74 336 V357" /><path class="ln" d="M316 252 V273" />
        <path class="lnp" d="M74 420 C74 452 135 440 135 471" /><path class="lnp" d="M196 336 V396 C196 452 135 440 135 471" />
        {EXERCISES.map((e) => <Node k={e.k} name={e.name} />)}
        <Planned {...PLANNED} />
      </svg>
    </div>
    <div class="rfoot">
      <button type="button" class="lk" onClick={() => setTab("review")}>Review · {n} today</button>
      <button type="button" class="lk" onClick={openSettings}>Settings</button>
      {state.unlock ? <button type="button" class="lk" onClick={() => state.unlock!.open()}><Icon n="key" />Magic Key</button> : null}
      <Version />
      <Knob cls="lt" label="Slide the roadmap away to the left" onClick={() => toggleMenu(false)} />
    </div>
  </div>;
}
