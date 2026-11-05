// One step back along the Path: the thread is pulled down at its top, and the result the learner has just left (practice/trail.ts) comes back. It is the pull of a station over its curb
// (gesture.ts) turned the other way: the page follows the finger with the same friction, sticks at the curb, goes over it with the same knock, and follows freely. Above the page, in the room
// the pull makes, the thread runs up to a station that says where it goes ("Previous pair"); over the curb it fills in, as a station does when it can be taken. Let go over the curb and the
// page leaves downward (the way the push of push.ts leaves through the top) and the result comes in from above; let go short of it and the page goes back. There is nothing to tap: only the pull,
// by a finger at the top of the page or by the wheel or trackpad scrolling up past it. The page stays where it is while a keyboard, a panel or a question is open over it, and in Sprint.
import { useContext } from "preact/hooks";
import { render, top0 } from "../shell/render.js";
import { moves } from "../shell/motion.js";
import { cue } from "../sound/play.ts";
import { canGoBack, goBack, previousName } from "../practice/trail.ts";
import { bump, curbMove, curbNew, knock, type Curb, type Pull } from "./gesture.ts";
import { currentLook } from "./look.ts";
import { PullCtx } from "./shell.tsx";
import { Icon } from "./ui.tsx";

/** How long the page takes to leave and the result to come in (ms), how far above the screen's foot the leaving page goes on, and how far the pull must go before the touch counts as one (px). */
const LEAVE = 340, ARRIVE = 400, SLACK = 70, START = 6;
const into = (u: number) => u ** 2.2;

/** The station above the page, brought into view as the thread is pulled down (it is drawn only where a step back is there to be taken; the stylesheet shows it while the pull is on). */
export function BackHead() {
  useContext(PullCtx);
  if (!canGoBack()) return null;
  return <div class="bkhead" aria-hidden="true">
    <span class="stn stk stk-back bkst"><span class="go"><span class="mk"><Icon n="above" /></span></span><span class="gol"><b>{previousName()}</b></span></span>
  </div>;
}

/** What is over the page, or stands in its way, so that it can not be pulled: a panel, the roadmap, a dialog, the keyboard's layout, the strip of the examples. */
const covered = (r: HTMLElement) => !!r.querySelector(".psheet.on,.road.on,.pdlg,.pstrip.open") || r.classList.contains("kbup");

/** The page's own pull marks, cleared (the scroll `sc` may be one that is gone from the page by now: it is cleared all the same). */
function clear(sc: HTMLElement | null) {
  if (!sc) return;
  sc.classList.remove("bkpull", "bkover", "bkrest"); sc.style.removeProperty("--bk");
}

/**
 * The ride of the step back, from `dy` px down: the page goes on down and out, the step is taken (`goBack`, and the result is drawn), and the result comes in from above. Under reduced motion and
 * the look's `ride: plain` the result is simply there. The Pull is busy meanwhile, so that nothing else is taken.
 */
function ride(sc: HTMLElement, pull: Pull, dy: number): void {
  const still = !moves() || currentLook().ride === "plain", H = sc.clientHeight + SLACK;
  pull.busy = true;
  let done = false;
  const land = () => {
    if (done) return; done = true;
    const went = goBack();
    clear(sc);
    if (went) { render(); top0(); cue("next"); }
    const sc2 = document.querySelector<HTMLElement>("#path .main .pscroll"); clear(sc2);
    const pc = sc2 && sc2.querySelector<HTMLElement>(".pathc");
    if (went && !still && pc && pc.animate) pc.animate([{ translate: `0 ${-H}px`, opacity: 0.2 }, { translate: "0 0", opacity: 1 }], { duration: ARRIVE, easing: "cubic-bezier(.2,.8,.3,1)" });
    pull.busy = false;
  };
  if (still) { land(); return; }
  const t0 = performance.now();
  sc.classList.add("bkrun");
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / LEAVE);
    sc.style.setProperty("--bk", (dy + (H - dy) * into(u)).toFixed(1) + "px");
    if (u < 1) requestAnimationFrame(step); else { sc.classList.remove("bkrun"); land(); }
  };
  requestAnimationFrame(step);
  setTimeout(() => { sc.classList.remove("bkrun"); land(); }, LEAVE + 700);
}

