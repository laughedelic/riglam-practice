// The Path's pulls, as the lab has them. The station at the edge is pulled up past its reach to be taken (a tap takes it too; a bump in the hand says
// it is past); one that is not ready yet rises a little, says why, and stops. The thread stays attached to the station and shortens as it comes up
// (--lift: the foot's stub gets shorter, then the riser hides the thread under the station). Pulling the path itself on past its end lifts the station
// only a little, as if it resisted (never past the foot's top edge), and firms the thread (before a choice it stays dotted, its fade filled in): it never takes the station. A side station (Skip) slides left past its reach. One tension
// is shared by all of them: each Path draw keeps one Pull, on its root. A station that can be taken is pulled over a curb (below), and taking it plays the
// ride of take.ts.
import { state } from "../state.js";
import { cue } from "../sound/play.ts";
import { currentLook } from "./look.ts";
import { clearPush, holdPush, playPush } from "./push.ts";
import { playScan, type ScanPlan } from "./scan.tsx";
import { canTake, foldPage, playTake } from "./take.ts";

const LINE = 64, STOP = 26;
/** How hard the station resists the path's pull: the station rises this part of it. */
const RESIST = 0.5;
/** The bump: one short knock (a longer pulse, or two of them, is felt as a buzz; the Vibration API has no strength to set). */
const HIT = 12;
/** How far the path itself can pull the thread: just short of the station's reach. */
const TIGHT = LINE - 8;
/** A station the hand can not take here (one not ready, or any while the path is pulled) stops this far below the foot's top edge: its diamond does not cross it. */
const SILL = 4;
export const SLIDE = 96;

/**
 * Whether a knock is the feedback of a finger: what touched the page last was a finger or a pen (`state.hand`, set in index.tsx). A mouse or a trackpad has its own click under the hand, so the
 * Path adds nothing to it. Before anything has touched the page the device's main pointer says (a phone or tablet has a coarse one).
 */
const touching = () => { if (state.hand) return state.hand === "touch"; try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } };
/** The hand's feel of crossing the reach: a bump, as of a curb under a wheel (one short knock, no buzz). */
const bump = (ms = HIT) => { try { if (navigator.vibrate && touching()) navigator.vibrate(ms); } catch { /* no haptics */ } };
export { bump };
/** The sound of a station taken, for a mouse or the keyboard: a finger has the bump in the hand instead (`touching`). */
const knock = () => { if (!touching()) cue("knock"); };

/**
 * The curb a station is pulled over, as the lab has it. Under it the finger moves the station less and less, and at it the station sticks; once the finger has pressed on
 * far enough it goes over with a knock, catches up, and follows freely. Pulled back it is free down to the curb, sticks a little (less than on the way up) and goes back
 * under with a lighter tick. `raw` is how far the finger is above where it started.
 */
const CURB = { T: 42, STALL: 7, P: 22, PB: 10, POP: 14, GAIN: 3.08, FLOOR: 0.1 };
export interface Curb { y: number; over: boolean; press: number; down: number; boost: number; last: number }
export const curbNew = (): Curb => ({ y: 0, over: false, press: 0, down: 0, boost: 0, last: 0 });
/** Moves the station for a finger `raw` px up; says when it went over the curb or back under it. */
export function curbMove(c: Curb, raw: number): "" | "over" | "back" {
  const k = CURB, d = raw - c.last; c.last = raw; const was = c.over;
  if (!c.over) {
    if (d > 0) {
      c.y = Math.min(k.T, c.y + d * Math.max(k.FLOOR, 1 - (c.y / k.T) ** k.GAIN));
      if (c.y > k.T - k.STALL) c.press += d;
      if (c.press >= k.P) { c.over = true; c.boost = k.POP; c.down = 0; }
    } else {
      c.y = Math.max(0, c.y + d * (1 - 0.55 * (c.y / k.T) ** 3));
      c.press = Math.max(0, c.press + d * 1.5);
    }
  } else if (d > 0) {
    c.y += d * (c.boost > 0 ? 2.2 : 1); c.boost = Math.max(0, c.boost - d); c.down = 0;
  } else if (c.y > k.T + 3) {
    c.y = Math.max(k.T + 3, c.y + d);
  } else {
    c.y += d * 0.3; c.down -= d;
    if (c.down >= k.PB) { c.over = false; c.press = k.P * 0.4; c.y = Math.min(c.y, k.T); }
  }
  return was === c.over ? "" : c.over ? "over" : "back";
}

