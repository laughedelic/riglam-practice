// One step back along the Path: the thread is pulled down by the top node of the question, and the result the learner has just left (practice/trail.ts) comes back. It is the pull of a
// station over its curb (gesture.ts) turned the other way: the page follows the finger (or the mouse) with the same friction, sticks at the curb, goes over it with the same knock, and
// follows freely. The top node is the first node on the question's thread: the heading of its first step, or the pair at the head of a result. In the examples the pair and its
// relation are folded into a heading above the page (examples.tsx, Strip): the heading is the top of the thread, so it comes down with the page, and the station stands above it, never
// under it. A pull on the folded heading unfolds it, as before; the heading unfolded is pulled down again to go back. Above the thread, in the room the pull makes, the thread runs up
// to a station that says where it goes ("Previous pair"); over the curb it fills in, as a station does when it can be taken. Let go over the curb and the page leaves downward (the
// way the push of push.ts leaves through the top) and the result comes in from above; let go short of it and the page goes back. There is nothing to tap.
// Scrolling does not go back, as scrolling past the end does not take the Next station: a finger that drags the page itself down at its top, or the wheel or trackpad scrolling up
// past it, brings the page down a little, resisting, and the station peeks above it as a hint, never to its curb. The page stays where it is while a keyboard, a panel or a question
// is open over it, and in Sprint.
// The challenges' page has a thread of its own to pull (path/challenge.tsx): while some challenges are done and behind its top, the small stop there that
// counts them is the top node, and the station above says how many ("2 done"). Let go over the curb, the page stays and they come down from behind the
// top, folded, above the ones that wait (`unroll`). Pressed, the stop pulls by itself (`pullByItself`).
import { useContext } from "preact/hooks";
import { state } from "../state.js";
import { render, top0 } from "../shell/render.js";
import { moves } from "../shell/motion.js";
import { cue } from "../sound/play.ts";
import { canGoBack, goBack, previousName } from "../practice/trail.ts";
import { challengePast } from "../practice/challenge.ts";
import { bump, curbMove, curbNew, knock, type Curb, type Pull } from "./gesture.ts";
import { currentLook } from "./look.ts";
import { PullCtx } from "./shell.tsx";
import { Icon } from "./ui.tsx";

/** How long the page takes to leave and the result to come in (ms), how far below the screen's foot the leaving page goes on, and how far the pull must go before the touch counts as one (px). */
const LEAVE = 340, ARRIVE = 400, SLACK = 70, START = 6;
/** The hint of a scroll past the top: the part of the pull the page follows, and how far it comes down at most (px), well short of the curb. */
const RESIST = 0.45, HINT = 26;
/** How long the challenges brought back take to come down from behind the top (ms), and how far a press pulls the thread by itself, over the curb (px). */
const UNROLL = 480, PRESS = 58;
const into = (u: number) => u ** 2.2;

/**
 * What the pull takes, where there is something to take: on the challenges' page the challenges done and behind its top (practice/challenge.ts),
 * which come down above the page (`unroll`); elsewhere the step back of the trail (practice/trail.ts), which the page leaves for.
 */
function target(): { name: string; take: () => boolean; unroll: boolean } | null {
  const p = challengePast();
  if (p) return { name: p.name, take: p.take, unroll: true };
  return canGoBack() ? { name: previousName(), take: goBack, unroll: false } : null;
}

/** The station above the thread, brought into view as it is pulled down (it is drawn only where a step back is there to be taken; the stylesheet shows it while the pull is on). */
export function BackHead() {
  useContext(PullCtx);
  const t = target(); if (!t) return null;
  return <div class="bkhead" aria-hidden="true">
    <span class="stn stk stk-back bkst"><span class="go"><span class="mk"><Icon n="above" /></span></span><span class="gol"><b>{t.name}</b></span></span>
  </div>;
}

/** What is over the page so that it can not be pulled: a panel, the roadmap, a dialog, the keyboard's layout. */
const covered = (r: HTMLElement) => !!r.querySelector(".psheet.on,.road.on,.pdlg") || r.classList.contains("kbup");
/** What a touch or a click begins on and goes on with: a button, a field or a link is not a handle of the thread. */
const control = (t: EventTarget | null) => t instanceof Element && !!t.closest("button,a,input,textarea,select,label,[role=button]");

/**
 * Where a pull begins (`t` the element under the finger at `y`), in `main`: `node` on the top node of the page (or in the room above it), `strip` on the examples' heading unfolded,
 * `page` anywhere else on the page (it only hints); null where it is none of them (the folded heading pulls itself open, examples.tsx).
 */
