// The Path's pulls, as the lab has them. The station at the edge is pulled up past its reach to be taken (a tap takes it too; a bump in the hand says
// it is past); one that is not ready yet rises a little, says why, and stops. Pulling the path itself on past its end only tightens the thread to the
// station: it never takes it. A side station (Skip) slides left past its reach. One tension is shared by all of them: each Path draw keeps one Pull,
// on its root.
const LINE = 64, STOP = 26;
/** How far the path itself can pull the thread: just short of the station's reach. */
const TIGHT = LINE - 8;
export const SLIDE = 96;

/** The hand's feel of crossing the reach: a bump, as of a curb under a wheel (a firm thud, then a lighter one just after), not a buzz. */
const bump = () => { try { if (navigator.vibrate) navigator.vibrate([26, 55, 14]); } catch { /* no haptics */ } };
export { bump };

export class Pull {
  root: HTMLElement | null = null;
  /** what taking the station does now (set on every draw) */
  act: (() => void) | null = null;
  past = false;
  peekT: ReturnType<typeof setTimeout> | undefined;

  private q<T extends HTMLElement = HTMLElement>(sel: string) { return this.root ? this.root.querySelector<T>(sel) : null; }

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
    const foot = el.closest<HTMLElement>(".foot"), riser = this.q(".riser"), pc = this.q(".pscroll");
    const dy = stn ? (raw < LINE ? raw : LINE + (raw - LINE) * 0.35) : Math.min(STOP, raw < 12 ? raw : 12 + (raw - 12) * 0.3);
    const past = !!stn && raw >= LINE;
    el.classList.add("dragging"); if (sp && raw > 0) { sp.classList.add("peek"); clearTimeout(this.peekT); }
    el.style.transform = `translateY(${-dy}px)`;
    if (path && pc) { pc.style.transition = "none"; pc.style.transform = `translateY(${-dy}px)`; }
    const fh = foot ? foot.offsetHeight : 0;
    if (riser) { riser.style.bottom = fh + "px"; riser.style.height = raw > 0 ? dy + "px" : "0"; riser.classList.toggle("pre", !stn); }
    this.root.style.setProperty("--pull", Math.min(1, dy / LINE).toFixed(3)); this.root.classList.toggle("pulling", raw > 0);
    if (past !== this.past) { this.past = past; if (past) bump(); }
    return past;
  }
  /** The pull let go: the station goes back, and is taken when `go`. A tap on a station that is not ready bumps it. */
  end(go: boolean, tapped = false) {
    const stn = this.q("#stn"), sp = this.q("#stnp"), el = stn || sp, riser = this.q(".riser"), pc = this.q(".pscroll");
    if (el) { el.classList.remove("dragging"); el.style.transform = ""; }
    if (pc && pc.style.transform) { pc.style.transition = "transform .3s cubic-bezier(.2,.9,.3,1.25)"; pc.style.transform = ""; setTimeout(() => { pc.style.transition = ""; }, 320); }
    if (riser) riser.style.height = "0";
    if (this.root) { this.root.classList.remove("pulling"); this.root.style.setProperty("--pull", "0"); }
    this.past = false;
    if (sp && !go) this.peek(sp, tapped);
    if (go && this.act) this.act();
  }
  /** Whether the path may be pulled past its end now: nothing over it, no keyboard, the strip folded, a station there. */
  canPull() {
    const r = this.root; if (!r) return false;
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