export class Pull {
  root: HTMLElement | null = null;
  /** what taking the station does now (set on every draw) */
  act: (() => void) | null = null;
  past = false;
  /** the station may play the ride when taken (the ones that go back do not) */
  rides = true;
  /** the pull of the station over its curb, and how high it is lifted now */
  curb: Curb | null = null;
  dy = 0;
  /** the ride is playing: nothing else is taken */
  busy = false;
  /** the layout of the keyboard stays while the ride plays (the field is let go at its start, the keyboard goes, and the page must not change under the ride); `after` sets it right once the step is taken */
  hold = false;
  after: (() => void) | null = null;
  /** the verdicts the Check of the examples marks as it slides up (scan.tsx), set by that station on every draw; null elsewhere */
  scan: (() => ScanPlan | null) | null = null;
  peekT: ReturnType<typeof setTimeout> | undefined;
  /** under the look's `ride: push` the page follows the station over its curb (push.ts): the stop of that following, and whether the page is pushed or folded by it now */
  private pusher: (() => void) | null = null;
  private pushed = false;

  private q<T extends HTMLElement = HTMLElement>(sel: string) { return this.root ? this.root.querySelector<T>(sel) : null; }

  /** The page follows the station over the curb (`on`) or goes back to its place (the Check of the examples does not push: its scanner passes over the page as it is). */
  private follow(on: boolean) {
    if (!this.root || currentLook().ride !== "push" || (this.scan && currentLook().check !== "ride")) return;
    this.unfollow();
    if (on) { this.pusher = holdPush(this.root); this.pushed = true; } else if (this.pushed) { this.pushed = false; clearPush(this.root); }
  }
  /** The following stops (what it has done stays). */
  private unfollow() { if (this.pusher) { this.pusher(); this.pusher = null; } }