type Grip = "node" | "strip" | "page";
function grip(main: HTMLElement, sc: HTMLElement, t: EventTarget | null, y: number): Grip | null {
  if (!(t instanceof Element)) return null;
  const strip = main.querySelector<HTMLElement>(".pstrip");
  if (strip) {
    if (strip.contains(t)) return strip.classList.contains("open") && !control(t) ? "strip" : null;
    return sc.contains(t) && !strip.classList.contains("open") ? "page" : null;
  }
  if (!sc.contains(t)) return null;
  const past = sc.querySelector<HTMLElement>(".pathc > .chpast");
  if (past) return past.contains(t) ? "node" : "page";      // the challenges' page: the stop of those done, a button that is also the handle
  const n = sc.querySelector<HTMLElement>(".pathc > .sx.first > :is(.sechead,.pn)");
  if (n && !control(t) && t.closest(".sx.first") === n.parentElement && y <= n.getBoundingClientRect().bottom) return "node";
  return "page";
}

/** The pull's marks, cleared from `main`. */
function clear(main: HTMLElement) {
  main.classList.remove("bkpull", "bkover", "bkrest", "bkhint", "bkrun");
  main.style.removeProperty("--bk"); main.style.removeProperty("--bkt");
}

/**
 * The ride of the step back, from `dy` px down: the page (with the examples' heading) goes on down and out, the step is taken (`goBack`, and the result is drawn), and the result comes
 * in from above. Under reduced motion and the look's `ride: plain` the result is simply there. The Pull is busy meanwhile, so that nothing else is taken.
 */
function ride(main: HTMLElement, pull: Pull, dy: number): void {
  const tg = target();
  if (!tg) { clear(main); return; }
  if (tg.unroll) { unroll(main, pull, tg.take); return; }
  const still = !moves() || currentLook().ride === "plain", H = main.clientHeight + SLACK;
  pull.busy = true;
  let done = false;
  const land = () => {
    if (done) return; done = true;
    const u = state.ui as { pstrip?: boolean } | null;
    if (u && u.pstrip) u.pstrip = false;      // the heading of the examples is folded again for when Next comes back to them
    const went = tg.take();
    clear(main);
    if (went) { render(); top0(); cue("next"); }
    const pc = document.querySelector<HTMLElement>("#path .main .pscroll .pathc");
    if (went && !still && pc && pc.animate) pc.animate([{ translate: `0 ${-H}px`, opacity: 0.2 }, { translate: "0 0", opacity: 1 }], { duration: ARRIVE, easing: "cubic-bezier(.2,.8,.3,1)" });
    pull.busy = false;
  };
  if (still) { land(); return; }
  const t0 = performance.now();
  main.classList.add("bkrun"); main.classList.remove("bkrest");
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / LEAVE);
    main.style.setProperty("--bk", (dy + (H - dy) * into(u)).toFixed(1) + "px");
    if (u < 1) requestAnimationFrame(step); else land();
  };
  requestAnimationFrame(step);
  setTimeout(land, LEAVE + 700);
}

/**
 * The challenges done come down from behind the top: what stood first under them stays where it is on the screen, and they come in above it (the
 * thread that was pulled down settles with them). Under reduced motion they are simply there.
 */
