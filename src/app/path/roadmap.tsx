// The roadmap: every exercise as a stop on a tree, pulled down from the top bar (the Path's menu). Each exercise shows today's last answers as
// small diamonds, "continue" when an attempt waits in it, and the planned ones (Consequences, Debate) are dashed. Its foot goes to Review and
// Settings, the Magic Key while this device has none, and the version with the way to update.
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { EXERCISES, parked, todayCount } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { toggleOpts } from "../shell/options.js";
import { setTab } from "../shell/tabs.js";
import { pathNote } from "./shell.tsx";
import { Icon, Knob, dia } from "./ui.tsx";

const BRAND = '<polygon points="256,61 371,177 256,292 141,177" fill="#faaf3f"/><polygon points="256,162 400,306 256,451 112,306" fill="#3155a4"/><polygon points="321,227 256,292 191,227 256,162" fill="#4c8a63"/>';
// where each stop stands on the tree, and what it says under its name
const PLACES: Record<string, { x: number; y: number; lines: string[] }> = {
  practice: { x: 74, y: 206, lines: ["how two", "terms relate"] }, debate: { x: 74, y: 298, lines: ["if A,", "is it B?"] }, find: { x: 74, y: 390, lines: ["terms for", "a relation"] },
  syllogism: { x: 196, y: 250, lines: ["accept, or", "say why not"] }, categories: { x: 316, y: 206, lines: ["what applies", "to a thing"] },
  instance: { x: 316, y: 298, lines: ["a thing that", "is all of them"] },
};
const PLANNED = [{ k: "cons", name: "Consequences", x: 196, y: 342 }, { k: "debate-planned", name: "Debate", x: 258, y: 454 }];
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
  const at = PLACES[k], e = EXERCISES.find((x) => x.k === k), off = !!e && e.needs === "examples" && !state.EX;
  const cur = state.tab === k && !state.optsOpen, cont = !cur && !off && parked(k), c = cur ? "cur" : off ? "off" : "";
  const vs = todayOf(k).slice(-4), lines = off ? ["not on this", "device yet"] : at.lines;
  const act = () => off ? pathNote(name + " needs the course's examples, which this device does not hold yet") : go(k);
  return <g role="button" tabIndex={0} aria-label={name + (cur ? ", here" : cont ? ", continue" : "")} aria-current={cur ? "page" : undefined}
    onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}>
    <rect class="hit" x={at.x - 56} y={at.y - 12} width="112" height="70" />
    <polygon class={"nd " + c} points={dia(at.x, at.y, 9)} />
    {vs.map((v, i) => <polygon class={"rm " + v} points={dia(at.x + 20 + i * 11, at.y, 3.6)} />)}
    <text class={"en " + c} x={at.x} y={at.y + 28} text-anchor="middle">{name}</text>
    {lines.map((t, i) => <text class="ed" x={at.x} y={at.y + 44 + i * 15} text-anchor="middle">{t}</text>)}
    {cont ? <text class="ed cont" x={at.x} y={at.y + 44 + lines.length * 15} text-anchor="middle">continue</text> : null}
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
      <svg class="tree" viewBox="0 0 390 506" role="group" aria-label="The exercises">
        <svg x="176" y="10" width="38" height="50" viewBox="100 50 312 412" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND }} />
        <text class="bn" x="195" y="92" text-anchor="middle">riglam</text>
        <path class="ln" d="M195 102 V124" />
        <path class="ln" d="M195 124 C195 142 74 136 74 156" /><path class="ln" d="M195 124 V156" /><path class="ln" d="M195 124 C195 142 316 136 316 156" />
        <path class="lnp" d="M195 124 C195 150 258 140 258 172 V308 M258 334 V404" />
        <text class="gl" x="74" y="172" text-anchor="middle">TWO TERMS</text><text class="gl" x="196" y="172" text-anchor="middle">THREE TERMS</text><text class="gl" x="316" y="172" text-anchor="middle">ONE EXAMPLE</text>
        <text class="gl" x="258" y="420" text-anchor="middle">DEBATE</text>
        <path class="ln" d="M74 180 V196" /><path class="ln" d="M74 272 V288" /><path class="ln" d="M74 364 V380" />
        <path class="ln" d="M195 180 V240" /><path class="lnp" d="M196 316 V332" />
        <path class="ln" d="M316 180 V196" /><path class="ln" d="M316 272 V288" /><path class="lnp" d="M258 428 V444" />
        {EXERCISES.map((e) => <Node k={e.k} name={e.name} />)}
        {PLANNED.map((p) => <Planned name={p.name} x={p.x} y={p.y} />)}
      </svg>
    </div>
    <div class="rfoot">
      <button type="button" class="lk" onClick={() => setTab("review")}>Review · {n} today</button>
      <button type="button" class="lk" onClick={openSettings}>Settings</button>
      {state.unlock ? <button type="button" class="lk" onClick={() => state.unlock!.open()}><Icon n="key" />Magic Key</button> : null}
      <Version />
      <Knob up label="Slide the roadmap up" onClick={() => toggleMenu(false)} />
    </div>
  </div>;
}