/**
 * Wires the pull to the page's own scroll `sc` (scroll.tsx), next to the pull past its end (gesture.ts, wireScroll). A finger that drags down while the page is at its top, or a wheel or
 * trackpad scroll that starts there, pulls the thread; a drag that scrolls the page up to its top does not count what scrolled it: the pull begins from where the page got there.
 * Returns the unwiring.
 */
export function wireBack(sc: HTMLElement, pull: Pull): () => void {
  let c: Curb | null = null, dy = 0, sLast = 0, wLast = 0, wArmed = false, wRaw = 0, wT: ReturnType<typeof setTimeout> | undefined;
  let y0 = 0, x0 = 0, live = false, tRaw = 0, touching = false;
  const root = () => sc.closest<HTMLElement>(".pa");
  const can = () => { const r = root(); return !!r && !pull.busy && sc.scrollTop <= 0 && canGoBack() && !covered(r); };
  const move = (raw: number) => {
    const k = c || (c = curbNew()), ev = curbMove(k, raw);
    if (ev) { bump(ev === "over" ? undefined : 6); if (ev === "over") knock(); sc.classList.toggle("bkover", k.over); }
    dy = k.y; sc.classList.add("bkpull"); sc.classList.remove("bkrest"); sc.style.setProperty("--bk", dy.toFixed(1) + "px");
  };
  /** The pull is let go: over the curb the step is taken, else the page goes back to its place. */
  const end = () => {
    const k = c; c = null; if (!k) return;
    if (k.over && can()) { ride(sc, pull, dy); return; }
    sc.classList.add("bkrest"); sc.classList.remove("bkover"); sc.style.setProperty("--bk", "0px");
    setTimeout(() => { if (!c) clear(sc); }, 320);
  };
  const scroll = () => { sLast = performance.now(); };
  const wheel = (e: WheelEvent) => {
    if (!can()) { if (wRaw > 0) { wRaw = 0; end(); } return; }
    const now = performance.now(), fresh = now - wLast > 140; wLast = now;
    if (fresh && wRaw <= 0) wArmed = now - sLast > 140;
    if (!wArmed || (e.deltaY >= 0 && wRaw <= 0)) return;
    e.preventDefault();
    wRaw = Math.max(0, wRaw - e.deltaY * (e.deltaMode === 1 ? 10 : 0.3));
    if (wRaw > 0) move(wRaw); else end();
    clearTimeout(wT); wT = setTimeout(() => { wRaw = 0; wArmed = false; end(); }, 240);
  };
  const tstart = (e: TouchEvent) => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; live = false; tRaw = 0; touching = e.touches.length === 1; };
  const tmove = (e: TouchEvent) => {
    if (!touching) return;
    const y = e.touches[0].clientY, x = e.touches[0].clientX;
    if (!can() || e.touches.length > 1) { if (c) end(); y0 = y; x0 = x; live = false; return; }     // the page is not at its top (or not free): the pull starts from where it gets there
    const down = y - y0;
    if (!live) { if (down >= START && down > Math.abs(x - x0) * 1.2) live = true; else { if (down < 0) y0 = y; return; } }
    tRaw = Math.max(0, (down - START) * 0.8);
    e.preventDefault();
    if (tRaw > 0) move(tRaw); else { end(); live = false; y0 = y; }
  };
  const tend = () => { touching = false; live = false; if (c) end(); };
  sc.addEventListener("scroll", scroll, { passive: true });
  sc.addEventListener("wheel", wheel, { passive: false });
  sc.addEventListener("touchstart", tstart, { passive: true });
  sc.addEventListener("touchmove", tmove, { passive: false });
  sc.addEventListener("touchend", tend); sc.addEventListener("touchcancel", tend);
  return () => {
    clearTimeout(wT);
    sc.removeEventListener("scroll", scroll); sc.removeEventListener("wheel", wheel); sc.removeEventListener("touchstart", tstart);
    sc.removeEventListener("touchmove", tmove); sc.removeEventListener("touchend", tend); sc.removeEventListener("touchcancel", tend);
  };
}