  /** A station that is not ready rises a little and shows why. */
  peek(el: HTMLElement | null, bump = true) {
    if (!el) return;
    el.classList.add("peek");
    if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    clearTimeout(this.peekT); this.peekT = setTimeout(() => el.classList.remove("peek", "bump"), 1700);
  }
  /** The pull, `raw` pixels up (from the station, or the path past its end when `path`); whether it is past the line. */
  to(raw: number, path = false): boolean {
    const stn = this.q("#stn"), sp = this.q("#stnp"), el = stn || sp; if (!el || !this.root) return false;
    if (this.busy) return this.past;
    const foot = el.closest<HTMLElement>(".foot"), riser = this.q(".riser");
    const curb = !path && !!stn && this.rides && canTake(this.root);
    let dy: number, past: boolean;
    if (curb) {
      const c = this.curb || (this.curb = curbNew()), ev = curbMove(c, raw);
      dy = c.y; past = c.over;
      if (ev) { bump(ev === "over" ? HIT : 6); if (ev === "over") knock(); foldPage(this.root, c.over); this.follow(c.over); }
    } else {
      dy = path ? raw * RESIST : stn ? (raw < LINE ? raw : LINE + (raw - LINE) * 0.35) : Math.min(STOP, raw < 12 ? raw : 12 + (raw - 12) * 0.3);
      if (path || !stn) dy = Math.min(dy, this.room(el, foot));
      past = !!stn && raw >= LINE;
    }
    this.dy = dy;
    el.classList.add("dragging"); if (sp && raw > 0) { sp.classList.add("peek"); clearTimeout(this.peekT); }
    el.style.transform = `translateY(${-dy}px)`;
    // a station on the page itself (the Check under the last example, while the keyboard is up) has no foot under it: nothing of the riser's ground is needed
    if (riser) { riser.style.bottom = (foot ? foot.offsetHeight : 0) + "px"; riser.style.display = foot ? "" : "none"; }
    this.root.style.setProperty("--lift", dy.toFixed(1) + "px");
    this.root.style.setProperty("--pull", Math.min(1, path ? raw / TIGHT : dy / LINE).toFixed(3)); this.root.classList.toggle("pulling", raw > 0);
    // before the way is chosen (a station not ready) the thread ahead stays dotted: the pull fills its fade in, down to the station, and does not firm it
    this.root.classList.toggle("pullpre", raw > 0 && !stn);
    if (past !== this.past) { this.past = past; if (past && !curb) { bump(); knock(); } }
    return past;
  }
  /** How far the station `el` can rise in its foot before its diamond reaches the foot's top edge (less `SILL`); measured from where it rests, whatever it is lifted now. */
  private room(el: HTMLElement, foot: HTMLElement | null): number {
    const go = el.querySelector<HTMLElement>(".go"); if (!foot || !go) return Infinity;
    let y = 0, n: HTMLElement | null = el;
    while (n && n !== foot) { y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    if (n !== foot) return Infinity;
    return Math.max(0, y + go.getBoundingClientRect().top - el.getBoundingClientRect().top - SILL);
  }
  /**
   * The pull let go: the station goes back, and is taken when `go` (the answer: whether it was). A tap on a station that is not ready bumps it. A station taken without the pull over the curb
   * (a tap, Enter) knocks as it is taken, the commitment a pull has already felt as it crossed the curb.
   */
  end(go: boolean, tapped = false): boolean {
    if (this.busy) return false;
    if (go && this.act && !this.past) { bump(); knock(); }
    const stn = this.q("#stn"), sp = this.q("#stnp"), el = stn || sp, riser = this.q(".riser");
    if (go && stn && this.act && this.rides && this.root && canTake(this.root)) {
      const act = this.act;
      this.busy = true; this.hold = true;
      const go = () => { this.hold = false; act(); if (this.after) this.after(); }, settle = () => { this.busy = false; this.curb = null; this.past = false; this.dy = 0; if (this.hold) { this.hold = false; if (this.after) this.after(); } };
      let plan: ScanPlan | null;
      const look = currentLook();
      try { plan = this.scan && look.check !== "ride" ? this.scan() : null; } catch { plan = null; }
      // with the keyboard's layout up the scan opens the page first: the field is let go and the layout is the page's again at its start
      const root = this.root, open = plan && root.classList.contains("kbup") ? () => { this.hold = false; const a = document.activeElement; if (a instanceof HTMLElement && a.classList.contains("pfield")) a.blur(); if (this.after) this.after(); } : null;
      this.unfollow(); this.pushed = false;
      if (plan) playScan(root, stn, plan, go, settle, open, look.check === "morph");
      else if (look.ride === "push") playPush(root, stn, this.dy, go, settle, { recoil: look.land === "recoil" });
      else playTake(root, stn, this.dy, go, settle);
      return true;
    }
    this.unfollow();
    if (this.curb) { if (this.curb.over) { foldPage(this.root, false); if (this.pushed) clearPush(this.root); } this.curb = null; }
    this.pushed = false;
    this.dy = 0;
    if (el) { el.classList.remove("dragging"); el.style.transform = ""; }
    if (riser) riser.style.display = "";
    if (this.root) { this.root.classList.remove("pulling", "pullpre"); this.root.style.setProperty("--pull", "0"); this.root.style.setProperty("--lift", "0px"); }
    this.past = false;
    if (sp && !go) this.peek(sp, tapped);
    if (go && this.act) { this.act(); return true; }
    return false;
  }
  /**
   * A step that a choice takes, not a station (Pervasions' relation: the answers are checked as it is picked), taken with the scan: the scanner leaves the foot's station, marks what was
   * answered on its way up (`plan`), and becomes the result's node, and `act` takes the step. False when there is no scan to play (the caller takes the step itself).
   */
  scanPick(plan: () => ScanPlan | null, act: () => void): boolean {
    const root = this.root, stn = this.q("#stnp, #stn"), look = currentLook();
    if (this.busy || !root || !stn || look.check === "ride" || !canTake(root)) return false;
    let p: ScanPlan | null; try { p = plan(); } catch { p = null; }
    if (!p) return false;
    this.busy = true; this.unfollow(); this.pushed = false;
    playScan(root, stn, p, act, () => { this.busy = false; this.curb = null; this.past = false; this.dy = 0; }, null, look.check === "morph");
    return true;
  }
  /** The station taken without a pull (a tap, Enter): the ride, or the step at once. */
  take(): boolean { if (this.busy || !this.act) return false; return this.end(true); }
  /** Whether the path may be pulled past its end now: nothing over it, no keyboard, the strip folded, a station there. */
  canPull() {
    const r = this.root; if (!r || this.busy) return false;
    return !r.querySelector(".psheet.on,.road.on,.pdlg") && !r.classList.contains("kbup") && !r.querySelector(".pstrip.open") && !!r.querySelector("#stn,#stnp");
  }
  /**
   * Wires the path's own scroll. A fresh wheel or trackpad scroll that starts at the end, or a finger that pushes on once the path is at its end,
   * tightens the thread to the station, which firms up and comes up a little; it never reaches the station's reach, so scrolling can not take the
   * station by accident (only the station itself does that). A flick's momentum never pulls. Returns the unwiring.
   */
  wireScroll(sc: HTMLElement, onScroll: () => void): () => void {
    let sLast = 0, wLast = 0, wArmed = false, wPull = 0, wT: ReturnType<typeof setTimeout> | undefined;
    let tLast: number | null = null, tPull = 0;
    const atEnd = () => sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
    const scroll = () => { sLast = performance.now(); onScroll(); };
    const wheel = (e: WheelEvent) => {
      if (!this.canPull()) return;
      const now = performance.now(), fresh = now - wLast > 140; wLast = now;
      if (fresh && wPull <= 0) wArmed = atEnd() && now - sLast > 140;
      if (!wArmed || (e.deltaY <= 0 && wPull <= 0)) return;
      e.preventDefault();
      wPull = Math.max(0, wPull + e.deltaY * (e.deltaMode === 1 ? 12 : 0.4));
      this.to(Math.min(wPull, TIGHT), true);
      clearTimeout(wT); wT = setTimeout(() => { wPull = 0; wArmed = false; this.end(false); }, 240);
    };
    const tstart = (e: TouchEvent) => { tLast = e.touches[0].clientY; tPull = 0; };
    const tmove = (e: TouchEvent) => {
      if (tLast === null || !this.canPull()) return;
      const y = e.touches[0].clientY, d = tLast - y; tLast = y;
      if (!atEnd() || (d <= 0 && tPull <= 0)) return;
      tPull = Math.max(0, tPull + d * 0.8);
      if (tPull > 0) { e.preventDefault(); this.to(Math.min(tPull, TIGHT), true); } else this.end(false);
    };
    const tend = () => { if (tLast === null) return; tLast = null; if (tPull > 0) { tPull = 0; this.end(false); } };
    const tcancel = () => { tLast = null; if (tPull > 0) { tPull = 0; this.end(false); } };
    sc.addEventListener("scroll", scroll, { passive: true });
    sc.addEventListener("wheel", wheel, { passive: false });
    sc.addEventListener("touchstart", tstart, { passive: true });
    sc.addEventListener("touchmove", tmove, { passive: false });
    sc.addEventListener("touchend", tend); sc.addEventListener("touchcancel", tcancel);
    return () => {
      clearTimeout(wT);
      sc.removeEventListener("scroll", scroll); sc.removeEventListener("wheel", wheel); sc.removeEventListener("touchstart", tstart);
      sc.removeEventListener("touchmove", tmove); sc.removeEventListener("touchend", tend); sc.removeEventListener("touchcancel", tcancel);
    };
  }
}