function unroll(main: HTMLElement, pull: Pull, take: () => boolean): void {
  const sc = main.querySelector<HTMLElement>(".pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  const top = (n: Element) => n.getBoundingClientRect().top - (sc as HTMLElement).getBoundingClientRect().top;
  const anchor = pc && (pc.children[1] || pc.lastElementChild), before = anchor ? top(anchor) : 0;
  const went = take();
  clear(main);
  if (!went || !sc || !pc) { render(); return; }
  render(); sc.scrollTop = 0; cue("next");
  const at = () => (anchor && anchor.isConnected ? top(anchor) : before);      // (the page keeps its node: what came is drawn above it)
  let after = at();
  const vis = Math.round(sc.clientHeight * 0.6);
  if (after > vis) { sc.scrollTop = after - vis; after = at(); }
  if (!moves() || currentLook().ride === "plain" || !pc.animate) return;
  pull.busy = true;
  const free = () => { pull.busy = false; };
  pc.animate([{ transform: "translateY(" + (before - after) + "px)" }, { transform: "translateY(0)" }], { duration: UNROLL, easing: "cubic-bezier(.2,.8,.25,1)" }).finished.then(free, free);
}

/**
 * A press on the handle of the pull (the challenges' stop of those done): the thread is pulled down over its curb by itself, and let go. Under reduced
 * motion what it takes is simply there. Left meanwhile (another page, a panel over this one), the press takes nothing: least of all the step back of
 * what is on screen then.
 */
export function pullByItself(main: HTMLElement, pull: Pull): void {
  const sc = main.querySelector<HTMLElement>(".pscroll"), r = main.closest<HTMLElement>(".pa"), tg = target();
  if (!sc || !r || pull.busy || !tg || !tg.unroll || covered(r) || main.classList.contains("bkpull")) return;
  if (!moves() || currentLook().ride === "plain") { ride(main, pull, 0); return; }
  pull.busy = true; sc.scrollTop = 0;
  main.style.setProperty("--bkt", sc.offsetTop + "px");
  main.classList.add("bkpull", "bkrest"); main.style.setProperty("--bk", "0.01px");
  requestAnimationFrame(() => requestAnimationFrame(() => { main.classList.add("bkover"); main.style.setProperty("--bk", PRESS + "px"); }));
  setTimeout(() => {
    pull.busy = false;
    const now = target();
    if (!main.isConnected || covered(r) || !now || !now.unroll) { clear(main); return; }
    ride(main, pull, PRESS);
  }, 470);
}

/**
 * Wires the pull back to the page's own scroll `sc` (scroll.tsx) and the part of the screen around it (`.main`, where the examples' heading is), next to the pull past its end
 * (gesture.ts, wireScroll). A finger that drags the top node down while the page is at its top pulls the thread, and so does the mouse; the examples' heading unfolded is pulled the same
 * way. A finger on the rest of the page, or the wheel or the trackpad, only hints. Returns the unwiring.
 */
export function wireBack(sc: HTMLElement, pull: Pull): () => void {
  const main = sc.closest<HTMLElement>(".main");
  if (!main) return () => {};
  /** the pull under way: where it began, whether it has begun (`live`), the curb it goes over (none for a hint), how far the page is down */
  let g: { grip: Grip; y0: number; x0: number; live: boolean; mouse: boolean; curb: Curb | null } | null = null, dy = 0;
  let sLast = 0, wLast = 0, wArmed = false, wRaw = 0, wT: ReturnType<typeof setTimeout> | undefined, restT: ReturnType<typeof setTimeout> | undefined;
  const root = () => main.closest<HTMLElement>(".pa");
  const can = (k: Grip) => { const r = root(); return !!r && !pull.busy && !!target() && !covered(r) && (k === "strip" || sc.scrollTop <= 0); };
  /** The page `y` px down, the station above it: over a curb for a pull, resisting and short of it for a hint. */
  const show = (y: number, hint: boolean) => {
    if (!main.classList.contains("bkpull")) {
      const first = main.querySelector<HTMLElement>(".pstrip") || sc;
      main.style.setProperty("--bkt", first.offsetTop + "px");
    }
    clearTimeout(restT);
    dy = y; main.classList.add("bkpull"); main.classList.remove("bkrest"); main.classList.toggle("bkhint", hint);
    main.style.setProperty("--bk", dy.toFixed(1) + "px");
  };
  const pullTo = (raw: number) => {
    const s = g; if (!s) return;
    const k = s.curb || (s.curb = curbNew()), ev = curbMove(k, raw);
    if (ev) { bump(ev === "over" ? undefined : 6); if (ev === "over") knock(); main.classList.toggle("bkover", k.over); }
    show(k.y, false);
  };
  /** The page goes back to its place. */
  const rest = () => {
    if (!main.classList.contains("bkpull")) return;
    dy = 0; main.classList.add("bkrest"); main.classList.remove("bkover"); main.style.setProperty("--bk", "0px");
    clearTimeout(restT); restT = setTimeout(() => { if (!g || !g.live) clear(main); }, 320);
  };
  /** The click that ends a drag of the mouse is not a press of the handle (the challenges' stop of those done). */
  const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
  /** The pull is let go: over the curb the step is taken, else the page goes back to its place. */
  const end = () => {
    const s = g; g = null; if (!s) return;
    if (s.mouse && s.live) { addEventListener("click", swallow, { capture: true, once: true }); setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0); }
    if (s.curb && s.curb.over && can(s.grip)) { clearTimeout(restT); ride(main, pull, dy); return; }
    rest();
  };
  /** A move of the finger or the mouse to `y`: the pull begins once it goes down by START (more down than across) with the page at its top, and follows it from there. */
  const drive = (e: Event, x: number, y: number) => {
    const s = g; if (!s) return;
    if (!can(s.grip)) { if (s.live) rest(); s.y0 = y; s.x0 = x; s.live = false; s.curb = null; return; }     // not at its top yet (or not free): the pull starts from where it gets there
    const down = y - s.y0;
    if (!s.mouse && !e.cancelable) { if (s.live) rest(); g = null; return; }                                   // the page is scrolling under the finger: it is not taken from it
    if (down > 0 && s.grip !== "strip") e.preventDefault();          // at the top a drag down is the thread's from its first move: the page does not bounce under it
    if (!s.live) { if (down >= START && down > Math.abs(x - s.x0) * 1.2) s.live = true; else { if (down < 0) s.y0 = y; return; } }
    e.preventDefault();
    const raw = Math.max(0, (down - START) * 0.8);
    if (raw <= 0) { rest(); s.live = false; s.curb = null; s.y0 = y; return; }
    if (s.grip === "page") show(Math.min(HINT, raw * RESIST), true); else pullTo(raw);
  };

  const scroll = () => { sLast = performance.now(); };
  const wheel = (e: WheelEvent) => {
    const strip = main.querySelector<HTMLElement>(".pstrip"), t = e.target;
    const here = t instanceof Node && (sc.contains(t) || !!(strip && strip.contains(t)));
    if (!can("page") || !here || (strip && strip.classList.contains("open"))) { if (wRaw > 0) { wRaw = 0; rest(); } return; }
    const now = performance.now(), fresh = now - wLast > 140; wLast = now;
    if (fresh && wRaw <= 0) wArmed = now - sLast > 140;
    if (!wArmed || (e.deltaY >= 0 && wRaw <= 0)) return;
    e.preventDefault();
    wRaw = Math.max(0, wRaw - e.deltaY * (e.deltaMode === 1 ? 10 : 0.3));
    if (wRaw > 0) show(Math.min(HINT, wRaw * RESIST), true); else rest();
    clearTimeout(wT); wT = setTimeout(() => { wRaw = 0; wArmed = false; rest(); }, 240);
  };
  const tstart = (e: TouchEvent) => {
    if (e.touches.length !== 1) { if (g) end(); g = null; return; }
    const t = e.touches[0], k = grip(main, sc, e.target, t.clientY);
    g = k ? { grip: k, y0: t.clientY, x0: t.clientX, live: false, mouse: false, curb: null } : null;
  };
  const tmove = (e: TouchEvent) => {
    if (!g || g.mouse) return;
    if (e.touches.length > 1) { end(); return; }
    drive(e, e.touches[0].clientX, e.touches[0].clientY);
  };
  const tend = () => { if (g && !g.mouse) end(); };
  // a mouse (or a pen) drags the top node or the heading unfolded; on the rest of the page it selects, and the wheel scrolls
  const pmove = (e: PointerEvent) => { if (g && g.mouse) drive(e, e.clientX, e.clientY); };
  const pup = () => { off(); if (g && g.mouse) end(); };
  const off = () => { removeEventListener("pointermove", pmove); removeEventListener("pointerup", pup); removeEventListener("pointercancel", pup); };
  const pdown = (e: PointerEvent) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const k = grip(main, sc, e.target, e.clientY);
    if (k !== "node" && k !== "strip") return;
    if (k === "node") e.preventDefault();       // the drag does not select the heading's words
    g = { grip: k, y0: e.clientY, x0: e.clientX, live: false, mouse: true, curb: null };
    off(); addEventListener("pointermove", pmove); addEventListener("pointerup", pup); addEventListener("pointercancel", pup);
  };
  sc.addEventListener("scroll", scroll, { passive: true });
  main.addEventListener("wheel", wheel, { passive: false });
  main.addEventListener("touchstart", tstart, { passive: true });
  main.addEventListener("touchmove", tmove, { passive: false });
  main.addEventListener("touchend", tend); main.addEventListener("touchcancel", tend);
  main.addEventListener("pointerdown", pdown);
  return () => {
    clearTimeout(wT); clearTimeout(restT); off();
    sc.removeEventListener("scroll", scroll); main.removeEventListener("wheel", wheel); main.removeEventListener("touchstart", tstart);
    main.removeEventListener("touchmove", tmove); main.removeEventListener("touchend", tend); main.removeEventListener("touchcancel", tend);
    main.removeEventListener("pointerdown", pdown);
    if (!pull.busy) clear(main);
  };
}
