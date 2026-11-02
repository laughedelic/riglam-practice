// The Path's frame: the top bar (the way back to the roadmap, the exercise's name with the progression ring after it, the tools), the station at the edge,
// the side stations, and the short note at the foot.
import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext, useRef } from "preact/hooks";
import { state } from "../state.js";
import { setBlitz } from "../shell/timers.js";
import { skipAsks, skipPair } from "../practice/skips.js";
import { toRoad } from "../shell/menu.js";
import { isEx } from "../shell/render.js";
import { openBlitzOptions, sessBack, toggleSess } from "../shell/session.js";
import { voiceField } from "../shell/voice.js";
import { Clock } from "./clock.tsx";
import { Pull, SLIDE, bump } from "./gesture.ts";
import type { ScanPlan } from "./scan.tsx";
import { refreshPath } from "./index.tsx";
import { currentLook } from "./look.ts";
import { progressOn, sheetTitle } from "./options.tsx";
import { ProgressRing } from "./progress.tsx";
import { Bridge, Icon } from "./ui.tsx";
import { FootPin } from "./news.tsx";

export const PullCtx = createContext<Pull>(new Pull());

/** The top bar: its title and tools. */
export interface TopBarProps { title: string; tools?: boolean; /** where the chevron and the title go back to, when it is not the roadmap (Settings: its page, or where it was opened from) */ back?: { label: string; go: () => void } }

const HOLD_MS = 500;
export function TopBar({ title, tools = false, back }: TopBarProps) {
  // while the practice options are open the bar is theirs: it names them in place of the exercise, its tools give way and the options button becomes the close
  const shown = (state.mode === "quiz" && isEx() && sheetTitle()) || "", heading = shown || title;
  // the Progression page hangs under the ring: the bar keeps the name and the ring (pressed), the other tools give way, and the options button is the close
  const prog = state.mode === "quiz" && isEx() && progressOn(), away = !!shown || prog;
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), held = useRef(false);
  const ex = state.mode === "quiz" && isEx(), u = state.ui;
  // on a page of the practice options the bar's back goes to the list of the options, not out to the roadmap
  const subpage = !!shown && !!state.sessPage;
  const roadmap = subpage ? sessBack : back ? back.go : toRoad;
  // the countdown bar (clock.tsx): a new countdown is a new bar (keyed by its start), so that its animation starts from full
  const tq = u && u.tq;
  // holding the stopwatch opens the Sprint page of the practice options; a press switches Sprint on or off for this exercise (shell/timers.js)
  const bzDown = (ev: PointerEvent) => { if (ev.button) return; held.current = false; clearTimeout(hold.current); hold.current = setTimeout(() => { held.current = true; openBlitzOptions(); }, HOLD_MS); };
  const bzStop = () => clearTimeout(hold.current);
  return <>
    <header class="ptb">
      <button type="button" class="tstn" aria-label={subpage ? "Back to the options" : back ? back.label : "Back to the roadmap"} onClick={roadmap}><Icon n="chev" /></button>
      <button type="button" class="ptb-t" aria-label={heading + (shown ? "" : back ? ", " + back.label.toLowerCase() : ", the roadmap")} onClick={roadmap}><span>{heading}</span></button>
      {tools && !shown && ex ? <ProgressRing /> : null}
      <span class="spc" />
      {tools && !away && ex ? <button type="button" class={"pib" + (state.blitz ? " on" : "")} role="switch" aria-checked={state.blitz ? "true" : "false"} aria-label={state.blitz ? "Sprint on (hold for the Sprint options)" : "Sprint off (hold for the Sprint options)"}
        onPointerDown={bzDown} onPointerUp={bzStop} onPointerLeave={bzStop} onPointerCancel={bzStop} onContextMenu={(ev) => ev.preventDefault()}
        onClick={() => { if (held.current) { held.current = false; return; } setBlitz(!state.blitz); }}><Icon n={state.blitz ? "blitz" : "blitzoff"} /></button> : null}
      {tools && ex ? <button type="button" class="pib" aria-label={prog ? "Close the progression" : shown ? "Close the practice options" : "Practice options"} aria-expanded={state.sessOpen ? "true" : "false"} onClick={() => toggleSess(!state.sessOpen)}><Icon n={away ? "close" : "opts"} /></button> : null}
    </header>
    {tq ? <Clock key={tq.t0 + "/" + tq.limit} tq={tq} late={!!u.late} /> : null}
  </>;
}

/**
 * The lower part of the screen above the foot, where voice listens: a field to tap or hold with a thumb anywhere in it, with what was heard and the chip of the step that went on
 * inside it (shell/voice.js builds it and repaints it in place, by its id). Nothing is there where the screen asks nothing, and with the keyboard up (`kb`) it makes room.
 */
