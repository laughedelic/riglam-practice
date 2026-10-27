// The roadmap: every exercise as a stop on a tree, under the exercise. The back chevron in the top bar or the system Back slides the exercise away to the right and shows it; "Continue" slides the exercise
// back in from the right. Each exercise shows today's last answers as small diamonds, "continue" when an attempt waits in it, and the planned one (Debate, which the three branches lead to, and
// the path goes on from it) is dashed. Above its foot a notice says when a newer version is ready; the foot goes to Review and Settings, the Magic Key while this device has none, and the
// version with the way to update. The roadmap looks for a newer version every time it opens.
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { EXERCISES, parked, todayCount } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { toggleOpts } from "../shell/options.js";
import { setTab } from "../shell/tabs.js";
import { isEx } from "../shell/render.js";
import { BRAND, Lockup, NAME_BOTTOM, NAME_Y } from "./brand.tsx";
import { Icon, dia } from "./ui.tsx";

// where each stop stands on the tree: a stop's name, and "continue" under it, are 54 px tall, and the line to the stop below starts under them
const PLACES: Record<string, { x: number; y: number }> = {
  practice: { x: 74, y: 198 }, find: { x: 74, y: 282 }, debate: { x: 74, y: 366 }, syllogism: { x: 195, y: 240 }, categories: { x: 316, y: 198 }, instance: { x: 316, y: 282 },
};
const PLANNED = { name: "Debate", x: 195, y: 470 };
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
/** The notice that a newer version is ready, above the foot: the same words and the same ink block as the notice the rest of the app shows under the top bar (pwa/update-toast.ts), which gives way while the roadmap is open. */
function Notice() {
  const u = state.updates; if (!u || u.status() !== "ready") return null;
  return <div class="rnote" role="status"><span>{u.readyText ? u.readyText() : "New version ready."}</span><button type="button" onClick={() => u.apply()}>Update now</button></div>;
}
// the version, and where the look for a newer one stands (platform.about, platform.updates): each state says what it is, and the way on is a button of a full touch height
function Version() {
  const a = state.about, u = state.updates; if (!a) return null;
  const st = u ? u.status() : null, v = "v" + a.version;
  const row = (kind: string, text: string, act?: { label: string; on: () => void }, busy = false) =>
    <div class={"rver " + kind} role="status" aria-busy={busy ? "true" : undefined}>
      <span class="rvn">{v}</span>
      <span class="rvs">{busy ? <Icon n="refresh" cls="i spin" /> : null}{text}</span>
      {act ? <button type="button" class="lk" onClick={act.on}>{act.label}</button> : null}
    </div>;
  if (st === "ready") return row("hot", "Update ready", { label: "Update now", on: () => u!.apply() });
  if (st === "downloading") return row("busy", "Downloading the update…", undefined, true);
  if (st === "checking") return row("busy", "Checking for updates…", undefined, true);
  if (st === "unknown") return row("", "Could not check", { label: "Try again", on: () => void u!.check() });
  if (st === "current") return row("ok", "Up to date", { label: "Check again", on: () => void u!.check() });
  return <div class="rver" role="status"><span class="rvn">{v}</span>{a.latest === "newer" ? <span class="rvs">a newer version is out</span> : null}</div>;
}

export function Roadmap() {
  const on = state.menuOpen, box = useRef<HTMLDivElement>(null), was = useRef(on);
  useEffect(() => {
    if (on && !was.current) {
      const n = box.current && box.current.querySelector<SVGElement>("[aria-current=page]"); if (n) n.focus({ preventScroll: true });
      // every time the roadmap opens it looks for a newer version, unless the device is offline (a look from the last few seconds stands)
      if (navigator.onLine !== false && state.updates) void state.updates.check(8000);
    }
    else if (!on && was.current) { const b = box.current && box.current.closest(".pa")?.querySelector<HTMLElement>(".tstn"); if (b) b.focus({ preventScroll: true }); }
    was.current = on;
  }, [on]);
  // the notice under the top bar (pwa/update-toast.ts) gives way while the roadmap is open: it has its own notice at the bottom
  useEffect(() => { document.documentElement.classList.toggle("road-open", on); return () => document.documentElement.classList.remove("road-open"); }, [on]);
  const n = todayCount().n, back = state.mode === "quiz" && isEx();
  return <div ref={box} class={"road" + (on ? " on" : "")} role="dialog" aria-modal="true" aria-label="Roadmap" aria-hidden={on ? "false" : "true"} inert={!on}>
    <div class="rbody">
      <svg class="tree" viewBox="0 0 390 590" role="group" aria-label="The exercises">
        <defs><linearGradient id="rdfade" gradientUnits="userSpaceOnUse" x1="0" y1="526" x2="0" y2="584"><stop offset="0" style="stop-color:var(--ink3)" /><stop offset="1" style="stop-color:var(--ink3);stop-opacity:0" /></linearGradient></defs>
        <svg x="177" y="6" width="36" height="48" viewBox="100 50 312 412" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND }} />
        <Lockup x={195} y={NAME_Y} />
        <path class="ln" d={"M195 " + (NAME_Y + NAME_BOTTOM + 5) + " V124"} />
        <path class="ln" d="M195 124 C195 142 74 136 74 156 V189" /><path class="ln" d="M195 124 V231" /><path class="ln" d="M195 124 C195 142 316 136 316 156 V189" />
        <path class="ln" d="M74 252 V273" /><path class="ln" d="M74 336 V357" /><path class="ln" d="M316 252 V273" />
        <path class="lnp" d="M74 420 C74 444 195 436 195 461" /><path class="lnp" d="M195 294 V461" /><path class="lnp" d="M316 336 V420 C316 444 195 436 195 461" />
        <path class="lnp fade" d="M195 526 V584" style={{ stroke: "url(#rdfade)" }} />
        {EXERCISES.map((e) => <Node k={e.k} name={e.name} />)}
        <Planned {...PLANNED} />
      </svg>
    </div>
    <Notice />
    {back ? <div class="rgo"><button type="button" class="lk rcont" onClick={() => toggleMenu(false)}>Continue<Icon n="chev" /></button></div> : null}
    <div class="rfoot">
      <button type="button" class="lk" onClick={() => setTab("review")}>Review · {n} today</button>
      <button type="button" class="lk" onClick={openSettings}>Settings</button>
      {state.unlock ? <button type="button" class="lk" onClick={() => state.unlock!.open()}><Icon n="key" />Magic Key</button> : null}
      <Version />
    </div>
  </div>;
}