export const VoiceField = ({ kb = false }: { kb?: boolean }) => (kb ? null : <Bridge own cls="vfieldh" fill={() => voiceField()} />);

/** A note at the foot for a moment ("Write an example first"). */
export function pathNote(text: string) {
  if (state.pathNote) clearTimeout(state.pathNote.tid);
  state.pathNote = { text, tid: setTimeout(() => { state.pathNote = null; refreshPath(); }, 1900) };
  refreshPath();
}

export function Toast() {
  const n = state.pathNote;
  return <div class={"ptoast" + (n ? " on" : "")} role="status">{n ? n.text : ""}</div>;
}

/** What a station says, by its look and its symbol (the Design Lab's stops, 1 Nov): a step inside an exercise is medium (the size of the gray stations that wait for it): `ex` leads to a question
 *  (gold, a pen: write the examples), `chk` checks or shows the verdict (ink, a list of ticks). The stations that go on are big, each in the color of what it leads to: `q` the next
 *  question (gold, a question mark), `def` a new term and `rep` a term that comes again (teal, a plus and a turning arrow: path/stop.tsx), `up` a new stage (green, two chevrons up: path/next.ts).
 *  A station that goes back (`back`) is a slate ring with a chevron. */
export type StationKind = "ex" | "chk" | "up" | "q" | "def" | "rep";
/** The symbol inside the diamond of a station, by what it says. */
const SYMBOL: Record<StationKind | "back", string> = { ex: "pen", chk: "tasks", up: "ups", q: "q", def: "plus", rep: "redo", back: "back" };
/** The station at the edge, ready: pull it up over the curb, tap it, or press Enter (after a while, and now and then, the top edges of its diamond lift off it as a chevron pointing up, as the sign that it can be taken: 07-path-station.css; `wait`: while Claude works on the
 *  answer above it, it waits muted, its cue at rest, still there to take but not calling you on). Taking it plays the ride
 *  (take.ts) unless `back`: it goes back to what was there, and the step is simply there. `keep`: it stands on the page above a keyboard (the Check under the last
 *  example), so touching it keeps the field's focus until it is taken, and then the keyboard goes. `kind`: what it says (above). */
export function Station({ name, hint = "", act, arrive = false, back = false, keep = false, scan, kind, wait = false }: { name: string; hint?: string; act: () => void; arrive?: boolean; back?: boolean; keep?: boolean; scan?: () => ScanPlan | null; kind?: StationKind; wait?: boolean }) {
  const pull = useContext(PullCtx); pull.act = act; pull.rides = !back; pull.scan = scan || null;
  const g = useRef<{ y0: number; moved: boolean; past: boolean } | null>(null);
  const away = (took: boolean) => { const a = document.activeElement as HTMLElement | null; if (took && keep && a && a.classList.contains("pfield")) a.blur(); };
  if (wait) hint = "Claude is still at work";
  const k = back ? "back" : kind || "q";
  return <button type="button" class={"stn" + (keep ? " inl" : "") + (k === "ex" || k === "chk" ? " stk" : "") + " stk-" + k + (wait ? " cwait" : "")} id="stn" aria-label={name + (hint ? ": " + hint : "")}
    onMouseDown={keep ? (e) => e.preventDefault() : undefined}
    onPointerDown={(e) => { g.current = { y0: e.clientY, moved: false, past: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pull.to(0); }}
    onPointerMove={(e) => { const s = g.current; if (!s) return; const raw = Math.max(0, s.y0 - e.clientY); if (raw > 4) s.moved = true; s.past = pull.to(s.moved ? raw : 0); }}
    onPointerUp={() => { const s = g.current; if (!s) return; g.current = null; away(pull.end(!s.moved || s.past)); }}
    onPointerCancel={() => { g.current = null; pull.end(false); }}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); away(pull.take()); } }}
    onClick={(e) => { if (e.detail === 0) away(pull.take()); }}>
    <span class={"go" + (arrive ? " arrive" : "")}><span class="mk"><Icon n={SYMBOL[k]} /></span></span><span class="gol"><b>{name}</b>{hint ? <small>{hint}</small> : null}</span>
  </button>;
}
/** The station, not ready yet: gray; it pulls a little, far enough to show why (in a note above the foot, clear of the finger), then stops. */
export function PreStation({ name, hint }: { name: string; hint: string }) {
  const pull = useContext(PullCtx); pull.act = null;
  const g = useRef<{ y0: number; moved: boolean } | null>(null);
  return <button type="button" class="stn pre" id="stnp" aria-disabled="true" aria-label={name + ": " + hint}
    onPointerDown={(e) => { g.current = { y0: e.clientY, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const el = e.currentTarget as HTMLElement; el.classList.add("peek"); pull.to(0); }}
    onPointerMove={(e) => { const s = g.current; if (!s) return; const raw = Math.max(0, s.y0 - e.clientY); if (raw > 4) s.moved = true; pull.to(raw); }}
    onPointerUp={() => { const s = g.current; if (!s) return; g.current = null; pull.end(false, !s.moved); }}
    onPointerCancel={() => { g.current = null; pull.end(false); }}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pull.peek(e.currentTarget as HTMLElement); } }}>
    <span class="go pre" /><span class="gol pre"><b>{name}</b></span><span class="phint" aria-hidden="true">{hint}</span>
  </button>;
}
/** The path turns aside to what comes next: the page leaves to the left, `act` takes the step, the next page arrives. */
export function turnAside(main: Element | null, act: () => void) {
  if (!main) { act(); return; }
  main.classList.add("turning");
  setTimeout(() => {
    main.classList.remove("turning"); act();
    main.classList.add("arriving"); setTimeout(() => main.classList.remove("arriving"), 420);
  }, 260);
}
/**
 * A side station: a small station on a dashed line that runs off the right edge. Slide it left past the line's reach and let go (or press
 * Enter); a tap only nudges it ("slide it left"), except the tutor's, which a tap takes too.
 */
export function SideStation({ kind, label, act, disabled = false }: { kind: "skip" | "why"; label?: string; act: () => void; disabled?: boolean }) {
  const tutor = kind === "why", idle = label || (tutor ? "Explain" : "Skip");
  const box = useRef<HTMLDivElement>(null), hint = useRef<HTMLSpanElement>(null), g = useRef<{ x0: number; moved: boolean; past: boolean } | null>(null);
  const set = (d: number) => box.current && box.current.style.setProperty("--dx", d + "px");
  const say = (t: string) => { if (hint.current) hint.current.textContent = t; };
  // the path turns aside to what comes next, unless the step only asks first (a skip with something entered: the page stays as it is under the question)
  const turn = () => { if (tutor || skipAsks()) act(); else turnAside(box.current && box.current.closest(".main"), act); };
  const end = () => {
    const s = g.current, b = box.current; if (!s || !b) return; g.current = null; b.classList.remove("dragging");
    if (s.past) { set(0); b.classList.remove("past"); say(idle); turn(); return; }
    set(0); b.classList.remove("past"); say(idle);
    if (!s.moved && tutor) { act(); return; }
    if (!s.moved) { b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge"); say("slide it left"); setTimeout(() => { b.classList.remove("nudge"); say(idle); }, 1400); }
  };
  // the whole station takes the slide (the diamond, its word and the dashed line), not the diamond alone
  return <div ref={box} class={"sides" + (tutor ? " ws" : "")} aria-disabled={disabled ? "true" : undefined}
    onPointerDown={(e) => { g.current = { x0: e.clientX, moved: false, past: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); box.current?.classList.add("dragging"); }}
    onPointerMove={(e) => {
      const s = g.current; if (!s || !box.current) return;
      const raw = Math.max(0, s.x0 - e.clientX); if (raw > 4) s.moved = true;
      set(-(raw < SLIDE ? raw : SLIDE + (raw - SLIDE) * 0.3));
      const p = raw >= SLIDE;
      if (p !== s.past) { s.past = p; box.current.classList.toggle("past", p); if (p) bump(); }
      say(p ? (tutor ? "let go to open" : "let go to " + idle.toLowerCase()) : "slide left");
    }}
    onPointerUp={end}
    onPointerCancel={() => { g.current = null; set(0); box.current?.classList.remove("dragging", "past"); say(idle); }}>
    <span class="skl" aria-hidden="true" /><span class="skh" aria-hidden="true" ref={hint}>{idle}</span>
    <button type="button" class="skd" aria-label={tutor ? "Explanation by Claude: slide it left, tap it, or press Enter" : (label || "Skip") + ": slide it left, or press Enter"}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}>
      <span class="sd"><Icon n={tutor ? "q" : "skip"} /></span>
    </button>
  </div>;
}

/** Skip as a side station at the foot, where the look still puts it there (`skipAt: foot`, on hold); else Skip is the icon under the favorites mark (parts.tsx, SkipMark). */
export const SkipSide = () => (currentLook().skipAt === "foot" ? <SideStation kind="skip" act={skipPair} /> : null);

/** The foot: the station, and at its right what goes beside it (a side station). While the keyboard is up there is no foot. Above it, the line of a version that waits (path/news.tsx). */
export function Foot({ children, aux, none = false }: { children?: ComponentChildren; aux?: ComponentChildren; none?: boolean }) {
  return <><FootPin /><footer class={"foot" + (none ? " nostation" : "")}>{children || <span />}<span class="aux">{aux}</span></footer></>;
}
